import unittest
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.controllers.lojista_loja import get_lojista_loja
from backend.controllers.lojista_produtos import router
from backend.models import Loja
from backend.tests.sqlite_produtos_fixture import (
    AdaptadorSessaoAsync, criar_banco_sqlite, inserir_categoria, inserir_loja,
)


class RF03SQLiteTestCase(unittest.TestCase):
    def test_fluxo_crud_com_duas_lojas(self):
        engine = criar_banco_sqlite()
        loja_a = inserir_loja(engine, "Loja A")
        loja_b = inserir_loja(engine, "Loja B")
        categoria = inserir_categoria(engine)
        app = FastAPI()
        app.include_router(router)
        usuario = {"loja_id": loja_a}

        async def loja_autenticada():
            return Loja(id=usuario["loja_id"], lojista_id=uuid.uuid4())

        with Session(engine, expire_on_commit=False) as sessao:
            adaptador = AdaptadorSessaoAsync(sessao)

            async def db_override():
                yield adaptador

            app.dependency_overrides[get_db] = db_override
            app.dependency_overrides[get_lojista_loja] = loja_autenticada
            with TestClient(app) as cliente:
                cadastro = cliente.post("/lojista/produtos", json={
                    "titulo": "Agenda Escolar", "categoria_id": str(categoria),
                    "preco_base": "49.90", "ativo": True,
                })
                self.assertEqual(cadastro.status_code, 201, cadastro.text)
                produto_id = cadastro.json()["id"]
                self.assertEqual(cadastro.json()["loja_id"], str(loja_a))

                consulta = cliente.get("/lojista/produtos")
                self.assertEqual(consulta.status_code, 200, consulta.text)
                self.assertEqual(len(consulta.json()), 1)

                alteracao = cliente.patch(f"/lojista/produtos/{produto_id}", json={"preco_base": "39.90"})
                self.assertEqual(alteracao.status_code, 200, alteracao.text)
                self.assertEqual(alteracao.json()["preco_base"], "39.90")

                usuario["loja_id"] = loja_b
                self.assertEqual(cliente.get(f"/lojista/produtos/{produto_id}").status_code, 404)
                self.assertEqual(cliente.delete(f"/lojista/produtos/{produto_id}").status_code, 404)
                usuario["loja_id"] = loja_a
                self.assertEqual(cliente.delete(f"/lojista/produtos/{produto_id}").status_code, 204)
                self.assertEqual(cliente.get("/lojista/produtos").json(), [])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
