import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canAccessRoute,
  getAuthenticatedProfile,
  getCurrentSession,
  observeAuthChanges,
  passwordsMatch,
  signIn,
  signOut,
  signUp,
} from "../services/auth.js";

test("cadastro usa /auth/register e não envia role", async () => {
  let url;
  let options;
  const response = await signUp([], {
    name: " Maria Silva ",
    email: " MARIA@EXAMPLE.COM ",
    password: "senha1234",
    role: "lojista",
  }, async (nextUrl, nextOptions) => {
    url = nextUrl;
    options = nextOptions;
    return { ok: true, json: async () => ({ mensagem: "ok" }) };
  });
  assert.match(url, /\/auth\/register$/);
  assert.deepEqual(JSON.parse(options.body), {
    nome_completo: "Maria Silva",
    email: "maria@example.com",
    senha: "senha1234",
  });
  assert.equal(response.mensagem, "ok");
});

test("cadastro inválido não faz requisição", async () => {
  let calls = 0;
  await assert.rejects(signUp([], { name: "M", email: "a@b.com", password: "senha1234" }, async () => { calls += 1; }), /nome completo/i);
  await assert.rejects(signUp([], { name: "Maria", email: "a@b.com", password: "curta" }, async () => { calls += 1; }), /8 caracteres/);
  assert.equal(calls, 0);
});

test("senhas divergentes são rejeitadas antes do cadastro", () => {
  assert.equal(passwordsMatch("senha1234", "outra1234"), false);
  assert.equal(passwordsMatch("senha1234", "senha1234"), true);
});

test("login usa Supabase real e normaliza o e-mail", async () => {
  let payload;
  const session = { access_token: "token", user: { id: "id", email: "maria@example.com" } };
  const result = await signIn([], " MARIA@EXAMPLE.COM ", "senha", {
    auth: { signInWithPassword: async (values) => { payload = values; return { data: { session, user: session.user } }; } },
  });
  assert.equal(payload.email, "maria@example.com");
  assert.equal(result.session, session);
});

test("perfil autenticado envia o token em /auth/me", async () => {
  let request;
  const profile = await getAuthenticatedProfile("token-real", async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ id: "id", nome_completo: "Maria", role: "consumidor" }) };
  });
  assert.match(request.url, /\/auth\/me$/);
  assert.equal(request.options.headers.Authorization, "Bearer token-real");
  assert.equal(profile.role, "consumidor");
});

test("sessão pode ser restaurada e observada", async () => {
  const session = { access_token: "token" };
  let observer;
  let unsubscribed = false;
  const client = { auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: (callback) => { observer = callback; return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }; },
  } };
  assert.equal(await getCurrentSession(client), session);
  let observed;
  const stop = observeAuthChanges((value) => { observed = value; }, client);
  observer("SIGNED_IN", session);
  assert.equal(observed, session);
  stop();
  assert.equal(unsubscribed, true);
});

test("role controla as rotas protegidas", () => {
  assert.equal(canAccessRoute("conta", null), false);
  assert.equal(canAccessRoute("conta", { role: "consumidor" }), true);
  assert.equal(canAccessRoute("lojista", { role: "consumidor" }), false);
  assert.equal(canAccessRoute("lojista", { role: "lojista" }), true);
});

test("logout encerra a sessão no provedor", async () => {
  let called = false;
  await signOut({ auth: { signOut: async () => { called = true; return {}; } } });
  assert.equal(called, true);
});

test("serviço não contém credenciais demo nem persistência local de senha", async () => {
  const source = await readFile(new URL("../services/auth.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /DEMO_PASSWORD|localStorage|PBKDF2|credentials/i);
});
