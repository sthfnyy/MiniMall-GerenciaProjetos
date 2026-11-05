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
