import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_consumer
from ..config.database import get_db
from ..models import (
    Avaliacao,
    AvaliacaoFoto,
    IntencaoCompra,
    Loja,
    PontosTransacao,
    Profile,
    StatusIntencaoCompra,
    StatusLoja,
    TipoTransacaoPontos,
)
from ..schemas import (
    ConsumerAvaliacaoCreate,
    ConsumerAvaliacaoFotoOut,
    ConsumerAvaliacaoOut,
    ConsumerAvaliacaoUpdate,
)
from ..services.avaliacoes import (
    PONTOS_AVALIACAO,
    PONTOS_FOTO,
    descricao_foto,
    estornar_pontos_da_avaliacao,
    estornar_pontos_da_foto,
    fotos_por_avaliacao,
    limpar_storage,
    remover_fotos_da_avaliacao,
    upload_foto,
)

router = APIRouter(
    prefix="/consumidor/avaliacoes",
    tags=["consumidor - avaliações"],
)

logger = logging.getLogger(__name__)

MAX_FOTOS = 3
MAX_BYTES = 5 * 1024 * 1024

TIPOS = {
    "image/jpeg": ("jpg", (".jpg", ".jpeg")),
    "image/png": ("png", (".png",)),
    "image/webp": ("webp", (".webp",)),
}

MENSAGEM_SEM_COMPRA = (
    "Para avaliar esta loja, sua compra precisa ser confirmada pelo lojista. "
    "Solicite a confirmação na página do produto que você comprou."
)


async def possui_compra_confirmada(
    db: AsyncSession, consumidor_id: uuid.UUID, loja_id: uuid.UUID
) -> bool:
    """Regra de negócio: só avalia quem teve a compra confirmada pela loja."""
    resultado = await db.execute(
        select(IntencaoCompra.id)
        .where(
            IntencaoCompra.consumidor_id == consumidor_id,
            IntencaoCompra.loja_id == loja_id,
            IntencaoCompra.status == StatusIntencaoCompra.compra_confirmada,
        )
        .limit(1)
    )
    return resultado.scalar_one_or_none() is not None


def _montar_saida(avaliacao: Avaliacao, fotos: list[AvaliacaoFoto], loja_nome: str | None = None):
    return ConsumerAvaliacaoOut(
        id=avaliacao.id,
        loja_id=avaliacao.loja_id,
        nota=avaliacao.nota,
        comentario=avaliacao.comentario,
        foto_url=avaliacao.foto_url or "",
        criado_em=avaliacao.criado_em,
        loja_nome=loja_nome,
        fotos=[ConsumerAvaliacaoFotoOut.model_validate(foto) for foto in fotos],
    )


# ----------------------------------------
# Listar as avaliações do consumidor
# ----------------------------------------

@router.get("", response_model=list[ConsumerAvaliacaoOut])
async def listar_avaliacoes(
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    try:
        resultado = await db.execute(
            select(Avaliacao, Loja.nome_loja)
            .join(Loja, Loja.id == Avaliacao.loja_id)
            .where(Avaliacao.usuario_id == profile.id)
            .order_by(Avaliacao.criado_em.desc())
        )
        linhas = resultado.all()
        fotos = await fotos_por_avaliacao(db, [avaliacao.id for avaliacao, _ in linhas])
    except SQLAlchemyError as exc:
        raise HTTPException(500, "Não foi possível consultar as avaliações") from exc

    return [
        _montar_saida(avaliacao, fotos.get(avaliacao.id, []), nome_loja)
        for avaliacao, nome_loja in linhas
    ]


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

        if loja is None or loja.status != StatusLoja.aprovada:
            raise HTTPException(404, "Loja não encontrada")

        if not await possui_compra_confirmada(db, profile.id, payload.loja_id):
            raise HTTPException(403, MENSAGEM_SEM_COMPRA)

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
                409, "Você já avaliou esta loja. Edite sua avaliação em Minhas avaliações."
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

        # Evita duplicar os 10 pontos: o banco real possui o trigger
        # trg_creditar_pontos_avaliacao, que já registra o crédito.
        ja_creditado = (
            await db.execute(
                select(PontosTransacao.id)
                .where(
                    PontosTransacao.avaliacao_id == avaliacao.id,
                    PontosTransacao.tipo == TipoTransacaoPontos.credito,
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
        return _montar_saida(avaliacao, [], loja.nome_loja)

    except HTTPException:
        await db.rollback()
        raise

    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            500, "Não foi possível criar a avaliação"
        ) from exc


# ----------------------------------------
# Editar nota/comentário.
# Não gera novos pontos (RN34/RN36).
# ----------------------------------------

@router.patch("/{avaliacao_id}", response_model=ConsumerAvaliacaoOut)
async def atualizar_avaliacao(
    avaliacao_id: uuid.UUID,
    payload: ConsumerAvaliacaoUpdate,
    profile: Profile = Depends(require_consumer),
    db: AsyncSession = Depends(get_db),
):
    alteracoes = payload.model_dump(exclude_unset=True)
    if "comentario" in alteracoes and alteracoes["comentario"] is not None:
        alteracoes["comentario"] = alteracoes["comentario"].strip() or None

    try:
        avaliacao = (
            await db.execute(
                select(Avaliacao).where(
                    Avaliacao.id == avaliacao_id,
                    Avaliacao.usuario_id == profile.id,
                )
            )
        ).scalar_one_or_none()

        if avaliacao is None:
            raise HTTPException(404, "Avaliação não encontrada")

        for campo, valor in alteracoes.items():
            setattr(avaliacao, campo, valor)

        await db.commit()
        fotos = await fotos_por_avaliacao(db, [avaliacao.id])
        nome_loja = (
            await db.execute(select(Loja.nome_loja).where(Loja.id == avaliacao.loja_id))
        ).scalar_one_or_none()
    except HTTPException:
        await db.rollback()
        raise
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(500, "Não foi possível atualizar a avaliação") from exc

    return _montar_saida(avaliacao, fotos.get(avaliacao.id, []), nome_loja)


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

        url = await upload_foto(
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
                    descricao=descricao_foto(foto_id),
                    criado_em=datetime.now(UTC),
                )
            )

            # Foto e pontos são gravados juntos.
            await db.commit()

        except SQLAlchemyError:
            await db.rollback()
            await limpar_storage([url])
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
        await estornar_pontos_da_foto(db, foto_id, profile.id, loja_id)

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

    await limpar_storage([url])


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

        fotos = (await fotos_por_avaliacao(db, [avaliacao_id])).get(avaliacao_id, [])
        urls = [foto.url for foto in fotos]

        await estornar_pontos_da_avaliacao(db, avaliacao_id, profile.id, fotos)
        await remover_fotos_da_avaliacao(db, avaliacao_id)

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

    await limpar_storage(urls)
