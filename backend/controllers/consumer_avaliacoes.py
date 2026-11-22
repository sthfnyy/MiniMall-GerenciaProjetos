
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.config import settings
from ..config.database import get_db
from ..models import (
    Avaliacao,
    AvaliacaoFoto,
    Loja,
    PontosTransacao,
    Profile,
    TipoTransacaoPontos,
)
from ..schemas import (
    ConsumerAvaliacaoCreate,
    ConsumerAvaliacaoFotoOut,
    ConsumerAvaliacaoOut,
)

router = APIRouter(
    prefix="/consumidor/avaliacoes",
    tags=["consumidor - avaliações"],
)

logger = logging.getLogger(__name__)

BUCKET = "fotos-avaliacoes"
PONTOS_AVALIACAO = 10
PONTOS_FOTO = 5
MAX_FOTOS = 3
MAX_BYTES = 5 * 1024 * 1024

TIPOS = {
    "image/jpeg": ("jpg", (".jpg", ".jpeg")),
    "image/png": ("png", (".png",)),
    "image/webp": ("webp", (".webp",)),
}


def _descricao_foto(foto_id: uuid.UUID) -> str:
    return f"RF08:foto:{foto_id}"


def _storage_config() -> tuple[str, str]:
    url = (settings.supabase_url or "").rstrip("/")
    chave = settings.supabase_service_role_key or ""

    if not url or not chave:
        raise HTTPException(
            503, "Storage do Supabase não configurado"
        )

    return url, chave


async def _upload_foto(
    caminho: str,
    dados: bytes,
    mime: str,
) -> str:
    url, chave = _storage_config()

    headers = {
        "apikey": chave,
        "Authorization": f"Bearer {chave}",
        "Content-Type": mime,
        "x-upsert": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resposta = await client.post(
                f"{url}/storage/v1/object/"
                f"{BUCKET}/{quote(caminho, safe='/')}",
                headers=headers,
                content=dados,
            )
            resposta.raise_for_status()

    except httpx.HTTPError as exc:
        raise HTTPException(
            502, "Falha ao armazenar foto no Supabase"
        ) from exc

    return (
        f"{url}/storage/v1/object/public/"
        f"{BUCKET}/{quote(caminho, safe='/')}"
    )


async def _remover_storage(public_url: str) -> None:
    url, chave = _storage_config()
    parsed = urlparse(public_url)
    prefixo = f"/storage/v1/object/public/{BUCKET}/"

    if (
        f"{parsed.scheme}://{parsed.netloc}" != url
        or not parsed.path.startswith(prefixo)
    ):
        logger.warning(
            "URL de foto não pertence ao bucket configurado"
        )
        return

    caminho = unquote(parsed.path[len(prefixo):])

    if not caminho or any(
        parte in ("", ".", "..")
        for parte in caminho.split("/")
    ):
        return

    headers = {
        "apikey": chave,
        "Authorization": f"Bearer {chave}",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resposta = await client.delete(
            f"{url}/storage/v1/object/"
            f"{BUCKET}/{quote(caminho, safe='/')}",
            headers=headers,
        )
        resposta.raise_for_status()


async def _limpar_storage(urls: list[str]) -> None:
    for url in urls:
        try:
            await _remover_storage(url)
        except (HTTPException, httpx.HTTPError):
            logger.exception(
                "Falha ao remover arquivo do Storage: %s",
                url,
            )


# ----------------------------------------
# Criar avaliação e atribuir 10 pontos
# ----------------------------------------

@router.post(
    "",
    response_model=ConsumerAvaliacaoOut,
    status_code=201,
)
async def criar_avaliacao(
    payload: ConsumerAvaliacaoCreate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        loja = (
            await db.execute(
                select(Loja)
                .where(Loja.id == payload.loja_id)
                .with_for_update()
            )
        ).scalar_one_or_none()

        if loja is None:
            raise HTTPException(
                404, "Loja não encontrada"
            )

        anterior = (
            await db.execute(
                select(Avaliacao.id)
                .where(
                    Avaliacao.loja_id == payload.loja_id,
                    Avaliacao.usuario_id == profile.id,
                )
                .limit(1)
            )
        ).scalar_one_or_none()

        if anterior is not None:
            raise HTTPException(
                409, "Você já avaliou esta loja"
            )

        avaliacao = Avaliacao(
            id=uuid.uuid4(),
            loja_id=payload.loja_id,
            usuario_id=profile.id,
            nota=payload.nota,
            comentario=payload.comentario,
            foto_url="",
            criado_em=datetime.now(UTC),
        )

        db.add(avaliacao)

        # Executa o INSERT e eventuais triggers do banco.
        await db.flush()

        # Evita duplicar os 10 pontos caso o banco
        # já tenha um trigger de pontuação.
        ja_creditado = (
            await db.execute(
                select(PontosTransacao.id)
                .where(
                    PontosTransacao.avaliacao_id
                    == avaliacao.id,
                    PontosTransacao.tipo
                    == TipoTransacaoPontos.credito,
                )
                .limit(1)
            )
        ).scalar_one_or_none()

        if ja_creditado is None:
            db.add(
                PontosTransacao(
                    id=uuid.uuid4(),
                    usuario_id=profile.id,
                    loja_id=payload.loja_id,
                    tipo=TipoTransacaoPontos.credito,
                    quantidade=PONTOS_AVALIACAO,
                    avaliacao_id=avaliacao.id,
                    descricao="Pontos por avaliação publicada",
                    criado_em=datetime.now(UTC),
                )
            )

        await db.commit()
        return avaliacao

    except HTTPException:
        await db.rollback()
        raise

    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            500, "Não foi possível criar a avaliação"
        ) from exc


# ----------------------------------------
# Adicionar foto e atribuir 5 pontos
# ----------------------------------------

@router.post(
    "/{avaliacao_id}/fotos",
    response_model=ConsumerAvaliacaoFotoOut,
    status_code=201,
)
async def adicionar_foto(
    avaliacao_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        avaliacao = (
            await db.execute(
                select(Avaliacao)
                .where(
                    Avaliacao.id == avaliacao_id,
                    Avaliacao.usuario_id == profile.id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()

        if avaliacao is None:
            raise HTTPException(
                404, "Avaliação não encontrada"
            )

        total = (
            await db.execute(
                select(func.count())
                .select_from(AvaliacaoFoto)
                .where(
                    AvaliacaoFoto.avaliacao_id
                    == avaliacao_id
                )
            )
        ).scalar_one()

        if total >= MAX_FOTOS:
            raise HTTPException(
                409, "Limite de 3 fotos por avaliação"
            )

        dados = await arquivo.read(MAX_BYTES + 1)

        if not dados:
            raise HTTPException(422, "Foto vazia")

        if len(dados) > MAX_BYTES:
            raise HTTPException(
                413, "Máximo de 5 MB por foto"
            )

        mime = (arquivo.content_type or "").lower()

        if mime not in TIPOS:
            raise HTTPException(
                415, "Apenas JPEG, PNG e WEBP"
            )

        extensao, sufixos = TIPOS[mime]

        if (
            Path(arquivo.filename or "").suffix.lower()
            not in sufixos
        ):
            raise HTTPException(
                415, "Extensão da foto inválida"
            )

        assinatura_valida = (
            (
                mime == "image/jpeg"
                and dados.startswith(b"\xff\xd8\xff")
            )
            or (
                mime == "image/png"
                and dados.startswith(
                    b"\x89PNG\r\n\x1a\n"
                )
            )
            or (
                mime == "image/webp"
                and dados[:4] == b"RIFF"
                and dados[8:12] == b"WEBP"
            )
        )

        if not assinatura_valida:
            raise HTTPException(
                415,
                "Conteúdo da foto não corresponde ao formato",
            )

        foto_id = uuid.uuid4()

        caminho = (
            f"{profile.id}/"
            f"{avaliacao_id}/"
            f"{foto_id}.{extensao}"
        )

        url = await _upload_foto(
            caminho, dados, mime
        )

        try:
            foto = AvaliacaoFoto(
                id=foto_id,
                avaliacao_id=avaliacao_id,
                url=url,
                criado_em=datetime.now(UTC),
            )

            db.add(foto)

            # RF08: crédito de 5 pontos pela foto.
            db.add(
                PontosTransacao(
                    id=uuid.uuid4(),
                    usuario_id=profile.id,
                    loja_id=avaliacao.loja_id,
                    tipo=TipoTransacaoPontos.credito,
                    quantidade=PONTOS_FOTO,
                    avaliacao_id=None,
                    descricao=_descricao_foto(foto_id),
                    criado_em=datetime.now(UTC),
                )
            )

            # Foto e pontos são gravados juntos.
            await db.commit()

        except SQLAlchemyError:
            await db.rollback()
            await _limpar_storage([url])
            raise

        return foto

    except HTTPException:
        await db.rollback()
        raise

    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            500, "Não foi possível adicionar a foto"
        ) from exc


# ----------------------------------------
# Excluir foto e retirar seus 5 pontos
# ----------------------------------------

@router.delete(
    "/{avaliacao_id}/fotos/{foto_id}",
    status_code=204,
)
async def remover_foto(
    avaliacao_id: uuid.UUID,
    foto_id: uuid.UUID,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        resultado = await db.execute(
            select(
                AvaliacaoFoto,
                Avaliacao.loja_id,
            )
            .join(
                Avaliacao,
                Avaliacao.id == AvaliacaoFoto.avaliacao_id,
            )
            .where(
                Avaliacao.id == avaliacao_id,
                Avaliacao.usuario_id == profile.id,
                AvaliacaoFoto.id == foto_id,
            )
            .with_for_update()
        )

        linha = resultado.one_or_none()

        if linha is None:
            raise HTTPException(
                404, "Foto não encontrada"
            )

        foto, loja_id = linha
        url = foto.url

        # Remove apenas os pontos dessa foto.
        await db.execute(
            delete(PontosTransacao).where(
                PontosTransacao.usuario_id == profile.id,
                PontosTransacao.loja_id == loja_id,
                PontosTransacao.tipo
                == TipoTransacaoPontos.credito,
                PontosTransacao.descricao
                == _descricao_foto(foto_id),
            )
        )

        await db.delete(foto)
        await db.commit()

    except HTTPException:
        await db.rollback()
        raise

    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            500, "Não foi possível remover a foto"
        ) from exc

    await _limpar_storage([url])


# ----------------------------------------
# Excluir avaliação e seus créditos
# ----------------------------------------

@router.delete(
    "/{avaliacao_id}",
    status_code=204,
)
async def remover_avaliacao(
    avaliacao_id: uuid.UUID,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        avaliacao = (
            await db.execute(
                select(Avaliacao)
                .where(
                    Avaliacao.id == avaliacao_id,
                    Avaliacao.usuario_id == profile.id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()

        if avaliacao is None:
            raise HTTPException(
                404, "Avaliação não encontrada"
            )

        fotos = (
            await db.execute(
                select(AvaliacaoFoto).where(
                    AvaliacaoFoto.avaliacao_id
                    == avaliacao_id
                )
            )
        ).scalars().all()

        urls = [foto.url for foto in fotos]

        creditos_fotos = [
            _descricao_foto(foto.id)
            for foto in fotos
        ]

        condicoes = [
            PontosTransacao.avaliacao_id
            == avaliacao_id
        ]

        if creditos_fotos:
            condicoes.append(
                PontosTransacao.descricao.in_(
                    creditos_fotos
                )
            )

        await db.execute(
            delete(PontosTransacao).where(
                PontosTransacao.usuario_id == profile.id,
                PontosTransacao.tipo
                == TipoTransacaoPontos.credito,
                or_(*condicoes),
            )
        )

        await db.delete(avaliacao)
        await db.commit()

    except HTTPException:
        await db.rollback()
        raise

    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            500, "Não foi possível remover a avaliação"
        ) from exc

    await _limpar_storage(urls)
