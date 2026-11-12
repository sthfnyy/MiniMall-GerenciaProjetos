import unittest
import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.main import app
from backend.tests.sqlite_produtos_fixture import (
    AdaptadorSessaoAsync,
    criar_banco_sqlite,
    inserir_categoria,
    inserir_loja,
    inserir_produto,
)


class RF04BuscaFiltrosTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = criar_banco_sqlite()
        self.loja_a = inserir_loja(self.engine, "Loja A")
        self.loja_b = inserir_loja(self.engine, "Loja B")
        self.loja_pendente = inserir_loja(self.engine, "Loja Pendente", status="pendente")
        self.cat_vestuario = inserir_categoria(self.engine, "Vestuário")
        self.cat_calcados = inserir_categoria(self.engine, "Calçados")

        inserir_produto(self.engine, self.loja_a, self.cat_vestuario, "Camiseta Algodão", "79.90")
        inserir_produto(self.engine, self.loja_a, self.cat_vestuario, "Vestido Casual", "139.90")
        inserir_produto(self.engine, self.loja_a, self.cat_calcados, "Tênis Casual", "189.00")
        inserir_produto(self.engine, self.loja_b, self.cat_calcados, "Sandália", "99.90")
        inserir_produto(self.engine, self.loja_a, self.cat_vestuario, "Produto Inativo", "50.00", ativo=False)
        inserir_produto(self.engine, self.loja_pendente, self.cat_vestuario, "Produto Loja Pendente", "60.00")

        self.sessao = Session(self.engine, expire_on_commit=False)
        adaptador = AdaptadorSessaoAsync(self.sessao)

        async def db_override():
            yield adaptador

        app.dependency_overrides.clear()
        app.dependency_overrides[get_db] = db_override
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()
        self.sessao.close()
        self.engine.dispose()

    def titulos(self, resposta):
        return [p["titulo"] for p in resposta.json()]

    def test_lista_publica_sem_token(self):
        resposta = self.client.get("/produtos")
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertEqual(
            self.titulos(resposta),
            ["Camiseta Algodão", "Sandália", "Tênis Casual", "Vestido Casual"],
        )

    def test_nao_lista_produto_inativo_nem_de_loja_pendente(self):
        titulos = self.titulos(self.client.get("/produtos"))
        self.assertNotIn("Produto Inativo", titulos)
        self.assertNotIn("Produto Loja Pendente", titulos)

    def test_retorna_dados_da_vitrine(self):
        produto = self.client.get("/produtos?q=camiseta").json()[0]
        for campo in (
            "id", "loja_id", "categoria_id", "titulo", "descricao", "preco_base",
            "foto_principal_url", "ativo", "nome_loja", "nome_categoria",
        ):
            self.assertIn(campo, produto)
        self.assertEqual(produto["nome_loja"], "Loja A")
        self.assertEqual(produto["nome_categoria"], "Vestuário")

    def test_pesquisa_por_nome(self):
        self.assertEqual(self.titulos(self.client.get("/produtos?q=casual")), ["Tênis Casual", "Vestido Casual"])

    def test_pesquisa_ignora_maiusculas(self):
        self.assertEqual(self.titulos(self.client.get("/produtos?q=CASUAL")), ["Tênis Casual", "Vestido Casual"])

    def test_pesquisa_sem_resultados(self):
        resposta = self.client.get("/produtos?q=xyz")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json(), [])

    def test_filtro_por_categoria(self):
        resposta = self.client.get(f"/produtos?categoria_id={self.cat_calcados}")
        self.assertEqual(self.titulos(resposta), ["Sandália", "Tênis Casual"])

    def test_filtro_por_preco_minimo(self):
        resposta = self.client.get("/produtos?preco_min=100")
        self.assertEqual(self.titulos(resposta), ["Tênis Casual", "Vestido Casual"])

    def test_filtro_por_preco_maximo(self):
        resposta = self.client.get("/produtos?preco_max=100")
        self.assertEqual(self.titulos(resposta), ["Camiseta Algodão", "Sandália"])

    def test_filtro_por_faixa_de_preco(self):
        resposta = self.client.get("/produtos?preco_min=90&preco_max=150")
        self.assertEqual(self.titulos(resposta), ["Sandália", "Vestido Casual"])

    def test_filtro_por_loja(self):
        resposta = self.client.get(f"/produtos?loja_id={self.loja_b}")
        self.assertEqual(self.titulos(resposta), ["Sandália"])

    def test_filtro_por_loja_inexistente(self):
        resposta = self.client.get(f"/produtos?loja_id={uuid.uuid4()}")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json(), [])

    def test_filtros_combinados(self):
        resposta = self.client.get(
            f"/produtos?categoria_id={self.cat_vestuario}&preco_max=100&q=camiseta"
        )
        self.assertEqual(self.titulos(resposta), ["Camiseta Algodão"])

    def test_parametros_invalidos_retornam_422(self):
        for query in (
            "preco_min=-1",
            "preco_min=abc",
            "preco_min=50&preco_max=10",
            "categoria_id=abc",
            "loja_id=abc",
            "limit=0",
            "limit=101",
            "offset=-1",
        ):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/produtos?{query}").status_code, 422)

    def test_paginacao(self):
        resposta = self.client.get("/produtos?limit=2&offset=1")
        self.assertEqual(self.titulos(resposta), ["Sandália", "Tênis Casual"])

if __name__ == "__main__":
    unittest.main()