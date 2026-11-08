import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createMerchantStore,
  fetchMerchantStore,
  normalizeStoreFromApi,
  requestStoreApproval,
  storePayload,
  updateMerchantStore,
  validateStoreData,
} from "../services/merchant.js";

const apiStore = (overrides = {}) => ({
  id: "f8d3c12a-5b12-4c6e-8d9f-123456789abc",
  lojista_id: "user-id",
  nome_loja: "Flor de Lis",
  descricao: "Moda e acessórios",
  endereco_logradouro: "Rua das Flores",
  endereco_numero: "100",
  endereco_bairro: "Centro",
  endereco_cidade: "Picos",
  endereco_uf: "PI",
  endereco_cep: "64600000",
  horario_funcionamento: { descricao: "Seg a Sex, 8h às 18h" },
  whatsapp: "89999998888",
  instagram: "@flordelis",
  facebook: null,
  logo_url: "https://example.com/logo.png",
  status: "pendente",
  motivo_rejeicao: null,
  ...overrides,
});

const form = (overrides = {}) => ({
  nome_loja: "Atelier Encanto",
  descricao: "Moda autoral",
  endereco_logradouro: "Rua Coelho Rodrigues",
  endereco_numero: "80",
  endereco_bairro: "Centro",
  endereco_cidade: "Picos",
  endereco_uf: "pi",
  endereco_cep: "64600000",
  horario_funcionamento: { descricao: "Segunda a sábado, 8h às 18h" },
  whatsapp: "89988887777",
  instagram: "@atelierencanto",
  facebook: "atelier.encanto",
  logo_url: "https://example.com/logo.png",
  ...overrides,
});

test("normaliza dados e preserva estados e motivo de rejeição", () => {
  const rejected = normalizeStoreFromApi(apiStore({ status: "rejeitada", motivo_rejeicao: "Documento ilegível" }));
  assert.equal(rejected.name, "Flor de Lis");
  assert.equal(rejected.hours, "Seg a Sex, 8h às 18h");
  assert.match(rejected.address, /Rua das Flores, 100, Centro, Picos – PI/);
  assert.equal(rejected.status, "rejeitada");
  assert.equal(rejected.motivo_rejeicao, "Documento ilegível");
  assert.equal(normalizeStoreFromApi(apiStore({ status: "aprovada" })).status, "aprovada");
  assert.equal(normalizeStoreFromApi(apiStore({ status: "pendente" })).status, "pendente");
});

test("GET consulta a loja real", async () => {
  const calls = [];
  const result = await fetchMerchantStore(async (...args) => { calls.push(args); return apiStore(); });
  assert.deepEqual(calls[0], ["/lojista/loja"]);
  assert.equal(result.name, "Flor de Lis");
});

test("404 significa ausência de loja e outros erros são propagados", async () => {
  const notFound = new Error("Loja não encontrada");
  notFound.status = 404;
  assert.equal(await fetchMerchantStore(async () => { throw notFound; }), null);
  const forbidden = new Error("Acesso negado");
  forbidden.status = 403;
  await assert.rejects(fetchMerchantStore(async () => { throw forbidden; }), /Acesso negado/);
});

test("POST cadastra loja com payload estrito", async () => {
  let call;
  const result = await createMerchantStore(form({ status: "aprovada", id: "forjado" }), async (url, options) => {
    call = { url, options };
    return apiStore();
  });
  assert.equal(call.url, "/lojista/loja");
  assert.equal(call.options.method, "POST");
  const body = JSON.parse(call.options.body);
  assert.equal(body.endereco_uf, "PI");
  assert.equal(body.nome_loja, "Atelier Encanto");
  assert.deepEqual(body.horario_funcionamento, { descricao: "Segunda a sábado, 8h às 18h" });
  for (const field of ["status", "motivo_rejeicao", "aprovado_por", "id", "lojista_id"]) assert.equal(body[field], undefined);
  assert.equal(result.status, "pendente");
});

test("PATCH atualiza a loja pelo endpoint real", async () => {
  let call;
  const result = await updateMerchantStore(form({ nome_loja: "Atelier Atualizado" }), async (url, options) => {
    call = { url, options };
    return apiStore({ nome_loja: "Atelier Atualizado" });
  });
  assert.equal(call.url, "/lojista/loja");
  assert.equal(call.options.method, "PATCH");
  assert.equal(JSON.parse(call.options.body).nome_loja, "Atelier Atualizado");
  assert.equal(result.name, "Atelier Atualizado");
});

test("solicitação de nova aprovação usa POST específico", async () => {
  let call;
  const result = await requestStoreApproval(async (url, options) => {
    call = { url, options };
    return apiStore({ status: "pendente", motivo_rejeicao: null });
  });
  assert.equal(call.url, "/lojista/loja/solicitar-aprovacao");
  assert.equal(call.options.method, "POST");
  assert.equal(result.status, "pendente");
});

test("valida os campos obrigatórios e URL do logo", () => {
  assert.throws(() => validateStoreData(form({ nome_loja: "A" })), /nome da loja/);
  assert.throws(() => validateStoreData(form({ whatsapp: "123" })), /WhatsApp/);
  assert.throws(() => validateStoreData(form({ endereco_logradouro: "" })), /endereço/);
  assert.throws(() => validateStoreData(form({ endereco_cidade: "" })), /cidade/);
  assert.throws(() => validateStoreData(form({ endereco_uf: "PIAUI" })), /UF/);
  assert.throws(() => validateStoreData(form({ logo_url: "arquivo.png" })), /URL de logo/);
  assert.equal(validateStoreData(form()).endereco_uf, "PI");
});

test("payload contém somente campos aceitos pelo backend", () => {
  const payload = storePayload(form());
  assert.deepEqual(Object.keys(payload).sort(), [
    "descricao", "endereco_bairro", "endereco_cep", "endereco_cidade",
    "endereco_logradouro", "endereco_numero", "endereco_uf", "facebook",
    "horario_funcionamento", "instagram", "logo_url", "nome_loja", "whatsapp",
  ].sort());
});

test("App recarrega /auth/me após o cadastro da loja", async () => {
  const source = await readFile(new URL("../App.jsx", import.meta.url), "utf8");
  assert.match(source, /onStoreCreated/);
  assert.match(source, /getCurrentSession\(\)/);
  assert.match(source, /syncSession\(session\)/);
});
