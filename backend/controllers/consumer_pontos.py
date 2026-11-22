
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import (
    PontosTransacao,
    Profile,
    TipoTransacaoPontos,
)
from ..schemas import (
    ConsumerPontosOut,
    ConsumerPontosSaldoLojaOut,
)

router = APIRouter(
    prefix="/consumidor/pontos",
    tags=["consumidor - pontos"],
)


@router.get("", response_model=ConsumerPontosOut)
async def consultar_pontos(
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(PontosTransacao)
            .where(
                PontosTransacao.usuario_id == profile.id
            )
            .order_by(
                PontosTransacao.criado_em.desc()
            )
        )

        historico = result.scalars().all()

    except SQLAlchemyError as exc:
        raise HTTPException(
            500, "Não foi possível consultar os pontos"
        ) from exc

    saldos = {}

    for item in historico:
        valor = (
            item.quantidade
            if item.tipo == TipoTransacaoPontos.credito
            else -item.quantidade
        )

        saldos[item.loja_id] = (
            saldos.get(item.loja_id, 0) + valor
        )

    return ConsumerPontosOut(
        saldo_total=sum(saldos.values()),
        saldos_por_loja=[
            ConsumerPontosSaldoLojaOut(
                loja_id=loja_id,
                saldo=saldo,
            )
            for loja_id, saldo in saldos.items()
        ],
        historico=historico,
    )
