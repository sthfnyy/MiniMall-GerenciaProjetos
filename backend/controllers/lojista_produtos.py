import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.database import get_db
from ..models import Categoria, Loja, Produto
from ..schemas_produtos import ProdutoCreateIn, ProdutoOut, ProdutoUpdateIn
from .lojista_loja import get_lojista_loja

router = APIRouter(prefix="/lojista/produtos", tags=["lojista - produtos"])


async def buscar_produto_da_loja(
    produto_id: uuid.UUID,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
) -> Produto:
    try:
        resultado = await db.execute(
            select(Produto).where(
                Produto.id == produto_id,
                Produto.loja_id == loja.id,
            )
        )
        produto = resultado.scalar_one_or_none()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Falha ao consultar produto") from exc
    if produto is None:
        raise HTTPException(status_code=404, detail="Produto não encontrado nesta loja")
    return produto


async def validar_categoria(db: AsyncSession, categoria_id: uuid.UUID) -> None:
    try:
        resultado = await db.execute(
            select(Categoria).where(Categoria.id == categoria_id)
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Falha ao consultar categoria") from exc
    if resultado.scalar_one_or_none() is None:
        raise HTTPException(status_code=422, detail="Categoria não encontrada")


@router.post("", response_model=ProdutoOut, status_code=status.HTTP_201_CREATED)
async def criar_produto(
    payload: ProdutoCreateIn,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    await validar_categoria(db, payload.categoria_id)
    agora = datetime.now(UTC)
    produto = Produto(
        id=uuid.uuid4(),
        loja_id=loja.id,  
        **payload.model_dump(),
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(produto)
    try:
        await db.commit()
        await db.refresh(produto)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Não foi possível salvar o produto") from exc
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Falha ao criar produto") from exc
    return produto


@router.get("", response_model=list[ProdutoOut])
async def listar_meus_produtos(
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    try:
        resultado = await db.execute(
            select(Produto)
            .where(Produto.loja_id == loja.id)
            .order_by(Produto.criado_em.desc(), Produto.id)
        )
        return resultado.scalars().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Falha ao listar produtos") from exc


@router.get("/{produto_id}", response_model=ProdutoOut)
async def consultar_meu_produto(produto: Produto = Depends(buscar_produto_da_loja)):
    return produto


@router.patch("/{produto_id}", response_model=ProdutoOut)
async def editar_produto(
    payload: ProdutoUpdateIn,
    produto: Produto = Depends(buscar_produto_da_loja),
    db: AsyncSession = Depends(get_db),
):
    alteracoes = payload.model_dump(exclude_unset=True)
    if "categoria_id" in alteracoes:
        await validar_categoria(db, alteracoes["categoria_id"])
    if not alteracoes:
        return produto
    for campo, valor in alteracoes.items():
        setattr(produto, campo, valor)
    produto.atualizado_em = datetime.now(UTC)
    try:
        await db.commit()
        await db.refresh(produto)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Não foi possível salvar o produto") from exc
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Falha ao editar produto") from exc
    return produto


@router.delete("/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_produto(
    produto: Produto = Depends(buscar_produto_da_loja),
    db: AsyncSession = Depends(get_db),
):
    try:
        await db.delete(produto)
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Falha ao excluir produto") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
