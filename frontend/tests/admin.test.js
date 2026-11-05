import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService, categoryName } from '../services/admin.js';
test('categorias usam POST, PUT e DELETE com IDs reais', async () => {
  const calls = []; const api = createAdminService(async (path, options) => { calls.push({ path, ...options }); return {}; });
  await api.saveCategory(' Casa '); await api.saveCategory('Casa e decoração', 'uuid'); await api.deleteCategory('uuid');
  assert.deepEqual(calls.map(c => c.method), ['POST', 'PUT', 'DELETE']);
  assert.equal(calls[1].path, '/admin/categorias/uuid'); assert.equal(JSON.parse(calls[0].body).nome, 'Casa');
});
test('categoria vazia ou muito curta não é enviada', () => {
  assert.throws(() => categoryName('  ')); assert.throws(() => categoryName('a')); assert.equal(categoryName(' Casa '), 'Casa');
});
test('falha de permissão e categoria em uso chegam à interface', async () => {
  for (const status of [403, 409]) {
    const api = createAdminService(async () => { const error = new Error('Operação recusada'); error.status = status; throw error; });
    await assert.rejects(api.deleteCategory('uuid'), error => error.status === status);
  }
});
test('moderação remove a avaliação selecionada sem chamar rotas inexistentes', async () => {
  const calls = []; const api = createAdminService(async (path, options) => { calls.push({ path, ...options }); return []; });
  await api.reviews(); await api.deleteReview('review-uuid');
  assert.equal(calls[0].path, '/admin/moderacao/avaliacoes'); assert.equal(calls[1].path, '/admin/moderacao/avaliacoes/review-uuid'); assert.equal(calls[1].method, 'DELETE');
});
