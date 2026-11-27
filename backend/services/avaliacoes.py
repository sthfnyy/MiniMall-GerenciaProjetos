"""Regras compartilhadas de avaliações: Storage, fotos e estorno de pontos.

Usado pelo consumidor (consumer_avaliacoes) e pela moderação (admin_moderacao),
para que remover uma avaliação ou foto tenha o mesmo efeito nos dois fluxos.
"""

import logging
import uuid
from urllib.parse import quote, unquote, urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.config import settings
from ..models import AvaliacaoFoto, PontosTransacao, TipoTransacaoPontos

logger = logging.getLogger(__name__)

BUCKET = "fotos-avaliacoes"
PONTOS_AVALIACAO = 10
PONTOS_FOTO = 5
PREFIXO_FOTO = "RF08:foto:"


def descricao_foto(foto_id: uuid.UUID) -> str:
    """Identificador técnico do crédito de uma foto (usado no estorno)."""
    return f"{PREFIXO_FOTO}{foto_id}"


def origem_movimentacao(descricao: str | None, avaliacao_id: uuid.UUID | None) -> str:
    if descricao and descricao.startswith(PREFIXO_FOTO):
        return "foto"
    if avaliacao_id is not None or (descricao or "").lower().startswith("pontos por avalia"):
        return "avaliacao"
    return "outro"


def nome_abreviado(nome_completo: str | None) -> str:
    """'Maria da Silva' -> 'Maria S.' (exibição pública, RNF22/RNF23)."""
    partes = [parte for parte in (nome_completo or "").split() if parte]
    if not partes:
        return "Consumidor"
    if len(partes) == 1:
        return partes[0]
    return f"{partes[0]} {partes[-1][0].upper()}."


def storage_config() -> tuple[str, str]:
    url = (settings.supabase_url or "").rstrip("/")
    chave = settings.supabase_service_role_key or ""
    if not url or not chave:
        raise HTTPException(503, "Storage do Supabase não configurado")
    return url, chave


async def upload_foto(caminho: str, dados: bytes, mime: str) -> str:
    url, chave = storage_config()
    headers = {
        "apikey": chave,
        "Authorization": f"Bearer {chave}",
        "Content-Type": mime,
        "x-upsert": "false",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resposta = await client.post(
                f"{url}/storage/v1/object/{BUCKET}/{quote(caminho, safe='/')}",
                headers=headers,
                content=dados,
            )
            resposta.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Falha ao armazenar foto no Supabase") from exc
    return f"{url}/storage/v1/object/public/{BUCKET}/{quote(caminho, safe='/')}"


async def remover_storage(public_url: str) -> None:
    url, chave = storage_config()
    parsed = urlparse(public_url)
    prefixo = f"/storage/v1/object/public/{BUCKET}/"
    if f"{parsed.scheme}://{parsed.netloc}" != url or not parsed.path.startswith(prefixo):
        logger.warning("URL de foto não pertence ao bucket configurado")
        return
    caminho = unquote(parsed.path[len(prefixo):])
    if not caminho or any(parte in ("", ".", "..") for parte in caminho.split("/")):
        return
    async with httpx.AsyncClient(timeout=30) as client:
        resposta = await client.delete(
            f"{url}/storage/v1/object/{BUCKET}/{quote(caminho, safe='/')}",
            headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
        )
        resposta.raise_for_status()


async def limpar_storage(urls: list[str]) -> None:
    """Remove arquivos após o commit; falhas são registradas, não propagadas."""
    for url in urls:
        if not url:
            continue
        try:
            await remover_storage(url)
        except (HTTPException, httpx.HTTPError):
            logger.exception("Falha ao remover arquivo do Storage")


async def fotos_por_avaliacao(
    db: AsyncSession, avaliacao_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[AvaliacaoFoto]]:
    if not avaliacao_ids:
        return {}
    resultado = await db.execute(
        select(AvaliacaoFoto)
        .where(AvaliacaoFoto.avaliacao_id.in_(avaliacao_ids))
        .order_by(AvaliacaoFoto.criado_em.asc())
    )
    agrupadas: dict[uuid.UUID, list[AvaliacaoFoto]] = {}
    for foto in resultado.scalars().all():
        agrupadas.setdefault(foto.avaliacao_id, []).append(foto)
    return agrupadas


async def estornar_pontos_da_avaliacao(
    db: AsyncSession,
    avaliacao_id: uuid.UUID,
    usuario_id: uuid.UUID,
    fotos: list[AvaliacaoFoto],
) -> None:
    """Cancela os créditos da avaliação e de suas fotos (RN37/RNF21).

    Deve ser chamado ANTES de apagar a avaliação: o FK de pontos_transacoes
    usa ON DELETE SET NULL e o vínculo se perderia.
    """
    condicoes = [PontosTransacao.avaliacao_id == avaliacao_id]
    descricoes = [descricao_foto(foto.id) for foto in fotos]
    if descricoes:
        condicoes.append(PontosTransacao.descricao.in_(descricoes))
    await db.execute(
        delete(PontosTransacao).where(
            PontosTransacao.usuario_id == usuario_id,
            PontosTransacao.tipo == TipoTransacaoPontos.credito,
            or_(*condicoes),
        )
    )


async def remover_fotos_da_avaliacao(db: AsyncSession, avaliacao_id: uuid.UUID) -> None:
    """Apaga explicitamente os registros de fotos (não depende só do CASCADE)."""
    await db.execute(delete(AvaliacaoFoto).where(AvaliacaoFoto.avaliacao_id == avaliacao_id))


async def estornar_pontos_da_foto(
    db: AsyncSession,
    foto_id: uuid.UUID,
    usuario_id: uuid.UUID,
    loja_id: uuid.UUID,
) -> None:
    await db.execute(
        delete(PontosTransacao).where(
            PontosTransacao.usuario_id == usuario_id,
            PontosTransacao.loja_id == loja_id,
            PontosTransacao.tipo == TipoTransacaoPontos.credito,
            PontosTransacao.descricao == descricao_foto(foto_id),
        )
    )
