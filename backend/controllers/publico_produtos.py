import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.database import get_db
from ..models import Categoria, Loja, Produto, StatusLoja
from ..schemas_produtos import ProdutoOut, ProdutoVitrineOut

router = APIRouter(prefix="/produtos", tags=["público - produtos"])


def _escapar_like(termo: str) -> str:
    return (
        termo.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


@router.get("", response_model=list[ProdutoVitrineOut])
async def buscar_produtos(
    q: str | None = Query(default=None, max_length=100),
    categoria_id: uuid.UUID | None = None,
    loja_id: uuid.UUID | None = None,
    preco_min: Decimal | None = Query(default=None, ge=0, max_digits=10, decimal_places=2),
    preco_max: Decimal | None = Query(default=None, ge=0, max_digits=10, decimal_places=2),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    if preco_min is not None and preco_max is not None and preco_min > preco_max:
        raise HTTPException(
            status_code=422,
            detail="preco_min não pode ser maior que preco_max",
        )

    consulta = (
        select(Produto, Loja.nome_loja, Categoria.nome)
        .join(Loja, Loja.id == Produto.loja_id)
        .join(Categoria, Categoria.id == Produto.categoria_id)
        .where(
            Produto.ativo.is_(True),
            Loja.status == StatusLoja.aprovada,
        )
    )

    termo = q.strip() if q else ""
    if termo:
        consulta = consulta.where(
            Produto.titulo.ilike(f"%{_escapar_like(termo)}%", escape="\\")
        )
    if categoria_id is not None:
        consulta = consulta.where(Produto.categoria_id == categoria_id)
    if loja_id is not None:
        consulta = consulta.where(Produto.loja_id == loja_id)
    if preco_min is not None:
        consulta = consulta.where(Produto.preco_base >= preco_min)
    if preco_max is not None:
        consulta = consulta.where(Produto.preco_base <= preco_max)

    consulta = consulta.order_by(Produto.titulo, Produto.id).limit(limit).offset(offset)

    try:
        resultado = await db.execute(consulta)
        linhas = resultado.all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Falha ao buscar produtos") from exc

    return [
        ProdutoVitrineOut(
            **ProdutoOut.model_validate(produto).model_dump(),
            nome_loja=nome_loja,
            nome_categoria=nome_categoria,
        )
        for produto, nome_loja, nome_categoria in linhas
    ]