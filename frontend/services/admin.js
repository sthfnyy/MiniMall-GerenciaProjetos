import { apiRequest } from './api.js';
export function categoryName(value) {
  const name = value.trim();
  if (name.length < 2 || name.length > 100) throw new Error('O nome da categoria deve ter entre 2 e 100 caracteres.');
  return name;
}
export function createAdminService(request = apiRequest) {
  return {
    categories: () => request('/admin/categorias'),
    saveCategory(name, id) {
      const nome = categoryName(name);
      return request(`/admin/categorias${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify({ nome }) });
    },
    deleteCategory: id => request(`/admin/categorias/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    reviews: () => request('/admin/moderacao/avaliacoes'),
    deleteReview: id => request(`/admin/moderacao/avaliacoes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}
export const adminApi = createAdminService();
