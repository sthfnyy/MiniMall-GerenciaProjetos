import unittest
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from backend.auth import get_current_profile, require_lojista
from backend.config.database import get_db
from backend.controllers.lojista_loja import get_lojista_loja
from backend.controllers.lojista_produtos import router
from backend.models import Categoria, Loja, Produto, Profile, UserRole


class Resultado:
    def __init__(self, valor=None, itens=None):
        self.valor = valor
        self.itens = itens if itens is not None else ([valor] if valor is not None else [])

    def scalar_one_or_none(self):
        return self.valor

    def scalars(self):
        return self

    def all(self):
        return self.itens


class BancoFalso:
    def __init__(self, resultados=(), falhar_commit=False):
        self.resultados = list(resultados)
        self.comandos = []
        self.inseridos = []
        self.excluidos = []
        self.commits = 0
        self.rollbacks = 0
        self.falhar_commit = falhar_commit

    async def execute(self, comando):
        self.comandos.append(comando)
        return self.resultados.pop(0) if self.resultados else Resultado()

    def add(self, objeto):
        self.inseridos.append(objeto)

    async def delete(self, objeto):
        self.excluidos.append(objeto)

    async def commit(self):
        if self.falhar_commit:
            raise SQLAlchemyError("erro simulado")
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1

    async def refresh(self, objeto):
        pass


def loja_exemplo():
    return Loja(id=uuid.uuid4(), lojista_id=uuid.uuid4(), nome_loja="Loja Teste")


def produto_exemplo(loja_id=None, categoria_id=None):
    agora = datetime.now(UTC)
    return Produto(
        id=uuid.uuid4(), loja_id=loja_id or uuid.uuid4(),
        categoria_id=categoria_id or uuid.uuid4(), titulo="Produto Teste",
        descricao="Descrição", preco_base=Decimal("29.90"),
        foto_principal_url=None, ativo=True, criado_em=agora, atualizado_em=agora,
    )


class RF03TestCase(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(router)
        self.cliente = TestClient(self.app)
        self.loja = loja_exemplo()

    def tearDown(self):
        self.cliente.close()
        self.app.dependency_overrides.clear()

    def configurar(self, banco, *, com_loja=True):
        async def db_override():
            yield banco
        self.app.dependency_overrides[get_db] = db_override
        if com_loja:
            async def loja_override():
                return self.loja
            self.app.dependency_overrides[get_lojista_loja] = loja_override

    def payload(self, categoria_id=None):
        return {
            "categoria_id": str(categoria_id or uuid.uuid4()),
            "titulo": "  Caderno de Teste  ",
            "descricao": "Papel 80g",
            "preco_base": "22.50",
            "ativo": True,
        }

    def test_criar_produto_com_loja_autenticada(self):
        banco = BancoFalso([Resultado(Categoria(id=uuid.uuid4(), nome="Papelaria"))])
        self.configurar(banco)
        retorno = self.cliente.post("/lojista/produtos", json=self.payload())
        self.assertEqual(retorno.status_code, 201, retorno.text)
        self.assertEqual(retorno.json()["loja_id"], str(self.loja.id))
        self.assertEqual(retorno.json()["titulo"], "Caderno de Teste")
        self.assertEqual(banco.inseridos[0].loja_id, self.loja.id)
        self.assertEqual(banco.commits, 1)

    def test_nao_aceita_loja_id_forjado(self):
        banco = BancoFalso()
        self.configurar(banco)
        payload = self.payload()
        payload["loja_id"] = str(uuid.uuid4())
        self.assertEqual(self.cliente.post("/lojista/produtos", json=payload).status_code, 422)
        self.assertEqual(banco.commits, 0)

    def test_nao_aceita_preco_negativo(self):
        banco = BancoFalso()
        self.configurar(banco)
        payload = self.payload()
        payload["preco_base"] = "-1.00"
        self.assertEqual(self.cliente.post("/lojista/produtos", json=payload).status_code, 422)

    def test_categoria_inexistente(self):
        banco = BancoFalso([Resultado()])
        self.configurar(banco)
        self.assertEqual(self.cliente.post("/lojista/produtos", json=self.payload()).status_code, 422)
        self.assertEqual(banco.commits, 0)

    def test_lista_somente_produtos_da_loja(self):
        produto = produto_exemplo(self.loja.id)
        banco = BancoFalso([Resultado(itens=[produto])])
        self.configurar(banco)
        retorno = self.cliente.get("/lojista/produtos")
        self.assertEqual(retorno.status_code, 200, retorno.text)
        self.assertEqual(len(retorno.json()), 1)
        self.assertIn(self.loja.id, banco.comandos[0].compile().params.values())
        self.assertIn("loja_id", str(banco.comandos[0].whereclause))

    def test_consulta_produto_da_propria_loja(self):
        produto = produto_exemplo(self.loja.id)
        banco = BancoFalso([Resultado(produto)])
        self.configurar(banco)
        retorno = self.cliente.get(f"/lojista/produtos/{produto.id}")
        self.assertEqual(retorno.status_code, 200, retorno.text)
        parametros = banco.comandos[0].compile().params.values()
        self.assertIn(self.loja.id, parametros)
        self.assertIn(produto.id, parametros)

    def test_produto_de_outra_loja_retorna_404(self):
        produto_id = uuid.uuid4()
        banco = BancoFalso([Resultado()])
        self.configurar(banco)
        retorno = self.cliente.get(f"/lojista/produtos/{produto_id}")
        self.assertEqual(retorno.status_code, 404)
        self.assertIn(self.loja.id, banco.comandos[0].compile().params.values())

    def test_editar_produto(self):
        produto = produto_exemplo(self.loja.id)
        banco = BancoFalso([Resultado(produto)])
        self.configurar(banco)
        retorno = self.cliente.patch(f"/lojista/produtos/{produto.id}", json={"preco_base": "19.90", "ativo": False})
        self.assertEqual(retorno.status_code, 200, retorno.text)
        self.assertEqual(produto.preco_base, Decimal("19.90"))
        self.assertFalse(produto.ativo)
        self.assertEqual(banco.commits, 1)

    def test_editar_categoria_inexistente(self):
        produto = produto_exemplo(self.loja.id)
        banco = BancoFalso([Resultado(produto), Resultado()])
        self.configurar(banco)
        retorno = self.cliente.patch(f"/lojista/produtos/{produto.id}", json={"categoria_id": str(uuid.uuid4())})
        self.assertEqual(retorno.status_code, 422)
        self.assertEqual(banco.commits, 0)

    def test_nao_permite_mudar_loja_pelo_patch(self):
        produto = produto_exemplo(self.loja.id)
        banco = BancoFalso([Resultado(produto)])
        self.configurar(banco)
        retorno = self.cliente.patch(f"/lojista/produtos/{produto.id}", json={"loja_id": str(uuid.uuid4())})
        self.assertEqual(retorno.status_code, 422)
        self.assertEqual(banco.commits, 0)

    def test_excluir_produto(self):
        produto = produto_exemplo(self.loja.id)
        banco = BancoFalso([Resultado(produto)])
        self.configurar(banco)
        retorno = self.cliente.delete(f"/lojista/produtos/{produto.id}")
        self.assertEqual(retorno.status_code, 204, retorno.text)
        self.assertEqual(banco.excluidos, [produto])
        self.assertEqual(banco.commits, 1)

    def test_sem_token_retorna_401(self):
        retorno = self.cliente.get("/lojista/produtos")
        self.assertEqual(retorno.status_code, 401)

    def test_consumidor_retorna_403(self):
        async def consumidor_override():
            return Profile(id=uuid.uuid4(), role=UserRole.consumidor, nome_completo="Teste")
        self.app.dependency_overrides[get_current_profile] = consumidor_override
        retorno = self.cliente.get("/lojista/produtos")
        self.assertEqual(retorno.status_code, 403)

    def test_falha_ao_editar_faz_rollback(self):
        produto = produto_exemplo(self.loja.id)
        banco = BancoFalso([Resultado(produto)], falhar_commit=True)
        self.configurar(banco)
        retorno = self.cliente.patch(f"/lojista/produtos/{produto.id}", json={"titulo": "Outro produto"})
        self.assertEqual(retorno.status_code, 500)
        self.assertEqual(banco.rollbacks, 1)


if __name__ == "__main__":
    unittest.main()
