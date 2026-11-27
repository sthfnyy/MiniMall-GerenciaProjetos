import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { fetchMerchantReviews } from "../services/merchant.js";
import {
  listConsumerReviews,
  listStoreReviews,
  uploadConsumerReviewPhoto,
} from "../services/reviews.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
const css = async () =>
  (await Promise.all(["base", "theme", "delivery"].map((name) => source(`../styles/${name}.css`)))).join("\n");
const serverError = async () => {
  const error = new Error("Internal Server Error");
  error.status = 500;
  throw error;
};

test("erros 5xx de avaliações não exibem a mensagem crua do servidor", async () => {
  const friendly = (error) =>
    error.status === 500 && /no momento/.test(error.message) && !/Internal Server Error/.test(error.message);

  await assert.rejects(listConsumerReviews(serverError), friendly);
  await assert.rejects(listStoreReviews("loja", serverError), friendly);
  await assert.rejects(
    uploadConsumerReviewPhoto("review-1", new Blob(["x"], { type: "image/png" }), serverError),
    friendly,
  );
  await assert.rejects(
    fetchMerchantReviews(serverError),
    (error) => /no momento/.test(error.message) && !/Internal Server Error/.test(error.message),
  );
});

test("navegação do lojista usa as classes de abas", async () => {
  const nav = await source("../views/merchant/MerchantNav.jsx");
  assert.match(nav, /className="admin-navigation merchant-navigation"/);
});

test("busca do lojista tem foco visível no container", async () => {
  assert.match(await css(), /\.merchant-search-box:focus-within\s*\{\s*outline: 2px solid #596c25;/);
});

test("botões .secondary compartilham o estilo existente de .outline", async () => {
  const styles = await css();
  assert.match(styles, /\.primary,\s*\.outline,\s*\.secondary\s*\{/);
  assert.match(styles, /\.outline,\s*\.secondary\s*\{\s*border-color: #b9c1ad;/);
});

test("ajustes desktop de nome de loja, histórico de pontos, fotos e favoritos", async () => {
  const styles = await css();
  assert.match(styles, /\.store-wordmark\s*\{[^}]*text-align: center;[^}]*overflow-wrap: anywhere;/);
  assert.match(styles, /\.consumer-page \.table-wrap td:nth-child\(3\),\s*\.consumer-page \.table-wrap td:nth-child\(4\)\s*\{\s*white-space: normal;/);
  assert.match(styles, /\.review > \.review-photo\s*\{\s*display: inline-block;/);
  assert.match(styles, /\.product-visual > img\s*\{\s*width: 100%;\s*height: 100%;/);
});

