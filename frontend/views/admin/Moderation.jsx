import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui';
import { adminApi } from '../../services/admin';
export default function Moderation({ notify }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    adminApi.reviews().then(result => { if (active) setReviews(result); })
      .catch(err => { if (active) setLoadError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try { await adminApi.deleteReview(deleting.id); setReviews(list => list.filter(r => r.id !== deleting.id)); setDeleting(null); notify('Avaliação removida.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Avaliações e comentários</h2>
    {loading ? <p role="status">Carregando avaliações…</p> : loadError ? <div className="error" role="alert">{loadError}<button className="outline" onClick={() => setRevision(r => r + 1)}>Tentar novamente</button></div> : <>
      {!reviews.length && <p>Nenhuma avaliação cadastrada.</p>}
      {reviews.map(review => <article className="admin-row" key={review.id}><div><h3>Avaliação de loja · {review.nota} de 5</h3><small>{new Date(review.criado_em).toLocaleDateString('pt-BR')}</small><p>{review.comentario || 'Sem comentário.'}</p>{/^https?:\/\//i.test(review.foto_url || '') && <img className="review-photo" src={review.foto_url} alt="Foto da avaliação" />}</div><button className="text-button danger" onClick={() => { setDeleting(review); setError(''); }}>Remover avaliação</button></article>)}
    </>}
    {deleting && <Modal title="Remover avaliação?" onClose={() => { if (!busy) setDeleting(null); }}><p>Esta avaliação será removida permanentemente.</p>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="primary red" disabled={busy} onClick={remove}>{busy ? 'Removendo…' : 'Confirmar remoção'}</button></div></Modal>}
  </section>;
}
