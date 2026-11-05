import unittest
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.controllers.publico_catalogo import router
from backend.tests.sqlite_produtos_fixture import AdaptadorSessaoAsync, criar_banco_sqlite, inserir_categoria, inserir_loja, inserir_produto


class CatalogoPublicoTest(unittest.TestCase):
    def setUp(self):
        self.engine = criar_banco_sqlite()
        with self.engine.begin() as connection:
            for name in ["lojista_id", "descricao", "endereco_logradouro", "endereco_numero", "endereco_bairro", "endereco_cidade", "endereco_uf", "endereco_cep", "whatsapp", "instagram", "facebook", "logo_url", "motivo_rejeicao", "aprovado_por"]:
                connection.exec_driver_sql(f"ALTER TABLE lojas ADD COLUMN {name} TEXT")
            for name in ["criado_em", "atualizado_em", "aprovado_em"]:
                connection.exec_driver_sql(f"ALTER TABLE lojas ADD COLUMN {name} DATETIME")
            for name in ["latitude", "longitude"]:
                connection.exec_driver_sql(f"ALTER TABLE lojas ADD COLUMN {name} NUMERIC")
            connection.exec_driver_sql("ALTER TABLE lojas ADD COLUMN horario_funcionamento JSON")
        self.shop = inserir_loja(self.engine)
        self.hidden_shop = inserir_loja(self.engine, status="pendente")
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE lojas SET endereco_cidade='Picos', endereco_uf='PI', whatsapp='5589999999999'"))
        self.category = inserir_categoria(self.engine)
        self.other_category = inserir_categoria(self.engine, "Casa")
        self.product = inserir_produto(self.engine, self.shop, self.category, "Caderno Azul", "25.90")
        inserir_produto(self.engine, self.shop, self.other_category, "Agenda", "50.00")
        self.inactive = inserir_produto(self.engine, self.shop, self.category, "Inativo", ativo=False)
        self.hidden = inserir_produto(self.engine, self.hidden_shop, self.category, "Pendente")
        self.session = Session(self.engine)
        app = FastAPI()
        app.include_router(router)

        async def database():
            yield AdaptadorSessaoAsync(self.session)

        app.dependency_overrides[get_db] = database
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.session.close()
        self.engine.dispose()

    def test_publico_sem_token_oculta_inativos_e_lojas_pendentes(self):
        result = self.client.get("/publico/produtos")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(len(result.json()), 2)
        self.assertEqual({p["titulo"] for p in result.json()}, {"Caderno Azul", "Agenda"})

    def test_busca_categoria_loja_e_preco_combinados(self):
        result = self.client.get("/publico/produtos", params={"q": "caderno", "categoria_id": str(self.category), "loja_id": str(self.shop), "preco_min": "20", "preco_max": "30"})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual([p["id"] for p in result.json()], [str(self.product)])
        self.assertEqual(result.json()[0]["nome_categoria"], "Papelaria")

    def test_ordena_e_pagina(self):
        result = self.client.get("/publico/produtos?ordem=menor&limit=1&offset=1")
        self.assertEqual(result.json()[0]["titulo"], "Agenda")

    def test_sem_resultados_e_busca_literal(self):
        self.assertEqual(self.client.get("/publico/produtos?q=inexistente").json(), [])
        self.assertEqual(self.client.get("/publico/produtos?q=%25").json(), [])

    def test_validacao_de_filtros(self):
        for query in ["preco_min=30&preco_max=10", "preco_min=-1", "loja_id=invalido", "ordem=errada", "limit=1000"]:
            self.assertEqual(self.client.get(f"/publico/produtos?{query}").status_code, 422, query)

    def test_detalhes_nao_expoem_produtos_ocultos(self):
        self.assertEqual(self.client.get(f"/publico/produtos/{self.product}").status_code, 200)
        for product_id in [self.inactive, self.hidden, uuid.uuid4()]:
            self.assertEqual(self.client.get(f"/publico/produtos/{product_id}").status_code, 404)

    def test_lojas_publicas_ocultam_proprietario_e_moderacao(self):
        result = self.client.get('/publico/lojas')
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(len(result.json()), 1)
        self.assertEqual(result.json()[0]['id'], str(self.shop))
        self.assertNotIn('lojista_id', result.json()[0])
        self.assertNotIn('motivo_rejeicao', result.json()[0])

    def test_categorias_publicas(self):
        result = self.client.get("/publico/categorias")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.json()), 2)


if __name__ == "__main__":
    unittest.main()
