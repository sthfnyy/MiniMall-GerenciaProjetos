import { apiRequest } from './api.js';

export function storePayload(values) {
  const nome = values.nome_loja?.trim();
  const cidade = values.endereco_cidade?.trim();
  const uf = values.endereco_uf?.trim().toUpperCase();
  let telefone = String(values.whatsapp || '').replace(/\D/g, '');
  if (/^\d{10,11}$/.test(telefone)) telefone = `55${telefone}`;
  if (!nome || nome.length < 2) throw new Error('Informe o nome da loja.');
  if (!cidade || !/^[A-Z]{2}$/.test(uf)) throw new Error('Informe a cidade e a UF da loja.');
  if (!/^55\d{10,11}$/.test(telefone)) throw new Error('Informe o WhatsApp com DDD.');
  return {
    nome_loja: nome, descricao: values.descricao?.trim() || null,
    endereco_logradouro: values.endereco_logradouro?.trim() || null,
    endereco_numero: values.endereco_numero?.trim() || null,
    endereco_bairro: values.endereco_bairro?.trim() || null,
    endereco_cidade: cidade, endereco_uf: uf,
    endereco_cep: values.endereco_cep?.trim() || null,
    whatsapp: telefone, instagram: values.instagram?.trim() || null,
    horario_funcionamento: values.horario_funcionamento || null,
  };
}
export function productPayload(values) {
  const titulo = values.titulo?.trim();
  const preco = Number(values.preco_base);
  if (!titulo || titulo.length < 2) throw new Error('Informe o nome do produto.');
  if (!values.categoria_id) throw new Error('Selecione uma categoria.');
  if (values.preco_base === '' || !Number.isFinite(preco) || preco < 0 || preco > 99999999.99) throw new Error('Informe um preço válido.');
  if (Math.abs(preco * 100 - Math.round(preco * 100)) > 0.0001) throw new Error('O preço deve ter no máximo duas casas decimais.');
  const foto = values.foto_principal_url?.trim() || null;
  if (foto && !/^https?:\/\//i.test(foto)) throw new Error('Informe uma URL de imagem com http ou https.');
  return { titulo, categoria_id: values.categoria_id, descricao: values.descricao?.trim() || null, preco_base: preco.toFixed(2), foto_principal_url: foto, ativo: Boolean(values.ativo) };
}
export function createMerchantService(request = apiRequest) {
  return {
    async getStore() {
      try { return await request('/lojista/loja'); }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    saveStore(values, exists = false) {
      return request('/lojista/loja', { method: exists ? 'PATCH' : 'POST', body: JSON.stringify(storePayload(values)) });
    },
    getCategories() { return request('/publico/categorias', { authenticated: false }); },
    listProducts() { return request('/lojista/produtos'); },
    getProduct(id) { return request(`/lojista/produtos/${encodeURIComponent(id)}`); },
    saveProduct(values, id) { return request(`/lojista/produtos${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(productPayload(values)) }); },
    deleteProduct(id) { return request(`/lojista/produtos/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    requestApproval() { return request('/lojista/loja/solicitar-aprovacao', { method: 'POST' }); },
  };
}
export const merchantApi = createMerchantService();
