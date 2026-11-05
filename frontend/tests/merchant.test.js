import test from 'node:test';
import assert from 'node:assert/strict';
import { createMerchantService, storePayload } from '../services/merchant-api.js';
const values = { nome_loja: ' Minha Loja ', endereco_cidade: ' Picos ', endereco_uf: 'pi', whatsapp: '(89) 99999-9999' };
test('loja normaliza contato e endereço sem permitir troca do proprietário ou status', () => {
  const payload = storePayload({ ...values, lojista_id: 'outro', status: 'aprovada' });
  assert.equal(payload.whatsapp, '5589999999999'); assert.equal(payload.endereco_uf, 'PI');
  assert.equal(payload.nome_loja, 'Minha Loja'); assert.equal('status' in payload, false); assert.equal('lojista_id' in payload, false);
});
test('loja exige cidade, UF e telefone válidos', () => {
  assert.throws(() => storePayload({ ...values, endereco_cidade: '' }), /cidade/);
  assert.throws(() => storePayload({ ...values, whatsapp: '123' }), /WhatsApp/);
});
test('somente 404 representa loja ainda não cadastrada', async () => {
  assert.equal(await createMerchantService(async () => { throw { status: 404 }; }).getStore(), null);
  await assert.rejects(createMerchantService(async () => { throw new Error('Sem permissão'); }).getStore(), /Sem permissão/);
});
test('loja usa POST para criar, PATCH para editar e endpoint de nova aprovação', async () => {
  const calls = []; const service = createMerchantService(async (path, options) => { calls.push({ path, ...options }); return { id: 'uuid' }; });
  await service.saveStore(values); await service.saveStore(values, true); await service.requestApproval();
  assert.deepEqual(calls.map(c => c.method), ['POST', 'PATCH', 'POST']);
  assert.equal(calls[2].path, '/lojista/loja/solicitar-aprovacao');
});

test('produtos usam endpoints do lojista com UUID sem conversão numérica', async () => {
  const calls = []; const api = createMerchantService(async (path, options) => { calls.push({ path, ...options }); return {}; });
  const product = { titulo: 'Caderno', preco_base: '25.90', categoria_id: 'cat-uuid', ativo: true };
  await api.saveProduct(product); await api.saveProduct(product, 'produto-uuid'); await api.deleteProduct('produto-uuid');
  assert.deepEqual(calls.map(c => c.method), ['POST', 'PATCH', 'DELETE']);
  assert.equal(calls[1].path, '/lojista/produtos/produto-uuid');
  assert.equal(JSON.parse(calls[0].body).preco_base, '25.90');
});
test('produto rejeita valores não finitos, casas excedentes e imagem insegura', async () => {
  const { productPayload } = await import('../services/merchant-api.js');
  const good = { titulo: 'Caderno', preco_base: '25.90', categoria_id: 'cat', ativo: true };
  for (const preco of ['', 'abc', 'Infinity', '-1', '2.999']) assert.throws(() => productPayload({ ...good, preco_base: preco }));
  assert.throws(() => productPayload({ ...good, foto_principal_url: 'javascript:alert(1)' }), /URL/);
  assert.equal(productPayload({ ...good, loja_id: 'outra' }).loja_id, undefined);
});
