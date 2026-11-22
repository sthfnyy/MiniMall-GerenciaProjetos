import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { apiRequest } from "../services/api.js";
import { canAccessRoute } from "../services/auth.js";
import { normalizePublicProduct } from "../services/catalog.js";
import {
  addConsumerFavorite,
  applyFavoriteState,
  deleteConsumerFavorite,
  friendlyFavoriteError,
  getFavoriteProductIds,
  listConsumerFavorites,
  toggleConsumerFavorite,
} from "../services/favorites.js";

const PRODUCT_ID = "7800fcb0-03a3-48c6-a413-cf339f67d555";
const OTHER_ID = "2b1f6c0e-4d7a-4a51-9e43-0f1c2d3e4f50";
const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
const httpError = (status, message = "Not Found") => {
  const error = new Error(message);
  error.status = status;
  return error;
};
const apiFavorite = (id = PRODUCT_ID, overrides = {}) => ({
  criado_em: "2026-11-20T12:00:00Z",
  produto: {
    id,
    loja_id: "1ad8150b-eaf6-4c68-9d34-0a18321b6630",
    categoria_id: "8134d10c-ddce-4e4f-8fe9-446719882c86",
    titulo: "Camisa de linho",
    descricao: "Leve e confortável",
    preco_base: "159.90",
    foto_principal_url: "https://example.com/camisa.jpg",
    ativo: true,
    criado_em: "2026-11-01T12:00:00Z",
    atualizado_em: "2026-11-01T12:00:00Z",
    ...overrides,
  },
});

// Simula o backend de favoritos em memória apenas dentro do teste.
function fakeFavoritesBackend(initial = []) {
  const stored = [...initial];
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push([path, options]);
    if (path === "/consumidor/favoritos" && !options.method) return stored.map((id) => apiFavorite(id));
    if (path === "/consumidor/favoritos" && options.method === "POST") {
      const { produto_id: id } = JSON.parse(options.body);
      if (stored.includes(id)) throw httpError(409, "Produto já está nos favoritos");
      stored.push(id);
      return apiFavorite(id);
    }
    if (options.method === "DELETE") {
      const id = decodeURIComponent(path.split("/").pop());
      const index = stored.indexOf(id);
      if (index < 0) throw httpError(404, "Favorito não encontrado");
      stored.splice(index, 1);
      return null;
    }
    throw httpError(404);
  };
  return { request, calls, stored };
}

// ---------------------------------------------------------------------------
// Testes migrados do PDSI-I (tests/frontend.test.js), sem os de dados seed
// ---------------------------------------------------------------------------

test("produto real preserva UUID no payload de favoritos", async () => {
  const product = normalizePublicProduct({ id: PRODUCT_ID, loja_id: OTHER_ID, titulo: "Camisa", preco_base: "10" });
  const calls = [];
  await addConsumerFavorite(product.id, async (...args) => calls.push(args));
  assert.deepEqual(JSON.parse(calls[0][1].body), { produto_id: PRODUCT_ID });
});

test("API de favoritos lista, adiciona e remove produtos reais", async () => {
  const calls = [];
  const request = async (...args) => {
    calls.push(args);
    return args[1]?.method === "DELETE" ? null : [];
  };
  const productId = "product-1";

  await listConsumerFavorites(request);
  await addConsumerFavorite(productId, request);
  await deleteConsumerFavorite(productId, request);

  assert.deepEqual(calls[0], ["/consumidor/favoritos"]);
  assert.equal(calls[1][0], "/consumidor/favoritos");
  assert.equal(calls[1][1].method, "POST");
  assert.deepEqual(JSON.parse(calls[1][1].body), { produto_id: productId });
  assert.deepEqual(calls[2], [
    `/consumidor/favoritos/${productId}`,
    { method: "DELETE" },
  ]);
});

// ---------------------------------------------------------------------------
// Testes novos: API real, sincronização e tratamento de erros em Gerência
// ---------------------------------------------------------------------------

test("favoritos são carregados da API com o token do consumidor", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify([apiFavorite()]), { status: 200 });
  });

  const favorites = await listConsumerFavorites((path, options) =>
    apiRequest(path, { ...options, token: "jwt-consumidor" }),
  );

  assert.match(calls[0].url, /\/consumidor\/favoritos$/);
  assert.equal(calls[0].options.headers.get("Authorization"), "Bearer jwt-consumidor");
  assert.deepEqual(getFavoriteProductIds(favorites), [PRODUCT_ID]);
});

test("usuário não autenticado não chega a chamar o endpoint de alteração", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
  const unauthenticated = (path, options) => apiRequest(path, { ...options, token: null });

  await assert.rejects(addConsumerFavorite(PRODUCT_ID, unauthenticated), (error) => error.status === 401);
  await assert.rejects(deleteConsumerFavorite(PRODUCT_ID, unauthenticated), (error) => error.status === 401);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("lista vazia é válida e respostas inesperadas não inventam favoritos", async () => {
  assert.deepEqual(await listConsumerFavorites(async () => []), []);
  assert.deepEqual(await listConsumerFavorites(async () => null), []);
  assert.deepEqual(await listConsumerFavorites(async () => [{ produto: null }, apiFavorite()]), [apiFavorite()]);
});

test("favoritar adiciona pela API e só então marca o produto", async () => {
  const backend = fakeFavoritesBackend();
  let ids = [];

  const favorite = await toggleConsumerFavorite(PRODUCT_ID, false, backend.request);
  ids = applyFavoriteState(ids, PRODUCT_ID, favorite);

  assert.equal(favorite, true);
  assert.deepEqual(ids, [PRODUCT_ID]);
  assert.equal(backend.calls[0][1].method, "POST");
  assert.deepEqual(JSON.parse(backend.calls[0][1].body), { produto_id: PRODUCT_ID });
});

test("desfavoritar remove pela API o produto correto", async () => {
  const backend = fakeFavoritesBackend([PRODUCT_ID, OTHER_ID]);

  const favorite = await toggleConsumerFavorite(PRODUCT_ID, true, backend.request);
  const ids = applyFavoriteState([PRODUCT_ID, OTHER_ID], PRODUCT_ID, favorite);

  assert.equal(favorite, false);
  assert.deepEqual(ids, [OTHER_ID]);
  assert.deepEqual(backend.calls[0], [`/consumidor/favoritos/${PRODUCT_ID}`, { method: "DELETE" }]);
  assert.deepEqual(backend.stored, [OTHER_ID]);
});

test("favoritos permanecem após nova consulta da API (recarregar)", async () => {
  const backend = fakeFavoritesBackend();
  await toggleConsumerFavorite(PRODUCT_ID, false, backend.request);
  await toggleConsumerFavorite(OTHER_ID, false, backend.request);
  await toggleConsumerFavorite(OTHER_ID, true, backend.request);

  const reloaded = getFavoriteProductIds(await listConsumerFavorites(backend.request));
  assert.deepEqual(reloaded, [PRODUCT_ID]);
});

test("erro ao favoritar não marca o produto como persistido", async () => {
  let ids = [];
  await assert.rejects(
    (async () => {
      const favorite = await toggleConsumerFavorite(PRODUCT_ID, false, async () => {
        throw httpError(500, "Não foi possível adicionar o favorito");
      });
      ids = applyFavoriteState(ids, PRODUCT_ID, favorite);
    })(),
    /Não foi possível atualizar seus favoritos no momento/,
  );
  assert.deepEqual(ids, []);
});

test("erro ao remover mantém o produto favoritado", async () => {
  let ids = [PRODUCT_ID];
  await assert.rejects(
    (async () => {
      const favorite = await toggleConsumerFavorite(PRODUCT_ID, true, async () => {
        throw new Error("Não foi possível conectar ao MiniMall.");
      });
      ids = applyFavoriteState(ids, PRODUCT_ID, favorite);
    })(),
    /Não foi possível conectar/,
  );
  assert.deepEqual(ids, [PRODUCT_ID]);
});

test("409 e 404 do backend sincronizam com o estado real do favorito", async () => {
  const backend = fakeFavoritesBackend([PRODUCT_ID]);

  // Já era favorito no backend (ex.: outra aba): 409 confirma favoritado.
  assert.equal(await toggleConsumerFavorite(PRODUCT_ID, false, backend.request), true);
  // Já tinha sido removido: "Favorito não encontrado" confirma desfavoritado.
  assert.equal(await toggleConsumerFavorite(OTHER_ID, true, backend.request), false);
});

test("API de favoritos ausente informa indisponibilidade sem alterar estado", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 }),
  );
  const request = (path, options) => apiRequest(path, { ...options, token: "jwt" });
  const unavailable = (error) =>
    error.unavailable === true && /favoritos ainda não está disponível/.test(error.message);

  await assert.rejects(listConsumerFavorites(request), unavailable);
  await assert.rejects(toggleConsumerFavorite(PRODUCT_ID, false, request), unavailable);
  await assert.rejects(toggleConsumerFavorite(PRODUCT_ID, true, request), unavailable);
});

test("respostas 401, 403, 404, 422, 501 e 500 viram mensagens amigáveis", () => {
  const cases = [
    [httpError(401), /sessão expirou/],
    [httpError(403), /Somente consumidores/],
    [httpError(404), /ainda não está disponível/],
    [httpError(404, "Produto não encontrado"), /Produto não encontrado/],
    [httpError(422, "value is not a valid uuid"), /Produto inválido/],
    [httpError(501, "Traceback"), /ainda não está disponível/],
    [httpError(500, "Traceback"), /no momento/],
  ];

  for (const [error, message] of cases) {
    const friendly = friendlyFavoriteError(error);
    assert.match(friendly.message, message);
    assert.equal(friendly.status, error.status);
    assert.doesNotMatch(friendly.message, /Traceback/);
  }
});

test("rota de favoritos aceita somente consumidor autenticado", () => {
  assert.equal(canAccessRoute("consumidor/favoritos", { role: "consumidor" }), true);
  assert.equal(canAccessRoute("consumidor/favoritos", null), false);
  assert.equal(canAccessRoute("consumidor/favoritos", { role: "lojista" }), false);
  assert.equal(canAccessRoute("consumidor/favoritos", { role: "admin" }), false);
});

test("App sincroniza favoritos da API e restaura #consumidor/favoritos", async () => {
  const app = await source("../App.jsx");

  assert.match(app, /if \(user\?\.role !== "consumidor"\) return undefined;\s*listConsumerFavorites\(\)/);
  assert.match(app, /setFavoriteIds\(getFavoriteProductIds\(favorites\)\)/);
  assert.match(app, /\}, \[user\?\.id, user\?\.role\]\);/);
  assert.match(app, /await toggleConsumerFavorite\(favoriteProduct\.id, isFavorite\(id\)\);\s*setFavoriteIds\(\(ids\) => applyFavoriteState\(ids, id, favorite\)\)/);
  assert.match(app, /if \(!user\) \{\s*setToast\("Entre como consumidor para adicionar favoritos\."\);\s*go\("login"\);\s*return;/);
  assert.match(app, /user && user\.role !== "consumidor"\s*\? \{\}/);
  assert.match(app, /route === "consumidor\/favoritos" && <ConsumerFavorites/);
  assert.match(app, /onFavoriteRemoved=\{\(productId\) => setFavoriteIds\(\(ids\) => applyFavoriteState\(ids, productId, false\)\)\}/);
  assert.match(app, /onFavorites=\{\(\) => go\("consumidor\/favoritos"\)\}/);
  assert.match(app, /"consumidor\/favoritos", "consumidor\/pontos"/);
  assert.match(app, /<Catalog .*\{\.\.\.favoriteProps\}/);
  assert.match(app, /<StorePage .*\{\.\.\.favoriteProps\}/);
  assert.match(app, /<ProductDetail .*isFavorite: isFavorite\(product\.id\)/);
});

test("ProductCard e ProductDetail refletem o estado favoritado recebido", async () => {
  for (const path of ["../components/ProductCard.jsx", "../views/ProductDetail.jsx"]) {
    const code = await source(path);
    assert.match(code, /className=\{`favorite \$\{isFavorite \? "is-favorite" : ""\}`\}/, path);
    assert.match(code, /aria-pressed=\{isFavorite\}/, path);
    assert.match(code, /disabled=\{favoriteBusy\}/, path);
    assert.match(code, /fill=\{\s*isFavorite\s*\?\s*"currentColor"\s*:\s*"none"\s*\}/, path);
  }

  for (const path of ["../views/Catalog.jsx", "../views/StorePage.jsx"]) {
    const code = await source(path);
    assert.match(code, /isFavorite=\{isFavorite \? isFavorite\(p\.id\) : false\}/, path);
    assert.match(code, /onToggleFavorite=\{onToggleFavorite\}/, path);
  }
});

test("ConsumerFavorites remove da lista só depois que a API confirma", async () => {
  const view = await source("../views/consumer/ConsumerFavorites.jsx");

  assert.match(view, /await removeFavoriteFn\(productId\);/);
  assert.match(view, /setError\(removeError\.message\);\s*setRemovingId\(null\);\s*return;/);
  assert.match(view, /onFavoriteRemoved\?\.\(productId\)/);
  assert.match(view, /Carregando seus favoritos\.\.\./);
  assert.match(view, /Nenhum favorito ainda/);
  assert.match(view, /!loading && !loadFailed &&/);
});

test("perfil restaura o acesso Meus favoritos do PDSI-I", async () => {
  const profile = await source("../views/consumer/ConsumerProfile.jsx");
  assert.match(profile, /onClick=\{onFavorites\}><Heart size=\{17\} \/>Meus favoritos/);
  assert.ok(profile.indexOf("Meus favoritos") < profile.indexOf("Meus pontos"));
});

test("favoritos não usam localStorage, seed nem lista local", async () => {
  for (const path of [
    "../services/favorites.js",
    "../views/consumer/ConsumerFavorites.jsx",
    "../App.jsx",
    "../components/ProductCard.jsx",
    "../views/ProductDetail.jsx",
  ]) {
    const code = await source(path);
    assert.doesNotMatch(code, /localStorage|sessionStorage|useRealApi|demoList|\.favorites\b|users\.find/, path);
  }
});
