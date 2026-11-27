"""Aprovação e rejeição de lojas pelo administrador."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..config.database import get_db
from ..models import Loja, Produto, Profile, StatusLoja, auth_users
from ..schemas import AdminLojaOut, LojaDetailOut, RejeitarLojaIn

router = APIRouter(prefix="/admin/lojas", tags=["admin - moderação de lojas"])


def _consulta_lojas():
    total_produtos = (
        select(func.count(Produto.id))
        .where(Produto.loja_id == Loja.id)
        .correlate(Loja)
        .scalar_subquery()
    )
    return (
        select(Loja, Profile.nome_completo, auth_users.c.email, total_produtos)
        .outerjoin(Profile, Profile.id == Loja.lojista_id)
        .outerjoin(auth_users, auth_users.c.id == Loja.lojista_id)
    )


def _saida(loja: Loja, nome: str | None, email: str | None, total: int | None) -> AdminLojaOut:
    return AdminLojaOut(
        **LojaDetailOut.model_validate(loja).model_dump(),
        lojista_nome=nome,
        lojista_email=email,
        total_produtos=total or 0,
    )


@router.get("", response_model=list[AdminLojaOut])
async def listar_lojas(
    status_filtro: StatusLoja | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: Profile = Depends(require_admin),
):
    consulta = _consulta_lojas().order_by(Loja.criado_em.desc())
    if status_filtro is not None:
        consulta = consulta.where(Loja.status == status_filtro)
    try:
        linhas = (await db.execute(consulta)).all()
    except SQLAlchemyError as exc:
        raise HTTPException(500, "Não foi possível consultar as lojas") from exc
    return [_saida(*linha) for linha in linhas]


async def _alterar_status(
    loja_id: uuid.UUID,
    db: AsyncSession,
    admin: Profile,
    novo_status: StatusLoja,
    motivo: str | None,
) -> AdminLojaOut:
    try:
        loja = (
            await db.execute(select(Loja).where(Loja.id == loja_id).with_for_update())
        ).scalar_one_or_none()
        if loja is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Loja não encontrada")
        agora = datetime.now(UTC)
        loja.status = novo_status
        loja.aprovado_por = admin.id
        loja.aprovado_em = agora
        loja.motivo_rejeicao = motivo
        loja.atualizado_em = agora
        await db.commit()
        linha = (await db.execute(_consulta_lojas().where(Loja.id == loja_id))).one()
    except HTTPException:
        await db.rollback()
        raise
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(500, "Não foi possível atualizar a loja") from exc
    return _saida(*linha)


@router.patch("/{loja_id}/aprovar", response_model=AdminLojaOut)
async def aprovar_loja(
    loja_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Profile = Depends(require_admin),
):
    return await _alterar_status(loja_id, db, admin, StatusLoja.aprovada, None)


@router.patch("/{loja_id}/rejeitar", response_model=AdminLojaOut)
async def rejeitar_loja(
    loja_id: uuid.UUID,
    payload: RejeitarLojaIn,
    db: AsyncSession = Depends(get_db),
    admin: Profile = Depends(require_admin),
):
    return await _alterar_status(
        loja_id, db, admin, StatusLoja.rejeitada, payload.motivo_rejeicao
    )
