
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config.database import async_session
from .controllers import lojista_loja

app = FastAPI(title="MiniMall API - Gerência de Projetos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lojista_loja.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/db-test")
async def db_test():
    async with async_session() as session:
        result = await session.execute(text("SELECT 1"))
        return {"database": result.scalar()}
