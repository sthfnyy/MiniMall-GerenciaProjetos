import test from 'node:test';
import assert from 'node:assert/strict';
import { signIn, signUp, getCurrentSession, signOut, roleHome, canAccessRoute, getAuthenticatedProfile } from '../services/auth.js';
import { createApiClient } from '../services/http.js';

test('login usa sessão real e normaliza e-mail', async () => {
  let values;
  const session = { access_token: 'token', user: { id: 'real' } };
  const result = await signIn([], ' User@Example.com ', 'senha', { auth: { signInWithPassword: async payload => { values = payload; return { data: { session, user: session.user } }; } } });
  assert.equal(values.email, 'user@example.com');
  assert.equal(result.session.access_token, 'token');
});
test('falha de autenticação não permite acesso por credenciais locais', async () => {
  await assert.rejects(signIn([{ email: 'admin@exemplo.com', role: 'admin' }], 'admin@exemplo.com', 'Demo1234!', { auth: { signInWithPassword: async () => ({ data: {}, error: new Error('inválido') }) } }), /Não foi possível entrar/);
});
test('cadastro exige confirmação e não envia perfil privilegiado', async () => {
  let payload;
  const result = await signUp([], { name: ' Maria ', email: ' A@EXAMPLE.COM ', password: 'senha1234', role: 'admin' }, { auth: { signUp: async values => { payload = values; return { data: { user: { id: 'id' }, session: null } }; } } });
  assert.equal(result.confirmationRequired, true);
  assert.deepEqual(payload.options.data, { nome_completo: 'Maria' });
  assert.equal(payload.email, 'a@example.com');
});
test('cadastro rejeita senha curta antes de chamar o serviço', async () => {
  await assert.rejects(signUp([], { name: 'Maria', password: 'curta' }, {}), /8 caracteres/);
});
test('sessão e encerramento usam o provedor', async () => {
  let signedOut = false;
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }), signOut: async () => { signedOut = true; return {}; } } };
  assert.equal((await getCurrentSession(client)).access_token, 'token');
  await signOut(client);
  assert.equal(signedOut, true);
});
test('perfil é consultado usando o token e acesso considera somente o perfil da API', async () => {
  const profile = await getAuthenticatedProfile('token', async (endpoint, options) => {
    assert.equal(endpoint, '/auth/me'); assert.equal(options.token, 'token'); return { role: 'admin' };
  });
  assert.equal(roleHome(profile.role), 'admin');
  assert.equal(roleHome('lojista'), 'lojista');
  assert.equal(canAccessRoute('admin', { role: 'consumidor' }), false);
  assert.equal(canAccessRoute('admin', { role: 'admin' }), true);
  assert.equal(canAccessRoute('lojista/produtos', { role: 'consumidor' }), false);
  assert.equal(canAccessRoute('lojista', { role: 'consumidor' }), true);
  assert.equal(canAccessRoute('lojista', null), false);
});
test('API não envia requisição protegida sem sessão', async () => {
  const request = createApiClient({ fetchImpl: () => { throw new Error('não deveria chamar'); } });
  await assert.rejects(request('/admin/categorias'), error => error.status === 401);
});
test('API propaga validação e conflitos sem perder mensagem', async () => {
  const request = createApiClient({ getToken: async () => 'token', fetchImpl: async (_url, options) => {
    assert.equal(options.headers.get('Authorization'), 'Bearer token');
    return new Response(JSON.stringify({ detail: 'Já existe uma categoria com esse nome' }), { status: 409 });
  } });
  await assert.rejects(request('/admin/categorias'), error => error.status === 409 && /Já existe/.test(error.message));
});
test('API pública funciona sem sessão e exclusão aceita 204', async () => {
  const request = createApiClient({ fetchImpl: async (_url, options) => { assert.equal(options.headers.has('Authorization'), false); return new Response(null, { status: 204 }); } });
  assert.equal(await request('/publico/produtos', { authenticated: false }), null);
});
