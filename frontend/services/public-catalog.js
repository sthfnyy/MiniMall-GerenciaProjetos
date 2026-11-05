import { apiRequest } from './api.js';
import { mapProduct, mapStore } from './adapters.js';
export const emptyCatalog = { users: [], categories: [], categoryRecords: [], stores: [], products: [], reviews: [], audit: [] };
export function catalogQuery(filters = {}, categories = []) {
  for (const key of ['min', 'max']) if (filters[key] !== '' && filters[key] != null && (!Number.isFinite(Number(filters[key])) || Number(filters[key]) < 0)) throw new Error('Informe um preço válido.');
  if (filters.min !== '' && filters.max !== '' && filters.min != null && filters.max != null && Number(filters.min) > Number(filters.max)) throw new Error('O preço mínimo deve ser menor ou igual ao máximo.');
  const params = new URLSearchParams();
  if (filters.query?.trim()) params.set('q', filters.query.trim());
  if (filters.category) {
    const category = categories.find(c => c.nome === filters.category);
    if (!category) throw new Error('Categoria não encontrada. Atualize a página.');
    params.set('categoria_id', category.id);
  }
  if (filters.store) params.set('loja_id', filters.store);
  if (filters.min !== '' && filters.min != null) params.set('preco_min', filters.min);
  if (filters.max !== '' && filters.max != null) params.set('preco_max', filters.max);
  params.set('ordem', filters.sort || 'relevancia');
  return params;
}
export function createPublicCatalogService(request = apiRequest) {
  async function products(filters, categories, signal) {
    const params = catalogQuery(filters, categories);
    params.set('limit', '200');
    const list = [];
    for (let offset = 0; ; offset += 200) {
      params.set('offset', String(offset));
      const page = await request(`/publico/produtos?${params}`, { authenticated: false, signal });
      list.push(...page.map(p => mapProduct(p, categories)));
      if (page.length < 200) return list;
    }
  }
  return {
    products,
    async load(signal) {
      const [stores, categories, list] = await Promise.all([
        request('/publico/lojas', { authenticated: false, signal }),
        request('/publico/categorias', { authenticated: false, signal }),
        products({}, [], signal),
      ]);
      return { ...emptyCatalog, stores: stores.map(mapStore), categories: categories.map(c => c.nome), categoryRecords: categories, products: list };
    },
  };
}
export const publicCatalog = createPublicCatalogService();
