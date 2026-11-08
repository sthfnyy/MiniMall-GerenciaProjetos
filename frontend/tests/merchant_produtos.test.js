import test from "node:test";
import assert from "node:assert/strict";
import { canAccessRoute } from "../services/auth.js";
import {
  createStoreProduct,
  deleteStoreProduct,
  fetchProductCategories,
  getStoreProduct,
  getStoreProducts,
  productPayload,
  updateStoreProduct,
} from "../services/merchant.js";

const product = (overrides = {}) => ({
  id: "7800fcb0-03a3-48c6-a413-cf339f67d555",
  loja_id: "1ad8150b-eaf6-4c68-9d34-0a18321b6630",
  categoria_id: "8134d10c-ddce-4e4f-8fe9-446719882c86",
  titulo: "Caderno",
  descricao: "Capa dura",
  preco_base: "22.50",
  foto_principal_url: "https://example.com/caderno.png",
  ativo: true,
  ...overrides,
});

const form = (overrides = {}) => ({
  categoria_id: "8134d10c-ddce-4e4f-8fe9-446719882c86",
  titulo: "Caderno",
  descricao: "Capa dura",
  preco_base: "22.50",
  foto_principal_url: "https://example.com/caderno.png",
  ativo: true,
  ...overrides,
});

test("GET lista produtos e preserva UUID como string", async () => {
  const calls = [];
  const result = await getStoreProducts(async (...args) => { calls.push(args); return [product()]; });
  assert.deepEqual(calls[0], ["/lojista/produtos"]);
  assert.equal(result[0].id, "7800fcb0-03a3-48c6-a413-cf339f67d555");
  assert.equal(typeof result[0].id, "string");
  assert.equal(result[0].preco_base, 22.5);
});

test("GET consulta produto específico sem converter o ID", async () => {
  let url;
  const id = "7800fcb0-03a3-48c6-a413-cf339f67d555";
  const result = await getStoreProduct(id, async (nextUrl) => { url = nextUrl; return product(); });
  assert.equal(url, `/lojista/produtos/${id}`);
  assert.equal(result.id, id);
});

test("POST cria produto sem enviar loja_id", async () => {
  let call;
  await createStoreProduct(form({ loja_id: "forjada" }), async (url, options) => {
    call = { url, options };
    return product();
  });
  assert.equal(call.url, "/lojista/produtos");
  assert.equal(call.options.method, "POST");
  const body = JSON.parse(call.options.body);
  assert.equal(body.loja_id, undefined);
  assert.equal(body.categoria_id, form().categoria_id);
  assert.equal(body.preco_base, "22.50");
  assert.equal(body.ativo, true);
});

test("PATCH edita produto e preserva controle ativo/inativo", async () => {
  let call;
  const id = product().id;
  const result = await updateStoreProduct(id, form({ ativo: false }), async (url, options) => {
    call = { url, options };
    return product({ ativo: false });
  });
  assert.equal(call.url, `/lojista/produtos/${id}`);
  assert.equal(call.options.method, "PATCH");
  assert.equal(JSON.parse(call.options.body).ativo, false);
  assert.equal(result.ativo, false);
});

test("DELETE aceita resposta 204 e usa o UUID", async () => {
  let call;
  const id = product().id;
  const result = await deleteStoreProduct(id, async (url, options) => { call = { url, options }; return null; });
  assert.equal(call.url, `/lojista/produtos/${id}`);
  assert.equal(call.options.method, "DELETE");
  assert.equal(result, true);
});

test("valida título, categoria, preço e URL", () => {
  assert.throws(() => productPayload(form({ titulo: "A" })), /nome do produto/);
  assert.throws(() => productPayload(form({ categoria_id: "" })), /categoria/);
  assert.throws(() => productPayload(form({ preco_base: "-1" })), /preço válido/);
  assert.throws(() => productPayload(form({ preco_base: "12.999" })), /duas casas/);
  assert.throws(() => productPayload(form({ foto_principal_url: "imagem.png" })), /URL de imagem/);
  assert.equal(productPayload(form({ ativo: false })).ativo, false);
});

test("erros de ausência de loja, 403 e 404 são propagados", async () => {
  for (const status of [403, 404, 500]) {
    const error = new Error(`Erro ${status}`);
    error.status = status;
    await assert.rejects(getStoreProducts(async () => { throw error; }), new RegExp(String(status)));
  }
});

test("consumidor não acessa rotas de produtos", () => {
  assert.equal(canAccessRoute("lojista/produtos", { role: "consumidor" }), false);
  assert.equal(canAccessRoute("lojista/produtos/novo", { role: "consumidor" }), false);
  assert.equal(canAccessRoute(`lojista/produtos/editar/${product().id}`, { role: "consumidor" }), false);
  assert.equal(canAccessRoute("lojista/produtos", { role: "lojista" }), true);
});

test("categorias permanecem bloqueadas sem endpoint real", async () => {
  await assert.rejects(fetchProductCategories(), /não disponibiliza categorias/);
});
