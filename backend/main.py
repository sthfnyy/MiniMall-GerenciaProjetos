from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .auth import require_admin
from .config.config import settings
from .config.database import async_session
from .controllers import (
    admin_categorias,
    admin_lojas,
    admin_moderacao,
    auth_profile,
    consumer_avaliacoes,
    consumer_favoritos,
    consumer_intencoes_compra,
    consumer_perfil,
    consumer_pontos,
    lojista_avaliacoes,
    lojista_intencoes_compra,
    lojista_loja,
    lojista_produtos,
    publico_lojas,
    publico_produtos,
)

app = FastAPI(title="MiniMall API - Gerência de Projetos")

# Origens explícitas (CORS_ORIGINS). A API autentica por header Bearer,
# portanto não depende de cookies entre origens.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_profile.router)
app.include_router(publico_produtos.router)
app.include_router(publico_lojas.router)
app.include_router(lojista_loja.router)
app.include_router(lojista_produtos.router)
app.include_router(lojista_avaliacoes.router)
app.include_router(lojista_intencoes_compra.router)
app.include_router(consumer_perfil.router)
app.include_router(consumer_avaliacoes.router)
app.include_router(consumer_intencoes_compra.router)
app.include_router(consumer_pontos.router)
app.include_router(consumer_favoritos.router)
app.include_router(admin_categorias.router)
app.include_router(admin_lojas.router)
app.include_router(admin_moderacao.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/db-test", include_in_schema=False)
async def db_test(_admin=Depends(require_admin)):
    """Diagnóstico de conexão com o banco, restrito a administradores."""
    async with async_session() as session:
        result = await session.execute(text("SELECT 1"))
        return {"database": result.scalar()}
