"""Solicitação de confirmação de compra pelo consumidor.

Status no banco: contato_realizado (pendente), compra_confirmada e
compra_nao_reconhecida (rejeitada). A confirmação libera a avaliação da loja.
"""

import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import IntencaoCompra, Loja, Produto, Profile, StatusIntencaoCompra, StatusLoja
from ..schemas import (
    ConsumerIntencaoCompraCreate,
    ConsumerIntencaoCompraOut,
    IntencaoLojaOut,
    IntencaoProdutoOut,
)

router = APIRouter(
    prefix="/consumidor/intencoes-compra",
    tags=["consumidor - confirmação de compra"],
)


def _saida(intencao: IntencaoCompra, titulo: str, nome_loja: str) -> ConsumerIntencaoCompraOut:
    return ConsumerIntencaoCompraOut(
        id=intencao.id,
        codigo=intencao.codigo,
        produto=IntencaoProdutoOut(id=intencao.produto_id, titulo=titulo),
        loja=IntencaoLojaOut(id=intencao.loja_id, nome=nome_loja),
        status=intencao.status,
        criado_em=intencao.criado_em,
        decidido_em=intencao.decidido_em,
    )


@router.get("", response_model=list[ConsumerIntencaoCompraOut])
async def listar_intencoes_compra(
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        resultado = await db.execute(
            select(IntencaoCompra, Produto.titulo, Loja.nome_loja)
            .join(Produto, Produto.id == IntencaoCompra.produto_id)
            .join(Loja, Loja.id == IntencaoCompra.loja_id)
            .where(IntencaoCompra.consumidor_id == profile.id)
            .order_by(IntencaoCompra.criado_em.desc())
        )
        linhas = resultado.all()
    except SQLAlchemyError as exc:
        raise HTTPException(500, "Não foi possível consultar suas compras") from exc
    return [_saida(intencao, titulo, nome_loja) for intencao, titulo, nome_loja in linhas]


async def gerar_codigo_unico(db: AsyncSession) -> str:
    for _ in range(10):
        codigo = f"MM-{secrets.token_hex(2).upper()}"
        existente = await db.execute(
            select(IntencaoCompra.id).where(IntencaoCompra.codigo == codigo)
        )
        if existente.scalar_one_or_none() is None:
            return codigo
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Não foi possível gerar o código da solicitação",
    )


@router.post(
    "",
    response_model=ConsumerIntencaoCompraOut,
    status_code=status.HTTP_201_CREATED,
)
async def solicitar_confirmacao_compra(
    payload: ConsumerIntencaoCompraCreate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        linha = (
            await db.execute(
                select(Produto, Loja)
                .join(Loja, Loja.id == Produto.loja_id)
                .where(Produto.id == payload.produto_id)
            )
        ).one_or_none()
        if linha is None:
            raise HTTPException(404, "Produto não encontrado")
        produto, loja = linha
        if produto.loja_id != payload.loja_id:
            raise HTTPException(422, "O produto não pertence à loja informada")
        if loja.status != StatusLoja.aprovada:
            raise HTTPException(404, "Loja não encontrada")

        existentes = (
            await db.execute(
                select(IntencaoCompra).where(
                    IntencaoCompra.consumidor_id == profile.id,
                    IntencaoCompra.loja_id == payload.loja_id,
                    IntencaoCompra.status.in_([
                        StatusIntencaoCompra.contato_realizado,
                        StatusIntencaoCompra.compra_confirmada,
                    ]),
                )
            )
        ).scalars().all()
        if any(item.status == StatusIntencaoCompra.compra_confirmada for item in existentes):
            raise HTTPException(
                409, "Sua compra nesta loja já foi confirmada. Você já pode avaliá-la."
            )
        if any(item.produto_id == payload.produto_id for item in existentes):
            raise HTTPException(
                409, "Já existe uma solicitação pendente para este produto. Aguarde a resposta da loja."
            )

        intencao = IntencaoCompra(
            id=uuid.uuid4(),
            consumidor_id=profile.id,
            loja_id=payload.loja_id,
            produto_id=payload.produto_id,
            codigo=await gerar_codigo_unico(db),
            status=StatusIntencaoCompra.contato_realizado,
            criado_em=datetime.now(UTC),
        )
        db.add(intencao)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Não foi possível reservar um código único. Tente novamente.") from exc
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(500, "Não foi possível registrar a solicitação") from exc

    return _saida(intencao, produto.titulo, loja.nome_loja)
