"""Jornadas completas pela API real do FastAPI sobre SQLite em memória.

Cobre as rotas principais e a regra de compra confirmada:
loja → aprovação → produto → vitrine → confirmação de compra → avaliação →
fotos → pontos → visão pública/lojista → moderação → favoritos → perfil.
"""

import unittest
import uuid
from unittest.mock import AsyncMock, patch

from backend.controllers import consumer_avaliacoes
from backend.services import avaliacoes as servico_avaliacoes
from backend.tests.sqlite_minimall_fixture import PAYLOAD_LOJA, PNG_1PX, Cenario


class JornadasTestCase(unittest.TestCase):
    def setUp(self):
        self.c = Cenario()
        self.admin = self.c.criar_usuario("admin", "Admin MiniMall")
        self.lojista = self.c.criar_usuario("lojista", "Lia Lojista", "lia@exemplo.com")
        self.consumidor = self.c.criar_usuario("consumidor", "Maria da Silva")
        self.outro_consumidor = self.c.criar_usuario("consumidor", "João Souza")
        self.categoria = self.c.criar_categoria("Vestuário")
        self.c.criar_categoria("Acessórios")
        # O upload real vai ao Supabase Storage; aqui só a URL é simulada.
        self.upload = patch.object(
            consumer_avaliacoes, "upload_foto", new_callable=AsyncMock,
            side_effect=lambda caminho, *_: f"https://storage.test/fotos-avaliacoes/{caminho}",
        ).start()
        self.limpeza_consumidor = patch.object(consumer_avaliacoes, "limpar_storage", new_callable=AsyncMock).start()
        self.limpeza_admin = patch(
            "backend.controllers.admin_moderacao.limpar_storage", new_callable=AsyncMock
        ).start()

    def tearDown(self):
        patch.stopall()
        self.c.fechar()

    # ------------------------------------------------------------------ apoio

    def preparar_loja_aprovada_com_produto(self):
        api = self.c.como(self.lojista)
        loja = api.post("/lojista/loja", json=PAYLOAD_LOJA)
        self.assertEqual(loja.status_code, 201, loja.text)
        loja_id = loja.json()["id"]
        aprovacao = self.c.como(self.admin).patch(f"/admin/lojas/{loja_id}/aprovar")
        self.assertEqual(aprovacao.status_code, 200, aprovacao.text)
        produto = self.c.como(self.lojista).post("/lojista/produtos", json={
            "categoria_id": str(self.categoria), "titulo": "Camisa Linho",
            "descricao": "Tecido leve e fresco", "preco_base": "120.00", "ativo": True,
        })
        self.assertEqual(produto.status_code, 201, produto.text)
        return loja_id, produto.json()["id"]

    def confirmar_compra(self, loja_id, produto_id, consumidor=None):
        consumidor = consumidor or self.consumidor
        pedido = self.c.como(consumidor).post(
            "/consumidor/intencoes-compra", json={"produto_id": produto_id, "loja_id": loja_id}
        )
        self.assertEqual(pedido.status_code, 201, pedido.text)
        decisao = self.c.como(self.lojista).patch(
            f"/lojista/intencoes-compra/{pedido.json()['id']}", json={"status": "compra_confirmada"}
        )
        self.assertEqual(decisao.status_code, 200, decisao.text)
        return pedido.json()

    # ------------------------------------------------------- loja e aprovação

    def test_loja_pendente_aprovada_e_rejeitada(self):
        api = self.c.como(self.lojista)
        loja = api.post("/lojista/loja", json=PAYLOAD_LOJA).json()
        self.assertEqual(loja["status"], "pendente")
        self.assertEqual(self.c.como(None).get(f"/lojas/{loja['id']}").status_code, 404)

        admin = self.c.como(self.admin)
        pendentes = admin.get("/admin/lojas?status_filtro=pendente").json()
        self.assertEqual([item["id"] for item in pendentes], [loja["id"]])
        self.assertEqual(pendentes[0]["lojista_nome"], "Lia Lojista")
        self.assertEqual(pendentes[0]["lojista_email"], "lia@exemplo.com")

        self.assertEqual(admin.patch(f"/admin/lojas/{loja['id']}/rejeitar", json={"motivo_rejeicao": "x"}).status_code, 422)
        rejeitada = admin.patch(f"/admin/lojas/{loja['id']}/rejeitar",
                                json={"motivo_rejeicao": "Endereço incompleto"})
        self.assertEqual(rejeitada.json()["status"], "rejeitada")
        self.assertEqual(self.c.como(self.lojista).get("/lojista/loja").json()["motivo_rejeicao"], "Endereço incompleto")

        nova = self.c.como(self.lojista).post("/lojista/loja/solicitar-aprovacao")
        self.assertEqual(nova.json()["status"], "pendente")
        aprovada = self.c.como(self.admin).patch(f"/admin/lojas/{loja['id']}/aprovar").json()
        self.assertEqual(aprovada["status"], "aprovada")
        self.assertIsNone(aprovada["motivo_rejeicao"])

        publica = self.c.como(None).get(f"/lojas/{loja['id']}").json()
        self.assertEqual(publica["nome_loja"], "Loja da Apresentação")
        self.assertEqual(publica["horario_funcionamento"], {"descricao": "Seg a Sex, 8h às 18h"})
        self.assertNotIn("lojista_id", publica)
        self.assertNotIn("motivo_rejeicao", publica)
        # Loja aprovada aparece mesmo sem produtos.
        self.assertEqual([item["id"] for item in self.c.como(None).get("/lojas").json()], [loja["id"]])

    def test_somente_admin_modera_lojas(self):
        loja = self.c.como(self.lojista).post("/lojista/loja", json=PAYLOAD_LOJA).json()
        for usuario in (self.lojista, self.consumidor):
            api = self.c.como(usuario)
            self.assertEqual(api.get("/admin/lojas").status_code, 403)
            self.assertEqual(api.patch(f"/admin/lojas/{loja['id']}/aprovar").status_code, 403)
        self.assertEqual(self.c.como(None).get("/admin/lojas").status_code, 401)

    def test_consumidor_nao_cria_loja(self):
        resposta = self.c.como(self.consumidor).post("/lojista/loja", json=PAYLOAD_LOJA)
        self.assertEqual(resposta.status_code, 403)
        self.assertEqual(self.c.sql("SELECT count(*) FROM lojas")[0][0], 0)

    # --------------------------------------------------------------- produtos

    def test_crud_de_produto_com_categorias_e_vitrine(self):
        loja_id, produto_id = self.preparar_loja_aprovada_com_produto()
        api = self.c.como(self.lojista)

        categorias = api.get("/lojista/produtos/categorias")
        self.assertEqual(categorias.status_code, 200, categorias.text)
        self.assertEqual([item["nome"] for item in categorias.json()], ["Acessórios", "Vestuário"])
        self.assertEqual(self.c.como(self.consumidor).get("/lojista/produtos/categorias").status_code, 403)

        editado = api.patch(f"/lojista/produtos/{produto_id}", json={
            "titulo": "Camisa de Linho", "preco_promocional": "99.90"})
        self.assertEqual(editado.status_code, 200, editado.text)
        self.assertEqual(editado.json()["preco_promocional"], "99.90")
        self.assertEqual(api.patch(f"/lojista/produtos/{produto_id}", json={"preco_promocional": "150.00"}).status_code, 422)

        vitrine = self.c.como(None).get("/produtos?q=linho").json()
        self.assertEqual([item["id"] for item in vitrine], [produto_id])
        # RF20: busca também pela descrição.
        self.assertEqual(len(self.c.como(None).get("/produtos?q=fresco").json()), 1)
        self.assertEqual(self.c.como(None).get("/lojas").json()[0]["total_produtos"], 1)

        self.assertEqual(api.patch(f"/lojista/produtos/{produto_id}", json={"ativo": False}).status_code, 200)
        self.assertEqual(self.c.como(None).get("/produtos").json(), [])
        self.assertEqual(api.delete(f"/lojista/produtos/{produto_id}").status_code, 204)
        self.assertEqual(api.get("/lojista/produtos").json(), [])

    # ------------------------------------------------- compra confirmada

    def test_avaliacao_exige_compra_confirmada(self):
        loja_id, produto_id = self.preparar_loja_aprovada_com_produto()
        consumidor = self.c.como(self.consumidor)
        avaliacao = {"loja_id": loja_id, "nota": 5, "comentario": "Ótimo atendimento"}

        sem_compra = consumidor.post("/consumidor/avaliacoes", json=avaliacao)
        self.assertEqual(sem_compra.status_code, 403)
        self.assertIn("confirmada", sem_compra.json()["detail"])

        pedido = consumidor.post("/consumidor/intencoes-compra",
                                 json={"produto_id": produto_id, "loja_id": loja_id})
        self.assertEqual(pedido.status_code, 201, pedido.text)
        self.assertEqual(pedido.json()["status"], "contato_realizado")
        self.assertRegex(pedido.json()["codigo"], r"^MM-[0-9A-F]{4}$")
        duplicado = consumidor.post("/consumidor/intencoes-compra",
                                    json={"produto_id": produto_id, "loja_id": loja_id})
        self.assertEqual(duplicado.status_code, 409)
        # Pendente ainda não libera a avaliação.
        self.assertEqual(consumidor.post("/consumidor/avaliacoes", json=avaliacao).status_code, 403)

        lista_lojista = self.c.como(self.lojista).get("/lojista/intencoes-compra").json()
        self.assertEqual(lista_lojista[0]["consumidor"]["nome"], "Maria da Silva")
        rejeicao = self.c.como(self.lojista).patch(
            f"/lojista/intencoes-compra/{pedido.json()['id']}", json={"status": "compra_nao_reconhecida"})
        self.assertEqual(rejeicao.json()["status"], "compra_nao_reconhecida")
        self.assertEqual(self.c.como(self.lojista).patch(
            f"/lojista/intencoes-compra/{pedido.json()['id']}", json={"status": "compra_confirmada"}).status_code, 409)
        self.assertEqual(self.c.como(self.consumidor).post("/consumidor/avaliacoes", json=avaliacao).status_code, 403)

        self.confirmar_compra(loja_id, produto_id)
        self.assertEqual(self.c.como(self.consumidor).post("/consumidor/avaliacoes", json=avaliacao).status_code, 201)
        estados = sorted(item["status"] for item in self.c.como(self.consumidor).get("/consumidor/intencoes-compra").json())
        self.assertEqual(estados, ["compra_confirmada", "compra_nao_reconhecida"])

    def test_compra_confirmada_de_um_consumidor_nao_libera_outro(self):
        loja_id, produto_id = self.preparar_loja_aprovada_com_produto()
        self.confirmar_compra(loja_id, produto_id)
        resposta = self.c.como(self.outro_consumidor).post(
            "/consumidor/avaliacoes", json={"loja_id": loja_id, "nota": 4})
        self.assertEqual(resposta.status_code, 403)

    def test_lojista_nao_decide_compra_de_outra_loja(self):
        loja_id, produto_id = self.preparar_loja_aprovada_com_produto()
        pedido = self.c.como(self.consumidor).post(
            "/consumidor/intencoes-compra", json={"produto_id": produto_id, "loja_id": loja_id}).json()
        outro_lojista = self.c.criar_usuario("lojista", "Outro Lojista")
        self.c.como(outro_lojista).post("/lojista/loja", json={**PAYLOAD_LOJA, "nome_loja": "Outra"})
        resposta = self.c.como(outro_lojista).patch(
            f"/lojista/intencoes-compra/{pedido['id']}", json={"status": "compra_confirmada"})
        self.assertEqual(resposta.status_code, 404)
        self.assertEqual(self.c.como(self.consumidor).patch(
            f"/lojista/intencoes-compra/{pedido['id']}", json={"status": "compra_confirmada"}).status_code, 403)

    # ---------------------------------------- avaliações, fotos e pontos

    def test_jornada_de_avaliacao_com_fotos_e_pontos(self):
        loja_id, produto_id = self.preparar_loja_aprovada_com_produto()
        self.confirmar_compra(loja_id, produto_id)
        api = self.c.como(self.consumidor)

        criada = api.post("/consumidor/avaliacoes", json={"loja_id": loja_id, "nota": 4, "comentario": "Bom"})
        self.assertEqual(criada.status_code, 201, criada.text)
        avaliacao_id = criada.json()["id"]
        self.assertEqual(api.post("/consumidor/avaliacoes", json={"loja_id": loja_id, "nota": 5}).status_code, 409)

        foto = api.post(f"/consumidor/avaliacoes/{avaliacao_id}/fotos",
                        files={"arquivo": ("foto.png", PNG_1PX, "image/png")})
        self.assertEqual(foto.status_code, 201, foto.text)
        invalida = api.post(f"/consumidor/avaliacoes/{avaliacao_id}/fotos",
                            files={"arquivo": ("foto.png", b"nao e imagem", "image/png")})
        self.assertEqual(invalida.status_code, 415)

        minhas = api.get("/consumidor/avaliacoes")
        self.assertEqual(minhas.status_code, 200, minhas.text)
        self.assertEqual(minhas.json()[0]["loja_nome"], "Loja da Apresentação")
        self.assertEqual(len(minhas.json()[0]["fotos"]), 1)

        pontos = api.get("/consumidor/pontos").json()
        self.assertEqual(pontos["saldo_total"], 15)
        self.assertEqual(sorted(item["origem"] for item in pontos["historico"]), ["avaliacao", "foto"])
        self.assertEqual(pontos["saldos_por_loja"][0]["nome_loja"], "Loja da Apresentação")

        editada = api.patch(f"/consumidor/avaliacoes/{avaliacao_id}", json={"nota": 5, "comentario": "Excelente"})
        self.assertEqual(editada.status_code, 200, editada.text)
        self.assertEqual(editada.json()["nota"], 5)
        self.assertEqual(len(editada.json()["fotos"]), 1)
        self.assertEqual(api.get("/consumidor/pontos").json()["saldo_total"], 15)  # edição não gera pontos
        self.assertEqual(self.c.como(self.outro_consumidor).patch(
            f"/consumidor/avaliacoes/{avaliacao_id}", json={"nota": 1}).status_code, 404)

        publicas = self.c.como(None).get(f"/lojas/{loja_id}/avaliacoes").json()
        self.assertEqual(publicas[0]["consumidor_nome"], "Maria S.")
        self.assertEqual(publicas[0]["comentario"], "Excelente")
        self.assertEqual(len(publicas[0]["fotos"]), 1)
        loja_publica = self.c.como(None).get(f"/lojas/{loja_id}").json()
        self.assertEqual((loja_publica["media_avaliacoes"], loja_publica["total_avaliacoes"]), (5.0, 1))

        do_lojista = self.c.como(self.lojista).get("/lojista/avaliacoes").json()
        self.assertEqual(do_lojista[0]["consumidor_nome"], "Maria da Silva")
        self.assertEqual(len(do_lojista[0]["fotos"]), 1)

        foto_id = foto.json()["id"]
        self.assertEqual(api.delete(f"/consumidor/avaliacoes/{avaliacao_id}/fotos/{foto_id}").status_code, 204)
        self.assertEqual(api.get("/consumidor/pontos").json()["saldo_total"], 10)
        self.assertEqual(api.delete(f"/consumidor/avaliacoes/{avaliacao_id}").status_code, 204)
        self.assertEqual(api.get("/consumidor/pontos").json()["saldo_total"], 0)
        self.assertEqual(api.get("/consumidor/avaliacoes").json(), [])

    def test_lojista_sem_avaliacoes_recebe_lista_vazia(self):
        self.preparar_loja_aprovada_com_produto()
        resposta = self.c.como(self.lojista).get("/lojista/avaliacoes")
        self.assertEqual((resposta.status_code, resposta.json()), (200, []))

    def test_moderacao_estorna_pontos_e_remove_fotos(self):
        loja_id, produto_id = self.preparar_loja_aprovada_com_produto()
        self.confirmar_compra(loja_id, produto_id)
        api = self.c.como(self.consumidor)
        avaliacao_id = api.post("/consumidor/avaliacoes", json={"loja_id": loja_id, "nota": 1}).json()["id"]
        for indice in range(2):
            api.post(f"/consumidor/avaliacoes/{avaliacao_id}/fotos",
                     files={"arquivo": (f"f{indice}.png", PNG_1PX, "image/png")})
        self.assertEqual(api.get("/consumidor/pontos").json()["saldo_total"], 20)

        admin = self.c.como(self.admin)
        lista = admin.get("/admin/moderacao/avaliacoes").json()
        self.assertEqual(lista[0]["consumidor_nome"], "Maria da Silva")
        self.assertEqual(lista[0]["loja_nome"], "Loja da Apresentação")
        self.assertEqual(len(lista[0]["fotos"]), 2)

        foto_id = lista[0]["fotos"][0]["id"]
        self.assertEqual(admin.delete(f"/admin/moderacao/avaliacao-fotos/{foto_id}").status_code, 204)
        self.assertEqual(self.c.como(self.consumidor).get("/consumidor/pontos").json()["saldo_total"], 15)

        self.assertEqual(self.c.como(self.admin).delete(f"/admin/moderacao/avaliacoes/{avaliacao_id}").status_code, 204)
        self.assertEqual(self.c.como(self.consumidor).get("/consumidor/pontos").json()["saldo_total"], 0)
        self.assertEqual(self.c.sql("SELECT count(*) FROM pontos_transacoes")[0][0], 0)
        self.assertEqual(self.c.sql("SELECT count(*) FROM avaliacao_fotos")[0][0], 0)
        self.limpeza_admin.assert_awaited()
        self.assertEqual(self.c.como(None).get(f"/lojas/{loja_id}/avaliacoes").json(), [])

    def test_avaliacoes_publicas_de_loja_pendente_nao_sao_expostas(self):
        loja = self.c.como(self.lojista).post("/lojista/loja", json=PAYLOAD_LOJA).json()
        self.assertEqual(self.c.como(None).get(f"/lojas/{loja['id']}/avaliacoes").status_code, 404)

    # ------------------------------------------------- favoritos e perfil

    def test_favoritos_sem_regressao(self):
        _, produto_id = self.preparar_loja_aprovada_com_produto()
        api = self.c.como(self.consumidor)
        self.assertEqual(api.post("/consumidor/favoritos", json={"produto_id": produto_id}).status_code, 201)
        self.assertEqual(api.post("/consumidor/favoritos", json={"produto_id": produto_id}).status_code, 409)
        self.assertEqual([item["produto"]["id"] for item in api.get("/consumidor/favoritos").json()], [produto_id])
        self.assertEqual(api.delete(f"/consumidor/favoritos/{produto_id}").status_code, 204)
        self.assertEqual(api.get("/consumidor/favoritos").json(), [])
        self.assertEqual(self.c.como(self.lojista).get("/consumidor/favoritos").status_code, 403)

    def test_perfil_do_consumidor_editavel_sem_alterar_papel(self):
        api = self.c.como(self.consumidor)
        self.assertEqual(api.get("/consumidor/perfil").json()["nome_completo"], "Maria da Silva")
        atualizado = api.patch("/consumidor/perfil", json={"nome_completo": "Maria Souza", "telefone": "(89) 99999-0000"})
        self.assertEqual(atualizado.status_code, 200, atualizado.text)
        self.assertEqual(atualizado.json()["nome_completo"], "Maria Souza")
        self.assertEqual(api.patch("/consumidor/perfil", json={"role": "admin"}).status_code, 422)
        self.assertEqual(api.patch("/consumidor/perfil", json={"telefone": "123"}).status_code, 422)
        self.assertEqual(self.c.sql("SELECT role FROM profiles WHERE id = :id", id=self.consumidor.hex)[0][0], "consumidor")
        self.assertEqual(self.c.como(self.lojista).get("/consumidor/perfil").status_code, 403)


class NomeAbreviadoTestCase(unittest.TestCase):
    def test_nome_publico_abreviado(self):
        self.assertEqual(servico_avaliacoes.nome_abreviado("Maria da Silva"), "Maria S.")
        self.assertEqual(servico_avaliacoes.nome_abreviado("Ana"), "Ana")
        self.assertEqual(servico_avaliacoes.nome_abreviado(None), "Consumidor")

    def test_origem_das_movimentacoes(self):
        foto = uuid.uuid4()
        self.assertEqual(servico_avaliacoes.origem_movimentacao(f"RF08:foto:{foto}", None), "foto")
        self.assertEqual(servico_avaliacoes.origem_movimentacao("Pontos por avaliação publicada", None), "avaliacao")
        self.assertEqual(servico_avaliacoes.origem_movimentacao(None, None), "outro")


if __name__ == "__main__":
    unittest.main()
