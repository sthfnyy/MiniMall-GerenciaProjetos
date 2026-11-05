export function mapStore(store) {
  return {
    id: store.id, owner: store.lojista_id, name: store.nome_loja,
    description: store.descricao || '', status: store.status,
    whatsapp: store.whatsapp, instagram: store.instagram || '',
    address: [store.endereco_logradouro, store.endereco_numero, store.endereco_bairro, store.endereco_cidade, store.endereco_uf].filter(Boolean).join(', '),
    hours: store.horario_funcionamento?.descricao || Object.entries(store.horario_funcionamento || {}).map(([day, time]) => `${day}: ${typeof time === 'string' ? time : JSON.stringify(time)}`).join(' · '),
    category: '', motivo_rejeicao: store.motivo_rejeicao,
  };
}
export function mapProduct(product, categories = []) {
  return {
    id: product.id, store: product.loja_id, name: product.titulo,
    description: product.descricao || '', price: Number(product.preco_base), sale: 0,
    category: product.nome_categoria || categories.find(c => c.id === product.categoria_id)?.nome || '',
    image: /^https?:\/\//i.test(product.foto_principal_url || '') ? product.foto_principal_url : '/images/product-placeholder.svg',
    variations: [], deleted: !product.ativo,
  };
}
