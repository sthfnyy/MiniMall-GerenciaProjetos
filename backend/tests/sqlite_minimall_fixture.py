"""Banco SQLite em memória com o esquema usado pelo MiniMall (sem tocar no Supabase).

Permite testar os fluxos completos (cadastro de loja, aprovação, compra
confirmada, avaliações, fotos, pontos, favoritos) através da API real do FastAPI,
substituindo apenas a sessão do banco e o perfil autenticado.
"""

import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import Profile

DDL = [
    "CREATE TABLE auth.users (id CHAR(32) PRIMARY KEY, email TEXT)",
    """CREATE TABLE profiles (
        id CHAR(32) PRIMARY KEY, role TEXT NOT NULL, nome_completo TEXT NOT NULL,
        telefone TEXT, avatar_url TEXT, criado_em DATETIME, atualizado_em DATETIME)""",
    """CREATE TABLE lojas (
        id CHAR(32) PRIMARY KEY, lojista_id CHAR(32) NOT NULL UNIQUE, nome_loja TEXT NOT NULL,
        descricao TEXT, endereco_logradouro TEXT, endereco_numero TEXT, endereco_bairro TEXT,
        endereco_cidade TEXT NOT NULL, endereco_uf TEXT NOT NULL, endereco_cep TEXT,
        latitude NUMERIC, longitude NUMERIC, horario_funcionamento JSON,
        whatsapp TEXT NOT NULL, instagram TEXT, facebook TEXT, logo_url TEXT,
        status TEXT NOT NULL, motivo_rejeicao TEXT, aprovado_por CHAR(32), aprovado_em DATETIME,
        criado_em DATETIME, atualizado_em DATETIME)""",
    "CREATE TABLE categorias (id CHAR(32) PRIMARY KEY, nome TEXT NOT NULL UNIQUE, criado_em DATETIME)",
    """CREATE TABLE produtos (
        id CHAR(32) PRIMARY KEY, loja_id CHAR(32) NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
        categoria_id CHAR(32) NOT NULL REFERENCES categorias(id), titulo TEXT NOT NULL,
        descricao TEXT, preco_base NUMERIC(10,2) NOT NULL, foto_principal_url TEXT,
        preco_promocional NUMERIC(10,2), ativo BOOLEAN NOT NULL,
        criado_em DATETIME, atualizado_em DATETIME)""",
    """CREATE TABLE avaliacoes (
        id CHAR(32) PRIMARY KEY, loja_id CHAR(32) NOT NULL REFERENCES lojas(id),
        usuario_id CHAR(32) NOT NULL, nota SMALLINT NOT NULL, comentario TEXT,
        foto_url TEXT NOT NULL, criado_em DATETIME)""",
    """CREATE TABLE avaliacao_fotos (
        id CHAR(32) PRIMARY KEY,
        avaliacao_id CHAR(32) NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
        url TEXT NOT NULL, criado_em DATETIME)""",
    """CREATE TABLE pontos_transacoes (
        id CHAR(32) PRIMARY KEY, usuario_id CHAR(32) NOT NULL, loja_id CHAR(32) NOT NULL,
        tipo TEXT NOT NULL, quantidade INTEGER NOT NULL,
        avaliacao_id CHAR(32) REFERENCES avaliacoes(id) ON DELETE SET NULL,
        descricao TEXT, criado_em DATETIME)""",
    """CREATE TABLE favoritos (
        usuario_id CHAR(32) NOT NULL, produto_id CHAR(32) NOT NULL REFERENCES produtos(id),
        criado_em DATETIME, PRIMARY KEY (usuario_id, produto_id))""",
    """CREATE TABLE intencoes_compra (
        id CHAR(32) PRIMARY KEY, consumidor_id CHAR(32) NOT NULL, loja_id CHAR(32) NOT NULL,
        produto_id CHAR(32) NOT NULL, codigo TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
        criado_em DATETIME, decidido_em DATETIME, decidido_por CHAR(32))""",
]


def agora():
    return datetime.now(UTC)


def criar_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _anexar_schema_auth(conexao, _registro):
        conexao.execute("ATTACH DATABASE ':memory:' AS auth")
        conexao.execute("PRAGMA foreign_keys = ON")

    with engine.begin() as conexao:
        for comando in DDL:
            conexao.exec_driver_sql(comando)
    return engine


class SessaoAsync:
    """Expõe uma Session síncrona com a interface assíncrona usada pelos controllers."""

    def __init__(self, sessao: Session):
        self.sessao = sessao

    async def execute(self, consulta, *args, **kwargs):
        return self.sessao.execute(consulta, *args, **kwargs)

    def add(self, objeto):
        self.sessao.add(objeto)

    async def flush(self):
        self.sessao.flush()

    async def commit(self):
        self.sessao.commit()

    async def refresh(self, objeto):
        self.sessao.refresh(objeto)

    async def delete(self, objeto):
        self.sessao.delete(objeto)

    async def rollback(self):
        self.sessao.rollback()


class ClienteAutenticado:
    def __init__(self, cenario, usuario_id):
        self.cenario = cenario
        self.usuario_id = usuario_id

    def __getattr__(self, metodo):
        if metodo not in {"get", "post", "put", "patch", "delete"}:
            raise AttributeError(metodo)

        def chamar(*args, **kwargs):
            self.cenario.usuario_id = self.usuario_id
            return getattr(self.cenario.cliente, metodo)(*args, **kwargs)

        return chamar


class Cenario:
    """Banco + cliente HTTP + troca do usuário autenticado entre requisições."""

    def __init__(self):
        self.engine = criar_engine()
        self.sessao = Session(self.engine, expire_on_commit=False)
        self.adaptador = SessaoAsync(self.sessao)
        self.usuario_id: uuid.UUID | None = None

        async def db_override():
            yield self.adaptador

        async def perfil_override():
            from fastapi import HTTPException

            if self.usuario_id is None:
                raise HTTPException(401, "Credenciais de autenticação não fornecidas")
            perfil = self.sessao.get(Profile, self.usuario_id)
            if perfil is None:
                raise HTTPException(404, "Perfil não encontrado para este usuário")
            return perfil

        app.dependency_overrides.clear()
        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[get_current_profile] = perfil_override
        self.cliente = TestClient(app)

    def fechar(self):
        self.cliente.close()
        app.dependency_overrides.clear()
        self.sessao.close()
        self.engine.dispose()

    def como(self, usuario_id: uuid.UUID | None):
        """Cliente vinculado a um usuário: cada requisição usa SEMPRE esse usuário."""
        return ClienteAutenticado(self, usuario_id)

    def sql(self, comando: str, **parametros):
        self.sessao.commit()
        with self.engine.begin() as conexao:
            return conexao.execute(text(comando), parametros).fetchall()

    # ---------- dados de apoio ----------

    def criar_usuario(self, role: str, nome: str = "Usuário Teste", email: str | None = None):
        uid = uuid.uuid4()
        instante = agora().isoformat()
        with self.engine.begin() as conexao:
            conexao.execute(
                text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
                {"id": uid.hex, "email": email or f"{uid.hex[:8]}@exemplo.com"},
            )
            conexao.execute(
                text(
                    "INSERT INTO profiles (id, role, nome_completo, criado_em, atualizado_em) "
                    "VALUES (:id, :role, :nome, :t, :t)"
                ),
                {"id": uid.hex, "role": role, "nome": nome, "t": instante},
            )
        return uid

    def criar_categoria(self, nome: str = "Vestuário"):
        cid = uuid.uuid4()
        with self.engine.begin() as conexao:
            conexao.execute(
                text("INSERT INTO categorias (id, nome, criado_em) VALUES (:id, :nome, :t)"),
                {"id": cid.hex, "nome": nome, "t": agora().isoformat()},
            )
        return cid


PAYLOAD_LOJA = {
    "nome_loja": "Loja da Apresentação",
    "descricao": "Moda local",
    "endereco_logradouro": "Rua Central",
    "endereco_numero": "100",
    "endereco_bairro": "Centro",
    "endereco_cidade": "Picos",
    "endereco_uf": "PI",
    "horario_funcionamento": {"descricao": "Seg a Sex, 8h às 18h"},
    "whatsapp": "89999990000",
    "instagram": "https://instagram.com/lojaapresentacao",
}

PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01"
    b"\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)
