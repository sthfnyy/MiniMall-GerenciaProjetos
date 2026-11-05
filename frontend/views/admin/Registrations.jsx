import React, { useEffect, useState } from 'react';
import { Modal, Field } from '../../components/ui';
import { adminApi } from '../../services/admin';
export default function Registrations({ notify }) {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    adminApi.categories().then(result => { if (active) setCategories(result); })
      .catch(err => { if (active) setLoadError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await adminApi.saveCategory(name, editing?.id);
      setCategories(list => [...list.filter(c => c.id !== result.id), result].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setEditing(null); setName(''); notify('Categoria salva.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await adminApi.deleteCategory(deleting.id);
      setCategories(list => list.filter(c => c.id !== deleting.id));
      if (editing?.id === deleting.id) { setEditing(null); setName(''); }
      setDeleting(null); notify('Categoria excluída.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Categorias globais</h2>
    {loading ? <p role="status">Carregando categorias…</p> : loadError ? <div className="error" role="alert">{loadError}<button className="outline" onClick={() => setRevision(r => r + 1)}>Tentar novamente</button></div> : <>
      <form className="category-form" onSubmit={save}><Field label="Nome da categoria" required minLength={2} maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)} /><button className="primary" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alteração' : 'Cadastrar categoria'}</button>{editing && <button className="outline" type="button" disabled={busy} onClick={() => { setEditing(null); setName(''); setError(''); }}>Cancelar edição</button>}</form>
      {error && !deleting && <p className="error" role="alert">{error}</p>}
      {categories.length === 0 && <p>Nenhuma categoria cadastrada.</p>}
      {categories.map(c => <div className="admin-row" key={c.id}><strong>{c.nome}</strong><div className="row"><button className="text-button" disabled={busy} aria-label={`Alterar ${c.nome}`} onClick={() => { setEditing(c); setName(c.nome); setError(''); }}>Alterar</button><button className="text-button danger" disabled={busy} aria-label={`Excluir ${c.nome}`} onClick={() => { setDeleting(c); setError(''); }}>Excluir</button></div></div>)}
    </>}
    {deleting && <Modal title="Excluir categoria?" onClose={() => { if (!busy) setDeleting(null); }}><p>{deleting.nome}</p><p>Categorias com produtos vinculados não podem ser excluídas.</p>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="outline" disabled={busy} onClick={() => { setDeleting(null); setError(''); }}>Cancelar</button><button className="primary red" disabled={busy} onClick={remove}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></Modal>}
  </section>;
}
