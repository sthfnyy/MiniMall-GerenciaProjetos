import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Empty, Field, PageTitle } from '../../components/ui';
import MerchantNav from './MerchantNav';
import { merchantApi } from '../../services/merchant-api';
const initial = { titulo: '', descricao: '', categoria_id: '', preco_base: '', foto_principal_url: '', ativo: true };
export default function ProductForm({ productId, go, notify }) {
  const [values, setValues] = useState(initial);
  const [store, setStore] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    Promise.all([merchantApi.getStore(), merchantApi.getCategories(), productId ? merchantApi.getProduct(productId) : Promise.resolve(null)]).then(([shop, cats, product]) => {
      if (active) { setStore(shop); setCategories(cats); setValues(product ? { ...initial, ...product } : { ...initial, categoria_id: cats[0]?.id || '' }); }
    }).catch(err => { if (active) setLoadError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId, revision]);
  const set = (key, value) => setValues(v => ({ ...v, [key]: value }));
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await merchantApi.saveProduct(values, productId); notify(productId ? 'Produto atualizado.' : 'Produto cadastrado.'); go('lojista/produtos'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="consumer-page merchant-page"><PageTitle eyebrow="PAINEL DO LOJISTA" title={productId ? 'Editar produto' : 'Novo produto'} /><MerchantNav current="produtos" go={go} />
    {loading ? <p role="status">Carregando formulário…</p> : loadError ? <div role="alert" className="error">{loadError}<button className="outline" onClick={() => setRevision(r => r + 1)}>Tentar novamente</button></div> : !store ? <Empty title="Cadastre sua loja" text="Você precisa de uma loja para cadastrar produtos." action={<button className="primary" onClick={() => go('lojista')}>Cadastrar loja</button>} /> : <div className="consumer-profile-card merchant-form-card"><form className="merchant-form" onSubmit={submit}><fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <Field label="Nome do produto" required minLength={2} maxLength={180} value={values.titulo} onChange={e => set('titulo', e.target.value)} />
      <Field label="Descrição"><textarea rows={4} value={values.descricao || ''} onChange={e => set('descricao', e.target.value)} /></Field>
      <div className="merchant-grid"><Field label="Categoria"><select required value={values.categoria_id} onChange={e => set('categoria_id', e.target.value)}><option value="" disabled>Selecione uma categoria</option>{categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field><Field label="Preço (R$)" type="number" min="0" max="99999999.99" step="0.01" required value={values.preco_base} onChange={e => set('preco_base', e.target.value)} /></div>
      {!categories.length && <p role="status">Ainda não existem categorias. Solicite o cadastro à administração.</p>}
      <Field label="URL da foto principal (opcional)" type="url" placeholder="https://…" value={values.foto_principal_url || ''} onChange={e => set('foto_principal_url', e.target.value)} />
      <Field label="Situação"><select value={String(values.ativo)} onChange={e => set('ativo', e.target.value === 'true')}><option value="true">Ativo</option><option value="false">Inativo</option></select></Field>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="merchant-actions"><button type="button" className="outline" onClick={() => go('lojista/produtos')}>Cancelar</button><button className="primary" disabled={!categories.length}><Save size={16} />{busy ? 'Salvando…' : 'Salvar produto'}</button></div>
    </fieldset></form></div>}
  </section>;
}
