from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import (
    Loja,
    PontosTransacao,
    Profile,
    TipoTransacaoPontos,
)
from ..schemas import (
    ConsumerPontosMovimentacaoOut,
    ConsumerPontosOut,
    ConsumerPontosSaldoLojaOut,
)
from ..services.avaliacoes import origem_movimentacao

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
            select(PontosTransacao, Loja.nome_loja)
            .outerjoin(Loja, Loja.id == PontosTransacao.loja_id)
            .where(
                PontosTransacao.usuario_id == profile.id
            )
            .order_by(
                PontosTransacao.criado_em.desc()
            )
        )

        linhas = result.all()

    except SQLAlchemyError as exc:
        raise HTTPException(
            500, "Não foi possível consultar os pontos"
        ) from exc

    saldos: dict = {}
    nomes: dict = {}
    historico = []

    for item, nome_loja in linhas:
        valor = (
            item.quantidade
            if item.tipo == TipoTransacaoPontos.credito
            else -item.quantidade
        )

        saldos[item.loja_id] = (
            saldos.get(item.loja_id, 0) + valor
        )
        nomes[item.loja_id] = nome_loja
        historico.append(
            ConsumerPontosMovimentacaoOut(
                id=item.id,
                loja_id=item.loja_id,
                tipo=item.tipo,
                quantidade=item.quantidade,
                avaliacao_id=item.avaliacao_id,
                descricao=item.descricao,
                criado_em=item.criado_em,
                nome_loja=nome_loja,
                origem=origem_movimentacao(item.descricao, item.avaliacao_id),
            )
        )

    return ConsumerPontosOut(
        saldo_total=sum(saldos.values()),
        saldos_por_loja=[
            ConsumerPontosSaldoLojaOut(
                loja_id=loja_id,
                saldo=saldo,
                nome_loja=nomes.get(loja_id),
            )
            for loja_id, saldo in saldos.items()
        ],
        historico=historico,
    )
