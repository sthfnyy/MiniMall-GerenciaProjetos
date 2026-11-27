"""Avaliações recebidas pela loja do lojista."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.database import get_db
from ..models import Avaliacao, Loja, Profile
from ..schemas import AvaliacaoFotoOut, LojistaAvaliacaoOut
from ..services.avaliacoes import fotos_por_avaliacao
from .lojista_loja import get_lojista_loja

router = APIRouter(
    prefix="/lojista/avaliacoes",
    tags=["lojista - avaliações"],
)


@router.get("", response_model=list[LojistaAvaliacaoOut])
async def listar_avaliacoes_minha_loja(
    loja: Loja = Depends(get_lojista_loja),
    db: AsyncSession = Depends(get_db),
):
    """Lista exclusivamente as avaliações recebidas pela loja do lojista autenticado."""
    try:
        resultado = await db.execute(
            select(Avaliacao, Profile.nome_completo)
            .outerjoin(Profile, Avaliacao.usuario_id == Profile.id)
            .where(Avaliacao.loja_id == loja.id)
            .order_by(Avaliacao.criado_em.desc())
        )
        linhas = resultado.all()
        fotos = await fotos_por_avaliacao(db, [avaliacao.id for avaliacao, _ in linhas])
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível consultar as avaliações da loja",
        ) from exc

    return [
        LojistaAvaliacaoOut(
            id=avaliacao.id,
            loja_id=avaliacao.loja_id,
            nota=avaliacao.nota,
            comentario=avaliacao.comentario,
            foto_url=avaliacao.foto_url or "",
            criado_em=avaliacao.criado_em,
            consumidor_nome=nome_completo or "Consumidor",
            fotos=[AvaliacaoFotoOut.model_validate(foto) for foto in fotos.get(avaliacao.id, [])],
        )
        for avaliacao, nome_completo in linhas
    ]
