import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decideMerchantPurchase,
  fetchConsumerPurchases,
  fetchMerchantPurchases,
  friendlyPurchaseError,
  productPurchase,
  purchaseStatusInfo,
  requestPurchaseConfirmation,
  storePurchaseState,
  updatePurchaseInList,
} from "../services/purchases.js";
import { canAccessRoute } from "../services/auth.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
const STORE = "1ad8150b-eaf6-4c68-9d34-0a18321b6630";
const purchase = (status, overrides = {}) => ({
  id: `p-${status}`,
  codigo: "MM-1A2B",
  status,
  produto: { id: "prod-1", titulo: "Camisa" },
  loja: { id: STORE, nome: "Dona Flor" },
  criado_em: "2026-11-20T12:00:00Z",
  ...overrides,
});

test("consumidor solicita confirmação com produto e loja", async () => {
  const calls = [];
  await requestPurchaseConfirmation("prod-1", STORE, async (path, options) => {
    calls.push({ path, options });
    return purchase("contato_realizado");
  });
  assert.equal(calls[0].path, "/consumidor/intencoes-compra");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { produto_id: "prod-1", loja_id: STORE });
  await assert.rejects(requestPurchaseConfirmation("", STORE, async () => ({})), /Selecione o produto/);
});

test("listagens usam as rotas reais de consumidor e lojista", async () => {
  const paths = [];
  const request = async (path) => { paths.push(path); return [purchase("contato_realizado")]; };
  assert.equal((await fetchConsumerPurchases(request)).length, 1);
  assert.equal((await fetchMerchantPurchases(request)).length, 1);
  assert.deepEqual(paths, ["/consumidor/intencoes-compra", "/lojista/intencoes-compra"]);
  assert.deepEqual(await fetchConsumerPurchases(async () => null), []);
});

test("lojista decide apenas entre confirmar e não reconhecer", async () => {
  const calls = [];
  await decideMerchantPurchase("p-1", "compra_confirmada", async (path, options) => {
    calls.push({ path, options });
    return purchase("compra_confirmada");
  });
  assert.equal(calls[0].path, "/lojista/intencoes-compra/p-1");
  assert.equal(calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body), { status: "compra_confirmada" });
  await assert.rejects(decideMerchantPurchase("p-1", "contato_realizado", async () => ({})), /Decisão inválida/);
});

test("estados são exibidos como Pendente, Confirmada e Rejeitada", () => {
  assert.equal(purchaseStatusInfo("contato_realizado").label, "Pendente");
  assert.equal(purchaseStatusInfo("compra_confirmada").label, "Confirmada");
  assert.equal(purchaseStatusInfo("compra_nao_reconhecida").label, "Rejeitada");
});

test("situação na loja prioriza a compra confirmada", () => {
  assert.equal(storePurchaseState([], STORE), "none");
  assert.equal(storePurchaseState([purchase("compra_nao_reconhecida")], STORE), "rejected");
  assert.equal(storePurchaseState([purchase("contato_realizado"), purchase("compra_nao_reconhecida")], STORE), "pending");
  assert.equal(storePurchaseState([purchase("contato_realizado"), purchase("compra_confirmada")], STORE), "confirmed");
  assert.equal(storePurchaseState([purchase("compra_confirmada")], "outra-loja"), "none");
  assert.equal(productPurchase([purchase("compra_nao_reconhecida")], "prod-1"), null);
  assert.equal(productPurchase([purchase("contato_realizado")], "prod-1").status, "contato_realizado");
});

test("decisão atualiza somente o item correspondente", () => {
  const list = [purchase("contato_realizado", { id: "a" }), purchase("contato_realizado", { id: "b" })];
  const updated = updatePurchaseInList(list, { id: "b", status: "compra_confirmada" });
  assert.deepEqual(updated.map((item) => item.status), ["contato_realizado", "compra_confirmada"]);
});

test("erros 409 preservam a explicação do backend", () => {
  const error = new Error("Já existe uma solicitação pendente para este produto.");
  error.status = 409;
  assert.match(friendlyPurchaseError(error).message, /solicitação pendente/);
  const server = new Error("boom");
  server.status = 500;
  assert.match(friendlyPurchaseError(server).message, /indisponível/);
});

test("rotas de compras respeitam o perfil", () => {
  assert.equal(canAccessRoute("consumidor/compras", { role: "consumidor" }), true);
  assert.equal(canAccessRoute("consumidor/compras", { role: "lojista" }), false);
  assert.equal(canAccessRoute("lojista/compras", { role: "lojista" }), true);
  assert.equal(canAccessRoute("lojista/compras", { role: "consumidor" }), false);
  assert.equal(canAccessRoute("lojista/compras", null), false);
});

test("telas de compra usam API real e Modal, sem dados locais", async () => {
  for (const path of [
    "../services/purchases.js",
    "../components/PurchaseGate.jsx",
    "../views/consumer/ConsumerPurchases.jsx",
    "../views/merchant/PurchaseConfirmations.jsx",
  ]) {
    const code = await source(path);
    assert.doesNotMatch(code, /localStorage|seedData|demo/i, path);
  }
  const merchant = await source("../views/merchant/PurchaseConfirmations.jsx");
  assert.match(merchant, /<Modal title="Confirmar decisão"[\s\S]*?busy=\{deciding\}/);
  assert.match(merchant, /Confirmar compra/);
  assert.match(merchant, /Não reconheço/);
  const gate = await source("../components/PurchaseGate.jsx");
  assert.match(gate, /Já comprei este produto/);
  assert.match(gate, /Solicitar confirmação/);
  const nav = await source("../views/merchant/MerchantNav.jsx");
  assert.match(nav, /path: "lojista\/compras"/);
});
