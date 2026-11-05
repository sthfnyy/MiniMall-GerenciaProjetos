import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Empty, Field, Modal, PageTitle } from '../../components/ui';
import MerchantNav from './MerchantNav';
import { merchantApi } from '../../services/merchant-api';
import { money, normalize } from '../../services/catalog';
export default function ProductList({ go, notify }) {
  const [products, setProducts] = useState([]);
  const [store, setStore] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    async function load() {
      const shop = await merchantApi.getStore();
      const list = shop ? await merchantApi.listProducts() : [];
      if (active) { setStore(shop); setProducts(list); }
    }
    load().catch(err => { if (active) setLoadError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try { await merchantApi.deleteProduct(deleting.id); setProducts(list => list.filter(p => p.id !== deleting.id)); setDeleting(null); notify('Produto excluído.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const list = products.filter(p => normalize(p.titulo).includes(normalize(query)));
  return <section className="consumer-page merchant-page">
    <PageTitle eyebrow="PAINEL DO LOJISTA" title="Catálogo de Produtos" text="Gerencie os produtos da sua loja." /><MerchantNav current="produtos" go={go} />
    {loading ? <p role="status">Carregando produtos…</p> : loadError ? <div className="error" role="alert">{loadError}<button className="outline" onClick={() => setRevision(r => r + 1)}>Tentar novamente</button></div> : !store ? <Empty title="Cadastre sua loja" text="Você precisa de uma loja para gerenciar produtos." action={<button className="primary" onClick={() => go('lojista')}>Cadastrar loja</button>} /> : <>
      <div className="section-heading"><Field label="Pesquisar no meu catálogo" value={query} onChange={e => setQuery(e.target.value)} /><button className="primary" onClick={() => go('lojista/produtos/novo')}><Plus size={18} />Novo produto</button></div>
      {list.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Produtos da loja; role horizontalmente para ver todas as colunas"><table><thead><tr><th>Produto</th><th>Preço</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{list.map(p => <tr key={p.id}><td>{p.titulo}</td><td>{money(p.preco_base)}</td><td>{p.ativo ? 'Ativo' : 'Inativo'}</td><td><div className="row"><button className="text-button" aria-label={`Editar ${p.titulo}`} onClick={() => go(`lojista/produtos/editar/${p.id}`)}><Pencil size={16} />Editar</button><button className="text-button danger" aria-label={`Excluir ${p.titulo}`} onClick={() => { setDeleting(p); setError(''); }}><Trash2 size={16} />Excluir</button></div></td></tr>)}</tbody></table></div> : <Empty title="Nenhum produto encontrado" text="Cadastre seu primeiro produto ou ajuste a busca." />}
    </>}
    {deleting && <Modal title="Excluir produto?" onClose={() => { if (!busy) setDeleting(null); }}><p>O produto “{deleting.titulo}” será excluído da sua loja.</p>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="primary red" disabled={busy} onClick={remove}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></Modal>}
  </section>;
}
