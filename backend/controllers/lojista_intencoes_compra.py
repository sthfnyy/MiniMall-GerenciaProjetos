"""Confirmação de compras pelo lojista."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.database import get_db
from ..models import IntencaoCompra, Loja, Produto, Profile, StatusIntencaoCompra
from ..schemas import (
    IntencaoConsumidorOut,
    IntencaoProdutoOut,
    LojistaIntencaoCompraOut,
    LojistaIntencaoCompraUpdate,
)
from .lojista_loja import get_lojista_loja

router = APIRouter(
    prefix="/lojista/intencoes-compra",
    tags=["lojista - confirmação de compra"],
)


def _saida(intencao: IntencaoCompra, titulo: str, consumidor_nome: str | None):
    return LojistaIntencaoCompraOut(
        id=intencao.id,
        codigo=intencao.codigo,
        produto=IntencaoProdutoOut(id=intencao.produto_id, titulo=titulo),
        consumidor=IntencaoConsumidorOut(
            id=intencao.consumidor_id,
            nome=consumidor_nome or "Consumidor",
        ),
        loja_id=intencao.loja_id,
        status=intencao.status,
        criado_em=intencao.criado_em,
        decidido_em=intencao.decidido_em,
    )


@router.get("", response_model=list[LojistaIntencaoCompraOut])
async def listar_intencoes_compra(
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    try:
        resultado = await db.execute(
            select(IntencaoCompra, Produto.titulo, Profile.nome_completo)
            .join(Produto, Produto.id == IntencaoCompra.produto_id)
            .outerjoin(Profile, Profile.id == IntencaoCompra.consumidor_id)
            .where(IntencaoCompra.loja_id == loja.id)
            .order_by(IntencaoCompra.criado_em.desc())
        )
        linhas = resultado.all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Não foi possível consultar as solicitações de compra",
        ) from exc
    return [_saida(intencao, titulo, nome) for intencao, titulo, nome in linhas]


@router.patch("/{intencao_id}", response_model=LojistaIntencaoCompraOut)
async def decidir_intencao_compra(
    intencao_id: uuid.UUID,
    payload: LojistaIntencaoCompraUpdate,
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    try:
        linha = (
            await db.execute(
                select(IntencaoCompra, Produto.titulo, Profile.nome_completo)
                .join(Produto, Produto.id == IntencaoCompra.produto_id)
                .outerjoin(Profile, Profile.id == IntencaoCompra.consumidor_id)
                .where(
                    IntencaoCompra.id == intencao_id,
                    # Um lojista só decide solicitações da própria loja (RNF13).
                    IntencaoCompra.loja_id == loja.id,
                )
                .with_for_update(of=IntencaoCompra)
            )
        ).one_or_none()
        if linha is None:
            raise HTTPException(404, "Solicitação não encontrada")
        intencao, titulo, consumidor_nome = linha
        if intencao.status != StatusIntencaoCompra.contato_realizado:
            raise HTTPException(409, "Esta solicitação já possui uma decisão definitiva")

        intencao.status = StatusIntencaoCompra(payload.status)
        intencao.decidido_em = datetime.now(UTC)
        intencao.decidido_por = loja.lojista_id
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Não foi possível registrar a decisão",
        ) from exc

    return _saida(intencao, titulo, consumidor_nome)
