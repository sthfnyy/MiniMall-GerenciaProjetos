import test from "node:test";
import assert from "node:assert/strict";
import { canAccessRoute, getAuthenticatedRoute } from "../services/auth.js";
import {
  categoryName,
  createAdminCategory,
  createAdminService,
  deleteAdminCategory,
  deleteAdminReview,
  getAdminCategories,
  getAdminReviews,
  updateAdminCategory,
} from "../services/admin.js";

test("CRUD de categorias usa GET, POST, PUT e DELETE em /admin/categorias", async () => {
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, ...options });
    return { id: "cat-uuid", nome: "Casa" };
  };

  await getAdminCategories(request);
  await createAdminCategory("  Casa  ", request);
  await updateAdminCategory("cat-uuid", "Casa e decoração", request);
  await deleteAdminCategory("cat-uuid", request);

  assert.equal(calls[0].path, "/admin/categorias");
  assert.equal(calls[1].path, "/admin/categorias");
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(JSON.parse(calls[1].body), { nome: "Casa" });
  assert.equal(calls[2].path, "/admin/categorias/cat-uuid");
  assert.equal(calls[2].method, "PUT");
  assert.deepEqual(JSON.parse(calls[2].body), { nome: "Casa e decoração" });
  assert.equal(calls[3].path, "/admin/categorias/cat-uuid");
  assert.equal(calls[3].method, "DELETE");
});

test("valida nome de categoria antes de enviar à API", () => {
  assert.throws(() => categoryName(""), /nome da categoria/i);
  assert.throws(() => categoryName("   "), /nome da categoria/i);
  assert.throws(() => categoryName("A"), /entre 2 e 100/i);
  assert.equal(categoryName("  Perfumaria "), "Perfumaria");
});

test("erros 403 e 409 de categorias em uso ou duplicadas são propagados", async () => {
  for (const status of [403, 409]) {
    const api = createAdminService(async () => {
      const error = new Error(`Erro ${status}`);
      error.status = status;
      throw error;
    });
    await assert.rejects(
      api.deleteCategory("cat-uuid"),
      (err) => err.status === status,
    );
  }
});

test("moderação consulta e remove avaliações nos endpoints de /admin/moderacao", async () => {
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, ...options });
    return [];
  };

  await getAdminReviews(null, request);
  await getAdminReviews("loja-uuid", request);
  await deleteAdminReview("aval-uuid", request);

  assert.equal(calls[0].path, "/admin/moderacao/avaliacoes");
  assert.equal(calls[1].path, "/admin/moderacao/avaliacoes?loja_id=loja-uuid");
  assert.equal(calls[2].path, "/admin/moderacao/avaliacoes/aval-uuid");
  assert.equal(calls[2].method, "DELETE");
});

test("somente administrador acessa a rota /admin", () => {
  assert.equal(canAccessRoute("admin", null), false);
  assert.equal(canAccessRoute("admin", { role: "consumidor" }), false);
  assert.equal(canAccessRoute("admin", { role: "lojista" }), false);
  assert.equal(canAccessRoute("admin", { role: "admin" }), true);
  assert.equal(canAccessRoute("admin", { role: "administrador" }), true);
  assert.equal(getAuthenticatedRoute("admin"), "admin");
});
