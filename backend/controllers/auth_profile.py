import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_profile
from ..config.config import settings
from ..config.database import get_db
from ..models import Profile, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Autenticação"])

_EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class CadastroIn(BaseModel):
    """Cadastro público. Admin NUNCA é aceito aqui (RN03)."""

    model_config = ConfigDict(extra="forbid")

    nome_completo: str = Field(min_length=2, max_length=150)
    email: str = Field(min_length=5, max_length=254)
    senha: str = Field(min_length=8, max_length=72)
    perfil: Literal["consumidor", "lojista"]

    @field_validator("nome_completo")
    @classmethod
    def validar_nome(cls, nome: str) -> str:
        nome = nome.strip()
        if len(nome) < 2:
            raise ValueError("Nome completo muito curto")
        return nome

    @field_validator("email")
    @classmethod
    def validar_email(cls, email: str) -> str:
        email = email.strip().lower()
        if not _EMAIL_REGEX.match(email):
            raise ValueError("Informe um e-mail válido")
        return email


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    senha: str


def _configurar_supabase() -> tuple[str, str]:
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Auth não configurado",
        )
    return settings.supabase_url.rstrip("/"), settings.supabase_anon_key


def _configurar_supabase_admin() -> tuple[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cadastro indisponível: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend",
        )
    return settings.supabase_url.rstrip("/"), settings.supabase_service_role_key


async def _requisitar_auth(
    caminho: str,
    payload: dict,
    *,
    parametros: dict | None = None,
) -> httpx.Response:
    url, chave_publica = _configurar_supabase()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resposta = await client.post(
                f"{url}/auth/v1/{caminho}",
                params=parametros,
                headers={"apikey": chave_publica},
                json=payload,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Serviço de autenticação indisponível",
        ) from exc

    if resposta.status_code == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas. Tente novamente mais tarde.",
        )
    if resposta.status_code >= 500:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha no serviço de autenticação",
        )
    return resposta


async def _requisitar_admin(metodo: str, caminho: str, payload: dict | None = None) -> httpx.Response:
    """Chama a Admin API do Supabase. A service_role nunca sai do backend."""
    url, chave = _configurar_supabase_admin()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            return await client.request(
                metodo,
                f"{url}/auth/v1/admin/{caminho}",
                headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
                json=payload,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Serviço de autenticação indisponível",
        ) from exc


def _email_ja_cadastrado(resposta: httpx.Response) -> bool:
    try:
        corpo = resposta.json()
    except ValueError:
        corpo = {}
    texto = " ".join(
        str(corpo.get(chave) or "") for chave in ("msg", "message", "error_code", "code", "error")
    ).lower()
    return "already" in texto or "exists" in texto or "email_exists" in texto


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def registrar(dados: CadastroIn, db: AsyncSession = Depends(get_db)):
    """Cria a conta no Supabase Auth e define o perfil escolhido (consumidor ou lojista).

    A conta é criada já confirmada pela Admin API e o perfil recebe o papel
    validado no backend.
    """
    resposta = await _requisitar_admin(
        "POST",
        "users",
        {
            "email": dados.email,
            "password": dados.senha,
            "email_confirm": True,
            "user_metadata": {"nome_completo": dados.nome_completo},
        },
    )

    if resposta.status_code == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas. Tente novamente mais tarde.",
        )
    if resposta.status_code >= 500:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha no serviço de autenticação",
        )
    if resposta.is_error:
        if _email_ja_cadastrado(resposta) or resposta.status_code == 422:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este e-mail já está cadastrado.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível realizar o cadastro. Verifique os dados informados.",
        )

    try:
        user_id = uuid.UUID(str(resposta.json()["id"]))
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Resposta inválida da autenticação") from exc

    papel = UserRole(dados.perfil)
    agora = datetime.now(UTC)
    try:
        # O trigger on_auth_user_created já cria o perfil como consumidor;
        # aqui o papel escolhido é aplicado (ou o perfil é criado, se faltar).
        perfil = (
            await db.execute(select(Profile).where(Profile.id == user_id))
        ).scalar_one_or_none()
        if perfil is None:
            db.add(Profile(
                id=user_id,
                role=papel,
                nome_completo=dados.nome_completo,
                criado_em=agora,
                atualizado_em=agora,
            ))
        else:
            perfil.role = papel
            perfil.nome_completo = dados.nome_completo
            perfil.atualizado_em = agora
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error("Falha ao gravar o perfil do novo usuário: %s", type(exc).__name__)
        # Compensação: não deixa uma conta sem o papel escolhido.
        try:
            await _requisitar_admin("DELETE", f"users/{user_id}")
        except HTTPException:
            logger.error("Não foi possível desfazer a criação do usuário no Auth")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível concluir o cadastro. Tente novamente.",
        ) from exc

    return {
        "mensagem": "Conta criada com sucesso.",
        "perfil": papel.value,
        "confirmacao_email_pendente": False,
    }


@router.post("/login")
async def entrar(dados: LoginIn):
    resposta = await _requisitar_auth(
        "token",
        {"email": dados.email.strip().lower(), "password": dados.senha},
        parametros={"grant_type": "password"},
    )
    if resposta.is_error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas ou e-mail ainda não confirmado",
        )

    try:
        resultado = resposta.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Resposta inválida da autenticação") from exc
    if not resultado.get("access_token"):
        raise HTTPException(status_code=502, detail="Sessão não retornada pelo serviço de autenticação")

    return {
        "access_token": resultado["access_token"],
        "refresh_token": resultado.get("refresh_token"),
        "token_type": resultado.get("token_type", "bearer"),
        "expires_in": resultado.get("expires_in"),
        "user": resultado.get("user"),
    }


@router.get("/me")
async def get_me(profile: Profile = Depends(get_current_profile)):
    return {
        "id": str(profile.id),
        "role": profile.role.value,
        "nome_completo": profile.nome_completo,
    }
