import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from backend.auth import get_current_profile
from backend.config.database import get_db
from backend.main import app
from backend.models import UserRole


class FakeResult:
    def __init__(self, item=None, items=None, rowcount=0):
        self.item = item
        self.items = items or []
        self.rowcount = rowcount

    def scalar_one_or_none(self):
        return self.item

    def scalars(self):
        return self

    def all(self):
        return self.items


class FakeSession:
    def __init__(self, results=None, fail_commit=False):
        self.results = list(results or [])
        self.fail_commit = fail_commit
        self.added = []
        self.committed = False
        self.rolled_back = False
        self.deleted = []

    async def execute(self, statement):
        return self.results.pop(0) if self.results else FakeResult()

    def add(self, item):
        self.added.append(item)

    async def delete(self, item):
        self.deleted.append(item)

    async def commit(self):
        if self.fail_commit:
            raise IntegrityError("INSERT", {}, Exception("duplicate"))
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    async def refresh(self, item):
        pass


def categoria(nome="Eletrônicos"):
    return SimpleNamespace(id=uuid.uuid4(), nome=nome)


class RF066TestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def autenticar(self, role=UserRole.admin, session=None):
        session = session or FakeSession()

        async def profile_override():
            return SimpleNamespace(id=uuid.uuid4(), role=role)

        async def db_override():
            yield session

        app.dependency_overrides[get_current_profile] = profile_override
        app.dependency_overrides[get_db] = db_override
        return session

    def test_sem_autenticacao_retorna_401(self):
        response = self.client.get("/admin/categorias")
        self.assertEqual(response.status_code, 401)

    def test_consumidor_nao_pode_criar_categoria(self):
        self.autenticar(UserRole.consumidor)
        response = self.client.post("/admin/categorias", json={"nome": "Livros"})
        self.assertEqual(response.status_code, 403)

    def test_lojista_nao_pode_moderar(self):
        self.autenticar(UserRole.lojista)
        response = self.client.delete(f"/admin/moderacao/avaliacoes/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 403)

    def test_admin_lista_categorias(self):
        self.autenticar(session=FakeSession([FakeResult(items=[categoria("Livros")])]))
        response = self.client.get("/admin/categorias")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["nome"], "Livros")

    def test_admin_cria_categoria(self):
        session = self.autenticar()
        response = self.client.post("/admin/categorias", json={"nome": "Livros"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["nome"], "Livros")
        self.assertTrue(session.committed)
        self.assertEqual(len(session.added), 1)

    def test_categoria_duplicada_retorna_409(self):
        session = self.autenticar(session=FakeSession(fail_commit=True))
        response = self.client.post("/admin/categorias", json={"nome": "Livros"})
        self.assertEqual(response.status_code, 409)
        self.assertTrue(session.rolled_back)

    def test_admin_edita_categoria(self):
        item = categoria("Livros")
        session = self.autenticar(session=FakeSession([FakeResult(item=item)]))
        response = self.client.put(f"/admin/categorias/{item.id}", json={"nome": "Papelaria"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["nome"], "Papelaria")
        self.assertTrue(session.committed)

    def test_admin_exclui_categoria(self):
        item = categoria("Livros")
        session = self.autenticar(session=FakeSession([FakeResult(item=item)]))
        response = self.client.delete(f"/admin/categorias/{item.id}")
        self.assertEqual(response.status_code, 204)
        self.assertTrue(session.committed)
        self.assertEqual(session.deleted, [item])

    def test_categoria_inexistente_retorna_404(self):
        self.autenticar()
        response = self.client.delete(f"/admin/categorias/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 404)

    def test_admin_lista_avaliacoes(self):
        avaliacao = SimpleNamespace(
            id=uuid.uuid4(), loja_id=uuid.uuid4(), usuario_id=uuid.uuid4(),
            nota=4, comentario="Boa loja", foto_url="https://example.com/foto.jpg",
            criado_em=datetime.now(UTC),
        )
        self.autenticar(session=FakeSession([FakeResult(items=[avaliacao])]))
        response = self.client.get("/admin/moderacao/avaliacoes")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["nota"], 4)

    def test_admin_remove_avaliacao(self):
        session = self.autenticar(session=FakeSession([FakeResult(rowcount=1)]))
        response = self.client.delete(f"/admin/moderacao/avaliacoes/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 204)
        self.assertTrue(session.committed)

    def test_admin_remove_foto(self):
        session = self.autenticar(session=FakeSession([FakeResult(rowcount=1)]))
        response = self.client.delete(f"/admin/moderacao/avaliacao-fotos/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 204)
        self.assertTrue(session.committed)


if __name__ == "__main__":
    unittest.main()
