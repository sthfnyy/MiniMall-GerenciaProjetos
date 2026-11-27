"""Vitrine pública de lojas e avaliações (sem autenticação).

A leitura é pública, expondo somente dados comerciais da loja e o nome abreviado do avaliador.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.database import get_db
from ..models import Avaliacao, Loja, Produto, Profile, StatusLoja
from ..schemas import AvaliacaoFotoOut, LojaPublicaOut, PublicAvaliacaoOut
from ..services.avaliacoes import fotos_por_avaliacao, nome_abreviado

router = APIRouter(prefix="/lojas", tags=["público - lojas"])


def _consulta_lojas_publicas():
    media = (
        select(func.avg(Avaliacao.nota))
        .where(Avaliacao.loja_id == Loja.id)
        .correlate(Loja)
        .scalar_subquery()
    )
    total_avaliacoes = (
        select(func.count(Avaliacao.id))
        .where(Avaliacao.loja_id == Loja.id)
        .correlate(Loja)
        .scalar_subquery()
    )
    total_produtos = (
        select(func.count(Produto.id))
        .where(Produto.loja_id == Loja.id, Produto.ativo.is_(True))
        .correlate(Loja)
        .scalar_subquery()
    )
    return (
        select(Loja, media, total_avaliacoes, total_produtos)
        .where(Loja.status == StatusLoja.aprovada)
    )


def _saida_loja(loja: Loja, media, total_avaliacoes, total_produtos) -> LojaPublicaOut:
    return LojaPublicaOut(
        id=loja.id,
        nome_loja=loja.nome_loja,
        descricao=loja.descricao,
        endereco_logradouro=loja.endereco_logradouro,
        endereco_numero=loja.endereco_numero,
        endereco_bairro=loja.endereco_bairro,
        endereco_cidade=loja.endereco_cidade,
        endereco_uf=loja.endereco_uf,
        endereco_cep=loja.endereco_cep,
        latitude=loja.latitude,
        longitude=loja.longitude,
        horario_funcionamento=loja.horario_funcionamento,
        whatsapp=loja.whatsapp,
        instagram=loja.instagram,
        facebook=loja.facebook,
        logo_url=loja.logo_url,
        media_avaliacoes=round(float(media), 1) if media is not None else None,
        total_avaliacoes=total_avaliacoes or 0,
        total_produtos=total_produtos or 0,
    )


@router.get("", response_model=list[LojaPublicaOut])
async def listar_lojas_publicas(db: AsyncSession = Depends(get_db)):
    """Lojas aprovadas, inclusive as que ainda não publicaram produtos."""
    try:
        linhas = (
            await db.execute(_consulta_lojas_publicas().order_by(Loja.nome_loja))
        ).all()
    except SQLAlchemyError as exc:
        raise HTTPException(500, "Não foi possível consultar as lojas") from exc
    return [_saida_loja(*linha) for linha in linhas]


@router.get("/{loja_id}", response_model=LojaPublicaOut)
async def consultar_loja_publica(loja_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        linha = (
            await db.execute(_consulta_lojas_publicas().where(Loja.id == loja_id))
        ).one_or_none()
    except SQLAlchemyError as exc:
        raise HTTPException(500, "Não foi possível consultar a loja") from exc
    if linha is None:
        # Lojas pendentes ou rejeitadas não são expostas (RN10/RN11).
        raise HTTPException(404, "Loja não encontrada")
    return _saida_loja(*linha)


@router.get("/{loja_id}/avaliacoes", response_model=list[PublicAvaliacaoOut])
async def listar_avaliacoes_publicas(loja_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        loja_status = (
            await db.execute(select(Loja.status).where(Loja.id == loja_id))
        ).scalar_one_or_none()
        if loja_status != StatusLoja.aprovada:
            raise HTTPException(404, "Loja não encontrada")
        linhas = (
            await db.execute(
                select(Avaliacao, Profile.nome_completo)
                .outerjoin(Profile, Profile.id == Avaliacao.usuario_id)
                .where(Avaliacao.loja_id == loja_id)
                .order_by(Avaliacao.criado_em.desc())
            )
        ).all()
        fotos = await fotos_por_avaliacao(db, [avaliacao.id for avaliacao, _ in linhas])
    except SQLAlchemyError as exc:
        raise HTTPException(500, "Não foi possível consultar as avaliações") from exc

    return [
        PublicAvaliacaoOut(
            id=avaliacao.id,
            loja_id=avaliacao.loja_id,
            nota=avaliacao.nota,
            comentario=avaliacao.comentario,
            criado_em=avaliacao.criado_em,
            consumidor_nome=nome_abreviado(nome_completo),
            fotos=[AvaliacaoFotoOut.model_validate(foto) for foto in fotos.get(avaliacao.id, [])],
        )
        for avaliacao, nome_completo in linhas
    ]
