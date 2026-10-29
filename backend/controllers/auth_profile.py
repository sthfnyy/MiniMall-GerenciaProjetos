import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth import get_current_profile
from ..config.config import settings
from ..models import Profile

router = APIRouter(prefix="/auth", tags=["Autenticação"])


class CadastroIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome_completo: str = Field(min_length=2, max_length=150)
    email: str = Field(min_length=5, max_length=254)
    senha: str = Field(min_length=8)

    @field_validator("nome_completo")
    @classmethod
    def validar_nome(cls, nome: str) -> str:
        nome = nome.strip()
        if len(nome) < 2:
            raise ValueError("Nome completo muito curto")
        return nome


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


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def registrar(dados: CadastroIn):
    resposta = await _requisitar_auth(
        "signup",
        {
            "email": dados.email.strip().lower(),
            "password": dados.senha,
            "data": {"nome_completo": dados.nome_completo},
        },
    )
    if resposta.is_error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível realizar o cadastro. Verifique os dados informados.",
        )

    try:
        resultado = resposta.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Resposta inválida da autenticação") from exc
    sessao = resultado.get("session") or {}
    tem_sessao = bool(resultado.get("access_token") or sessao.get("access_token"))

    return {
        "mensagem": "Solicitação de cadastro recebida. Verifique seu e-mail se for necessário confirmar a conta.",
        "confirmacao_email_pendente": not tem_sessao,
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
