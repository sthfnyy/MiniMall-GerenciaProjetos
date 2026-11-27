import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getConsumerProfile, updateConsumerProfile, validateProfile } from "../services/profile.js";
import { movementOrigin } from "../services/points.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("perfil usa GET/PATCH /consumidor/perfil e envia só campos editáveis", async () => {
  const calls = [];
  const request = async (path, options = {}) => { calls.push({ path, options }); return {}; };
  await getConsumerProfile(request);
  await updateConsumerProfile({ nome_completo: " Maria ", telefone: "(89) 99999-0000", role: "admin", id: "x" }, request);
  assert.equal(calls[0].path, "/consumidor/perfil");
  assert.equal(calls[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[1].options.body), { nome_completo: "Maria", telefone: "(89) 99999-0000" });
});

test("validação do perfil", () => {
  assert.throws(() => validateProfile({ nome_completo: "M" }), /nome completo/);
  assert.throws(() => validateProfile({ nome_completo: "Maria", telefone: "123" }), /DDD/);
  assert.deepEqual(validateProfile({ nome_completo: "Maria", telefone: "" }), { nome_completo: "Maria", telefone: null });
});

test("extrato de pontos mostra origem amigável, sem identificador técnico", async () => {
  const view = await source("../views/consumer/ConsumerPoints.jsx");
  assert.match(view, /movementOrigin\(t\)/);
  assert.doesNotMatch(view, /\{t\.descricao \|\|/);
  assert.equal(movementOrigin({ tipo: "credito", origem: "foto", descricao: "RF08:foto:123" }), "Foto adicionada à avaliação");
  assert.equal(movementOrigin({ tipo: "credito", descricao: "RF08:foto:123" }), "Foto adicionada à avaliação");
  assert.equal(movementOrigin({ tipo: "credito", origem: "avaliacao" }), "Avaliação publicada");
  assert.equal(movementOrigin({ tipo: "credito", descricao: "RF99:algo" }), "Crédito de pontos");
  assert.equal(movementOrigin({ tipo: "resgate", descricao: "" }), "Resgate de pontos");
  assert.equal(movementOrigin({ tipo: "credito", descricao: "Bônus de boas-vindas" }), "Bônus de boas-vindas");
});

test("Modal bloqueia Esc e fechamento durante operação assíncrona", async () => {
  const ui = await source("../components/ui.jsx");
  assert.match(ui, /busy = false/);
  assert.match(ui, /onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*close\(\);/);
  assert.match(ui, /if \(!busy\) onClose/);
  assert.match(ui, /aria-labelledby=\{titleId\}/);
});

test("telas de estado usam h1 e avaliações do consumidor usam Modal", async () => {
  const app = await source("../App.jsx");
  assert.match(app, /<Empty headingLevel=\{1\} title="Acesso restrito"/);
  assert.match(app, /<Empty headingLevel=\{1\} title="Página não encontrada"/);
  const reviews = await source("../views/consumer/ConsumerReviews.jsx");
  assert.doesNotMatch(reviews, /window\.confirm/);
  assert.match(reviews, /<Modal/);
});

test("página da loja lê avaliações sem exigir login e mostra dados comerciais", async () => {
  const page = await source("../views/StorePage.jsx");
  assert.doesNotMatch(page, /canReadReviews/);
  assert.match(page, /s\.address/);
  assert.match(page, /s\.hours/);
  assert.match(page, /s\.mapsUrl/);
  assert.match(page, /<PurchaseGate/);
  assert.match(page, /Esta loja ainda não recebeu avaliações/);
});
