import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  approveAdminStore,
  deleteAdminReviewPhoto,
  getAdminStores,
  rejectAdminStore,
  rejectionReason,
} from "../services/admin.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin lista lojas por status e aprova/rejeita via PATCH", async () => {
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, method: options.method || "GET", body: options.body });
    return path.startsWith("/admin/lojas?") || path === "/admin/lojas" ? [{ id: "l1" }] : { id: "l1" };
  };
  assert.equal((await getAdminStores("pendente", request)).length, 1);
  await getAdminStores("", request);
  await approveAdminStore("l1", request);
  await rejectAdminStore("l1", "  Endereço incompleto ", request);

  assert.deepEqual(calls.map(({ path, method }) => [method, path]), [
    ["GET", "/admin/lojas?status_filtro=pendente"],
    ["GET", "/admin/lojas"],
    ["PATCH", "/admin/lojas/l1/aprovar"],
    ["PATCH", "/admin/lojas/l1/rejeitar"],
  ]);
  assert.deepEqual(JSON.parse(calls[3].body), { motivo_rejeicao: "Endereço incompleto" });
});

test("rejeição exige motivo", async () => {
  assert.throws(() => rejectionReason("  "), /motivo/);
  assert.throws(() => rejectionReason("abc"), /mínimo de 5/);
  let called = false;
  await assert.rejects(rejectAdminStore("l1", "", async () => { called = true; }), /motivo/);
  assert.equal(called, false);
});

test("moderação remove foto pela rota administrativa", async () => {
  const calls = [];
  await deleteAdminReviewPhoto("f1", async (path, options) => { calls.push([options.method, path]); return null; });
  assert.deepEqual(calls, [["DELETE", "/admin/moderacao/avaliacao-fotos/f1"]]);
});

test("painel admin tem a aba Lojas e moderação com fotos e Modal", async () => {
  const admin = await source("../views/admin/Admin.jsx");
  assert.match(admin, /\["stores", "Lojas"/);
  assert.match(admin, /<Stores /);
  const stores = await source("../views/admin/Stores.jsx");
  assert.match(stores, /Motivo da rejeição/);
  assert.match(stores, /busy=\{processing\}/);
  assert.match(stores, /lojista_email/);
  const moderation = await source("../views/admin/Moderation.jsx");
  assert.match(moderation, /consumidor_nome/);
  assert.match(moderation, /loja_nome/);
  assert.match(moderation, /review\.fotos/);
  assert.match(moderation, /deleteAdminReviewPhoto/);
  assert.match(moderation, /busy=\{processing\}/);
  for (const code of [admin, stores, moderation]) assert.doesNotMatch(code, /window\.confirm|localStorage/);
});
