import time
import uuid

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config.config import settings
from .config.database import get_db
from .models import Profile, UserRole

security = HTTPBearer(auto_error=False)

# Projeto usado historicamente pela equipe; SUPABASE_URL tem precedência.
_SUPABASE_URL_PADRAO = "https://fbwhpontyucoifhehysn.supabase.co"
SUPABASE_JWKS_URL = (
    f"{(settings.supabase_url or _SUPABASE_URL_PADRAO).rstrip('/')}"
    "/auth/v1/.well-known/jwks.json"
)

# As chaves públicas mudam raramente: evita uma requisição ao Supabase por chamada.
_JWKS_TTL_SEGUNDOS = 600
_jwks_cache: dict = {"chaves": None, "expira_em": 0.0}


async def _obter_jwks(forcar: bool = False) -> dict:
    agora = time.monotonic()
    if not forcar and _jwks_cache["chaves"] and _jwks_cache["expira_em"] > agora:
        return _jwks_cache["chaves"]
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(SUPABASE_JWKS_URL)
        response.raise_for_status()
        jwks = response.json()
    _jwks_cache.update(chaves=jwks, expira_em=agora + _JWKS_TTL_SEGUNDOS)
    return jwks


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> uuid.UUID:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais de autenticação não fornecidas",
        )

    token = credentials.credentials

    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        jwks = await _obter_jwks()
        key = next(
            (key for key in jwks["keys"] if key.get("kid") == kid),
            None,
        )
        if key is None:
            # Rotação de chaves: tenta uma vez com o JWKS atualizado.
            jwks = await _obter_jwks(forcar=True)
            key = next(
                (key for key in jwks["keys"] if key.get("kid") == kid),
                None,
            )

        if key is None:
            raise JWTError("Chave pública correspondente ao kid não encontrada")


        payload = jwt.decode(
            token,
            key,
            algorithms=["ES256"],
            audience="authenticated",
        )

    except (JWTError, httpx.HTTPError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )

    sub = payload.get("sub")

    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sem identificador de usuário",
        )

    try:
        return uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificador de usuário inválido",
        )


async def get_current_profile(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Profile:
    result = await db.execute(
        select(Profile).where(Profile.id == user_id)
    )

    profile = result.scalar_one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado para este usuário",
        )

    return profile


async def require_admin(
    profile: Profile = Depends(get_current_profile),
) -> Profile:
    if profile.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores",
        )

    return profile


async def require_consumer(
    profile: Profile = Depends(get_current_profile),
) -> Profile:
    if profile.role != UserRole.consumidor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a consumidores",
        )

    return profile


async def require_lojista(
    profile: Profile = Depends(get_current_profile),
) -> Profile:
    if profile.role != UserRole.lojista:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a lojistas",
        )

    return profile
