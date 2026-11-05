import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogQuery, createPublicCatalogService } from '../services/public-catalog.js';
import { mapProduct } from '../services/adapters.js';
test('filtros enviam UUIDs, texto, ordenação e preço para API pública', () => {
  const params = catalogQuery({ query: 'Café & chá', category: 'Casa', store: 'loja-uuid', min: '0', max: '99.90', sort: 'menor' }, [{ id: 'categoria-uuid', nome: 'Casa' }]);
  assert.equal(params.get('q'), 'Café & chá'); assert.equal(params.get('categoria_id'), 'categoria-uuid'); assert.equal(params.get('loja_id'), 'loja-uuid'); assert.equal(params.get('preco_min'), '0');
});
test('busca rejeita preços inválidos e intervalo invertido', () => {
  assert.throws(() => catalogQuery({ min: '20', max: '10' }), /mínimo/);
  assert.throws(() => catalogQuery({ min: 'NaN' }), /válido/);
});
test('vitrine dispensa login e converte dados reais sem misturar produtos demonstrativos', async () => {
  const service = createPublicCatalogService(async (path, options) => {
    assert.equal(options.authenticated, false);
    if (path === '/publico/lojas') return [{ id: 'loja', nome_loja: 'Loja', status: 'aprovada' }];
    if (path === '/publico/categorias') return [{ id: 'cat', nome: 'Casa' }];
    return [{ id: 'produto', loja_id: 'loja', titulo: 'Vaso', preco_base: '32.90', nome_categoria: 'Casa', ativo: true }];
  });
  const data = await service.load();
  assert.equal(data.products.length, 1); assert.equal(data.products[0].price, 32.90); assert.equal(data.products[0].id, 'produto');
});
test('produto sem foto usa imagem neutra e bloqueia URLs executáveis', () => {
  assert.equal(mapProduct({ id: 'uuid', preco_base: '0', ativo: true, foto_principal_url: 'javascript:alert(1)' }).image, '/images/product-placeholder.svg');
});
