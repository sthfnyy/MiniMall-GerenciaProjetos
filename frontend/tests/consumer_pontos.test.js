import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { apiRequest } from "../services/api.js";
import { canAccessRoute } from "../services/auth.js";
import {
  friendlyPointsError,
  getConsumerPoints,
  normalizeConsumerPoints,
} from "../services/points.js";

const STORE_ID = "55c27b92-8108-4fb2-9ad0-28fc2441548c";
const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
const httpError = (status, message = "Not Found") => {
  const error = new Error(message);
  error.status = status;
  return error;
};
const apiResponse = () => ({
  saldo_total: 26,
  saldos_por_loja: [{ loja_id: STORE_ID, saldo: 6 }],
  historico: [
    {
      id: "credit-1",
      loja_id: STORE_ID,
      tipo: "credito",
      quantidade: 100,
      avaliacao_id: "review-1",
      descricao: "Crédito",
      criado_em: "2026-10-17T15:00:00Z",
    },
    {
      id: "redeem-1",
      loja_id: STORE_ID,
      tipo: "resgate",
      quantidade: 40,
      avaliacao_id: null,
      descricao: "Resgate",
      criado_em: "2026-10-16T15:00:00Z",
    },
  ],
});

// ---------------------------------------------------------------------------
// Testes migrados do PDSI-I (tests/frontend.test.js), sem os de modo demo
// ---------------------------------------------------------------------------

test("getConsumerPoints consulta somente GET /consumidor/pontos", async () => {
  const calls = [];
  const response = { saldo_total: 26, saldos_por_loja: [{ loja_id: "store-uuid", saldo: 6 }], historico: [] };
  const request = async (...args) => {
    calls.push(args);
    return response;
  };

  assert.deepEqual(await getConsumerPoints(request), response);
  assert.deepEqual(calls, [["/consumidor/pontos"]]);
});

test("dados reais de pontos são preservados sem recálculo no frontend", async () => {
  const response = apiResponse();
  const points = await getConsumerPoints(async () => response);

  assert.equal(points.saldo_total, 26);
  assert.deepEqual(points.saldos_por_loja, response.saldos_por_loja);
  assert.deepEqual(points.historico, response.historico);
  assert.deepEqual(points.historico.map((item) => item.tipo), ["credito", "resgate"]);
});

test("resposta real vazia mantém saldo zero e listas vazias", async () => {
  assert.deepEqual(
    await getConsumerPoints(async () => ({ saldo_total: 0, saldos_por_loja: [], historico: [] })),
    { saldo_total: 0, saldos_por_loja: [], historico: [] },
  );
});

test("erro da API de pontos é propagado e não convertido em saldo zero", async () => {
  await assert.rejects(
    getConsumerPoints(async () => {
      throw new Error("Falha ao consultar pontos");
    }),
    /Falha ao consultar pontos/,
  );
});

// ---------------------------------------------------------------------------
// Testes novos: integração com a API/autenticação de Gerência
// ---------------------------------------------------------------------------

test("saldo retornado não é recalculado mesmo que difira do histórico", async () => {
  // 100 - 40 = 60 no histórico, mas o frontend precisa exibir exatamente 26.
  const points = await getConsumerPoints(async () => apiResponse());
  assert.equal(points.saldo_total, 26);
  assert.equal(points.saldos_por_loja[0].saldo, 6);
});

test("saldo 0 com histórico é válido e não é tratado como erro", async () => {
  const response = { ...apiResponse(), saldo_total: 0, saldos_por_loja: [{ loja_id: STORE_ID, saldo: 0 }] };
  const points = await getConsumerPoints(async () => response);

  assert.equal(points.saldo_total, 0);
  assert.equal(points.historico.length, 2);
});

test("listas ausentes viram vazias, mas saldo ausente ou inválido é rejeitado", () => {
  assert.deepEqual(normalizeConsumerPoints({ saldo_total: 5 }), {
    saldo_total: 5,
    saldos_por_loja: [],
    historico: [],
  });
  assert.throws(() => normalizeConsumerPoints(null), /resposta inválida/);
  assert.throws(() => normalizeConsumerPoints({ historico: [] }), /resposta inválida/);
  assert.throws(() => normalizeConsumerPoints({ saldo_total: "abc" }), /resposta inválida/);
});

test("consulta usa o apiRequest real com token Bearer do consumidor", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(apiResponse()), { status: 200 });
  });

  const points = await getConsumerPoints((path, options) =>
    apiRequest(path, { ...options, token: "jwt-consumidor" }),
  );

  assert.equal(points.saldo_total, 26);
  assert.match(calls[0].url, /\/consumidor\/pontos$/);
  assert.equal(calls[0].options.headers.get("Authorization"), "Bearer jwt-consumidor");
  assert.equal(calls[0].options.method, undefined);
});

test("sem sessão autenticada a consulta não chega ao backend", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}"));

  await assert.rejects(
    getConsumerPoints((path, options) => apiRequest(path, { ...options, token: null })),
    (error) => error.status === 401 && /sessão expirou/.test(error.message),
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("API de pontos ausente (404 do FastAPI) gera mensagem de indisponibilidade", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 }),
  );

  await assert.rejects(
    getConsumerPoints((path, options) => apiRequest(path, { ...options, token: "jwt" })),
    (error) =>
      error.unavailable === true &&
      /serviço de pontos ainda não está disponível/.test(error.message) &&
      !/Not Found/.test(error.message),
  );
});

test("respostas 401, 403, 404, 501 e 500 viram mensagens amigáveis", async () => {
  const cases = [
    [401, /sessão expirou/, false],
    [403, /Somente consumidores/, false],
    [404, /ainda não está disponível/, true],
    [501, /ainda não está disponível/, true],
    [503, /ainda não está disponível/, true],
    [500, /não foi possível consultar seus pontos no momento/i, false],
  ];

  for (const [status, message, unavailable] of cases) {
    await assert.rejects(
      getConsumerPoints(async () => {
        throw httpError(status, "Traceback (most recent call last)");
      }),
      (error) =>
        message.test(error.message) &&
        error.status === status &&
        Boolean(error.unavailable) === unavailable &&
        !/Traceback/.test(error.message),
    );
  }
});

test("falha de rede preserva a mensagem amigável do apiRequest", () => {
  const error = new Error("Não foi possível conectar ao MiniMall.");
  assert.equal(friendlyPointsError(error), error);
});

test("rota de pontos aceita somente consumidor autenticado", () => {
  assert.equal(canAccessRoute("consumidor/pontos", { role: "consumidor" }), true);
  assert.equal(canAccessRoute("consumidor/pontos", null), false);
  assert.equal(canAccessRoute("consumidor/pontos", { role: "lojista" }), false);
  assert.equal(canAccessRoute("consumidor/pontos", { role: "admin" }), false);
});

test("App e perfil restauram o acesso a #consumidor/pontos do PDSI-I", async () => {
  const app = await source("../App.jsx");
  const profile = await source("../views/consumer/ConsumerProfile.jsx");

  assert.match(app, /route === "consumidor\/pontos" && <ConsumerPoints/);
  assert.match(app, /onPoints=\{\(\) => go\("consumidor\/pontos"\)\}/);
  assert.match(app, /"consumidor\/pontos", "consumidor\/avaliacoes"/);
  assert.match(app, /const restricted = !canAccessRoute\(route, user\)/);
  assert.match(profile, /onClick=\{onPoints\}><Coins size=\{17\} \/>Meus pontos/);
});

test("tela de pontos mostra carregamento, erro, vazio, saldo e histórico do PDSI-I", async () => {
  const view = await source("../views/consumer/ConsumerPoints.jsx");

  assert.match(view, /Carregando seus pontos\.\.\./);
  assert.match(view, /className="error" role="alert"/);
  assert.match(view, /Ainda não há movimentações de pontos\./);
  assert.match(view, /pointsData\?\.saldo_total/);
  assert.match(view, /SALDO POR LOJA/);
  assert.match(view, /Movimentações de pontos/);
  assert.match(view, /sortedTransactions\.map/);
});

test("nenhum ponto é gerado ou calculado artificialmente no frontend", async () => {
  const files = [
    "../services/points.js",
    "../views/consumer/ConsumerPoints.jsx",
    "../services/reviews.js",
    "../App.jsx",
  ];

  for (const path of files) {
    const code = await source(path);
    assert.doesNotMatch(
      code,
      /buildDemoConsumerPoints|getConsumerPointsViewData|pontos_transacoes|localStorage|useRealApi|saldo\w*\s*\+=|quantidade:\s*\d+/,
      path,
    );
  }

  const view = await source("../views/consumer/ConsumerPoints.jsx");
  assert.doesNotMatch(view, /\.reduce\([^)]*quantidade/);
});
