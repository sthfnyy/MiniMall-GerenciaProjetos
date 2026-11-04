import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProdutoCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    categoria_id: uuid.UUID
    titulo: str = Field(min_length=2, max_length=180)
    descricao: str | None = None
    preco_base: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    foto_principal_url: str | None = None
    ativo: bool = True

    @field_validator("titulo")
    @classmethod
    def normalizar_titulo(cls, valor: str) -> str:
        valor = valor.strip()
        if len(valor) < 2:
            raise ValueError("O título deve ter pelo menos 2 caracteres")
        return valor


class ProdutoUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    categoria_id: uuid.UUID | None = None
    titulo: str | None = Field(default=None, min_length=2, max_length=180)
    descricao: str | None = None
    preco_base: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    foto_principal_url: str | None = None
    ativo: bool | None = None

    @field_validator("titulo")
    @classmethod
    def normalizar_titulo(cls, valor: str | None) -> str | None:
        if valor is None:
            raise ValueError("O título não pode ser nulo")
        valor = valor.strip()
        if len(valor) < 2:
            raise ValueError("O título deve ter pelo menos 2 caracteres")
        return valor

    @field_validator("categoria_id", "preco_base", "ativo")
    @classmethod
    def nao_permitir_nulo(cls, valor):
        if valor is None:
            raise ValueError("Este campo não pode ser nulo")
        return valor


class ProdutoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    loja_id: uuid.UUID
    categoria_id: uuid.UUID
    titulo: str
    descricao: str | None
    preco_base: Decimal
    foto_principal_url: str | None
    ativo: bool
    criado_em: datetime
    atualizado_em: datetime


class ProdutoVitrineOut(ProdutoOut):
    nome_loja: str
    nome_categoria: str
