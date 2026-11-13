import uuid
from datetime import UTC, datetime

from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool


def criar_banco_sqlite():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as conexao:
        conexao.exec_driver_sql("""CREATE TABLE lojas (
            id CHAR(32) PRIMARY KEY, nome_loja TEXT, status TEXT,
            whatsapp TEXT NOT NULL DEFAULT ''
        )""")
        conexao.exec_driver_sql("""CREATE TABLE categorias (
            id CHAR(32) PRIMARY KEY, nome TEXT, criado_em DATETIME
        )""")
        conexao.exec_driver_sql("""CREATE TABLE produtos (
            id CHAR(32) PRIMARY KEY, loja_id CHAR(32), categoria_id CHAR(32),
            titulo TEXT, descricao TEXT, preco_base NUMERIC(10,2),
            foto_principal_url TEXT, ativo BOOLEAN,
            criado_em DATETIME, atualizado_em DATETIME
        )""")
    return engine


def inserir_loja(engine, nome="Loja Teste", status="aprovada", whatsapp=""):
    identificador = uuid.uuid4()
    with engine.begin() as conexao:
        conexao.execute(text(
            "INSERT INTO lojas (id, nome_loja, status, whatsapp) "
            "VALUES (:id, :nome, :status, :whatsapp)"
        ), {"id": identificador.hex, "nome": nome, "status": status, "whatsapp": whatsapp})
    return identificador


def inserir_categoria(engine, nome="Papelaria"):
    identificador = uuid.uuid4()
    with engine.begin() as conexao:
        conexao.execute(text(
            "INSERT INTO categorias (id, nome, criado_em) VALUES (:id, :nome, :criado_em)"
        ), {"id": identificador.hex, "nome": nome, "criado_em": datetime.now(UTC).isoformat()})
    return identificador


def inserir_produto(engine, loja_id, categoria_id, titulo="Caderno", preco="25.00", ativo=True):
    identificador = uuid.uuid4()
    agora = datetime.now(UTC).isoformat()
    with engine.begin() as conexao:
        conexao.execute(text("""INSERT INTO produtos
            (id, loja_id, categoria_id, titulo, descricao, preco_base, foto_principal_url,
             ativo, criado_em, atualizado_em)
            VALUES (:id, :loja_id, :categoria_id, :titulo, :descricao, :preco_base,
                    :foto_principal_url, :ativo, :criado_em, :atualizado_em)
        """), {
            "id": identificador.hex, "loja_id": loja_id.hex,
            "categoria_id": categoria_id.hex, "titulo": titulo,
            "descricao": "Descrição de teste", "preco_base": preco,
            "foto_principal_url": None, "ativo": ativo,
            "criado_em": agora, "atualizado_em": agora,
        })
    return identificador


class AdaptadorSessaoAsync:
    def __init__(self, sessao):
        self.sessao = sessao

    async def execute(self, consulta):
        return self.sessao.execute(consulta)

    def add(self, objeto):
        self.sessao.add(objeto)

    async def commit(self):
        self.sessao.commit()

    async def refresh(self, objeto):
        self.sessao.refresh(objeto)

    async def delete(self, objeto):
        self.sessao.delete(objeto)

    async def rollback(self):
        self.sessao.rollback()
