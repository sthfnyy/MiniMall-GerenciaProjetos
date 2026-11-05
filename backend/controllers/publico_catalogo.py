from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.database import get_db
from ..models import Categoria
from ..schemas import CategoriaOut

router = APIRouter(prefix="/publico", tags=["Vitrine pública"])


@router.get("/categorias", response_model=list[CategoriaOut])
async def listar_categorias(db: AsyncSession = Depends(get_db)):
    resultado = await db.execute(select(Categoria).order_by(Categoria.nome))
    return resultado.scalars().all()

# A vitrine expõe apenas campos públicos, sem IDs de usuário e dados de moderação.
import uuid
from decimal import Decimal

from fastapi import HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_

from ..models import Loja, Produto, StatusLoja
from ..schemas_produtos import ProdutoOut, ProdutoVitrineOut


class LojaPublicaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nome_loja: str
    descricao: str | None
    endereco_logradouro: str | None
    endereco_numero: str | None
    endereco_bairro: str | None
    endereco_cidade: str
    endereco_uf: str
    whatsapp: str
    instagram: str | None
    horario_funcionamento: dict | None
    logo_url: str | None
    status: StatusLoja


@router.get("/lojas", response_model=list[LojaPublicaOut])
async def listar_lojas(db: AsyncSession = Depends(get_db)):
    resultado = await db.execute(select(Loja).where(Loja.status == StatusLoja.aprovada).order_by(Loja.nome_loja, Loja.id))
    return resultado.scalars().all()


def consulta_produtos():
    return select(Produto, Loja.nome_loja, Categoria.nome).join(Loja, Produto.loja_id == Loja.id).join(Categoria, Produto.categoria_id == Categoria.id).where(Produto.ativo.is_(True), Loja.status == StatusLoja.aprovada)


def produto_publico(linha):
    produto, nome_loja, nome_categoria = linha
    return {**ProdutoOut.model_validate(produto).model_dump(), "nome_loja": nome_loja, "nome_categoria": nome_categoria}


@router.get("/produtos", response_model=list[ProdutoVitrineOut])
async def listar_produtos(
    q: str = Query(default="", max_length=180),
    categoria_id: uuid.UUID | None = None,
    loja_id: uuid.UUID | None = None,
    preco_min: Decimal | None = Query(default=None, ge=0),
    preco_max: Decimal | None = Query(default=None, ge=0),
    ordem: str = Query(default="relevancia", pattern="^(relevancia|menor|maior)$"),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    if preco_min is not None and preco_max is not None and preco_min > preco_max:
        raise HTTPException(status_code=422, detail="O preço mínimo deve ser menor ou igual ao máximo.")
    consulta = consulta_produtos()
    if q.strip():
        termo = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        consulta = consulta.where(or_(Produto.titulo.ilike(f"%{termo}%", escape="\\"), Produto.descricao.ilike(f"%{termo}%", escape="\\")))
    if categoria_id is not None:
        consulta = consulta.where(Produto.categoria_id == categoria_id)
    if loja_id is not None:
        consulta = consulta.where(Produto.loja_id == loja_id)
    if preco_min is not None:
        consulta = consulta.where(Produto.preco_base >= preco_min)
    if preco_max is not None:
        consulta = consulta.where(Produto.preco_base <= preco_max)
    ordenacao = Produto.preco_base.asc() if ordem == "menor" else Produto.preco_base.desc() if ordem == "maior" else Produto.criado_em.desc()
    resultado = await db.execute(consulta.order_by(ordenacao, Produto.id).limit(limit).offset(offset))
    return [produto_publico(linha) for linha in resultado.all()]


@router.get("/produtos/{produto_id}", response_model=ProdutoVitrineOut)
async def consultar_produto(produto_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    resultado = await db.execute(consulta_produtos().where(Produto.id == produto_id))
    linha = resultado.first()
    if linha is None:
        raise HTTPException(status_code=404, detail="Produto não encontrado na vitrine")
    return produto_publico(linha)
