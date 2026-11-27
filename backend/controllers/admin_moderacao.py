import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..config.database import get_db
from ..models import Avaliacao, AvaliacaoFoto, Loja, Profile
from ..schemas import AdminAvaliacaoOut, AvaliacaoFotoOut
from ..services.avaliacoes import (
    estornar_pontos_da_avaliacao,
    estornar_pontos_da_foto,
    fotos_por_avaliacao,
    limpar_storage,
    remover_fotos_da_avaliacao,
)

router = APIRouter(prefix="/admin/moderacao", tags=["admin - moderação de avaliações"])


@router.get("/avaliacoes", response_model=list[AdminAvaliacaoOut])
async def listar_avaliacoes(
    loja_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    consulta = (
        select(Avaliacao, Profile.nome_completo, Loja.nome_loja)
        .outerjoin(Profile, Profile.id == Avaliacao.usuario_id)
        .outerjoin(Loja, Loja.id == Avaliacao.loja_id)
        .order_by(Avaliacao.criado_em.desc())
    )
    if loja_id is not None:
        consulta = consulta.where(Avaliacao.loja_id == loja_id)
    try:
        linhas = (await db.execute(consulta)).all()
        fotos = await fotos_por_avaliacao(db, [avaliacao.id for avaliacao, _, _ in linhas])
    except SQLAlchemyError as exc:
        raise HTTPException(500, "Não foi possível consultar as avaliações") from exc

    return [
        AdminAvaliacaoOut(
            id=avaliacao.id,
            loja_id=avaliacao.loja_id,
            usuario_id=avaliacao.usuario_id,
            nota=avaliacao.nota,
            comentario=avaliacao.comentario,
            foto_url=avaliacao.foto_url or "",
            criado_em=avaliacao.criado_em,
            consumidor_nome=consumidor_nome,
            loja_nome=loja_nome,
            fotos=[AvaliacaoFotoOut.model_validate(foto) for foto in fotos.get(avaliacao.id, [])],
        )
        for avaliacao, consumidor_nome, loja_nome in linhas
    ]


@router.delete("/avaliacoes/{avaliacao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_avaliacao(
    avaliacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    """Remove a avaliação, estorna os pontos (avaliação + fotos) e apaga os arquivos."""
    try:
        avaliacao = (
            await db.execute(
                select(Avaliacao).where(Avaliacao.id == avaliacao_id).with_for_update()
            )
        ).scalar_one_or_none()
        if avaliacao is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Avaliação não encontrada")

        fotos = (await fotos_por_avaliacao(db, [avaliacao_id])).get(avaliacao_id, [])
        urls = [foto.url for foto in fotos]
        if avaliacao.foto_url:
            urls.append(avaliacao.foto_url)

        # Estorno ANTES da exclusão: o FK usa ON DELETE SET NULL (RN37/RNF21).
        await estornar_pontos_da_avaliacao(db, avaliacao_id, avaliacao.usuario_id, fotos)
        await remover_fotos_da_avaliacao(db, avaliacao_id)
        await db.delete(avaliacao)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(500, "Não foi possível remover a avaliação") from exc

    await limpar_storage(urls)


@router.delete("/avaliacao-fotos/{foto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_foto_extra(
    foto_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    """Remove uma foto da avaliação e estorna os 5 pontos concedidos por ela."""
    try:
        linha = (
            await db.execute(
                select(AvaliacaoFoto, Avaliacao.usuario_id, Avaliacao.loja_id)
                .join(Avaliacao, Avaliacao.id == AvaliacaoFoto.avaliacao_id)
                .where(AvaliacaoFoto.id == foto_id)
                .with_for_update(of=AvaliacaoFoto)
            )
        ).one_or_none()
        if linha is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada")
        foto, usuario_id, loja_id = linha
        url = foto.url

        await estornar_pontos_da_foto(db, foto_id, usuario_id, loja_id)
        await db.delete(foto)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(500, "Não foi possível remover a foto") from exc

    await limpar_storage([url])
