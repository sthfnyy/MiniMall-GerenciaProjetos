import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ImageOff, RefreshCw, Star, Trash2 } from "lucide-react";
import { Modal } from "../../components/ui";
import { sanitizeImageUrl } from "../../services/catalog";
import { deleteAdminReview, deleteAdminReviewPhoto, getAdminReviews } from "../../services/admin";

function reviewPhotos(review) {
  const photos = Array.isArray(review.fotos) ? review.fotos.filter((photo) => sanitizeImageUrl(photo.url)) : [];
  if (photos.length) return photos;
  // Avaliações antigas guardavam uma única foto em foto_url.
  return sanitizeImageUrl(review.foto_url) ? [{ id: null, url: review.foto_url, legacy: true }] : [];
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}

export default function Moderation({ notify }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const [actionError, setActionError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminReviews();
      setReviews(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err.message || "Não foi possível carregar as avaliações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirm() {
    if (!pending || processing) return;
    setProcessing(true);
    setActionError("");
    try {
      if (pending.type === "review") {
        await deleteAdminReview(pending.review.id);
        setReviews((current) => current.filter((item) => item.id !== pending.review.id));
        notify?.("Avaliação removida. Os pontos relacionados foram estornados.");
      } else {
        await deleteAdminReviewPhoto(pending.photo.id);
        setReviews((current) => current.map((item) => (
          item.id === pending.review.id
            ? { ...item, fotos: (item.fotos || []).filter((photo) => photo.id !== pending.photo.id) }
            : item
        )));
        notify?.("Foto removida. Os pontos da foto foram estornados.");
      }
      setPending(null);
    } catch (err) {
      setActionError(err.message || "Não foi possível concluir a remoção.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="admin-section-head">
          <h2>Avaliações e comentários</h2>
          {!loading && !error && <span className="muted">{reviews.length} {reviews.length === 1 ? "avaliação" : "avaliações"}</span>}
        </div>

        {loading && <p role="status">Carregando avaliações...</p>}
        {!loading && error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={18} /><span>{error}</span>
            <button className="secondary" type="button" onClick={load}><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        )}
        {!loading && !error && reviews.length === 0 && <p className="muted">Nenhuma avaliação cadastrada.</p>}

        {!loading && !error && reviews.map((review) => {
          const photos = reviewPhotos(review);
          return (
            <article className="admin-row moderation-row" key={review.id}>
              <div className="moderation-content">
                <div className="moderation-meta">
                  <strong>{review.loja_nome || "Loja"}</strong>
                  <span className="rating" aria-label={`Nota ${review.nota} de 5`}>
                    <Star size={14} aria-hidden="true" /> {review.nota}/5
                  </span>
                </div>
                <small>Consumidor: {review.consumidor_nome || "Consumidor"} · {formatDate(review.criado_em)}</small>
                <p>{review.comentario || <em className="muted">Sem comentário.</em>}</p>
                {photos.length > 0 && (
                  <div className="moderation-photos">
                    {photos.map((photo, index) => (
                      <figure key={photo.id || photo.url} className="moderation-photo">
                        <button type="button" className="moderation-photo-open" onClick={() => setPreview(photo.url)} aria-label={`Ampliar foto ${index + 1} da avaliação`}>
                          <img src={photo.url} alt={`Foto ${index + 1} enviada na avaliação`} loading="lazy" />
                        </button>
                        {photo.id && !photo.legacy && (
                          <button
                            type="button"
                            className="text-button danger"
                            disabled={processing}
                            onClick={() => { setActionError(""); setPending({ type: "photo", review, photo }); }}
                          >
                            <ImageOff size={14} /> Remover foto
                          </button>
                        )}
                      </figure>
                    ))}
                  </div>
                )}
              </div>
              <div className="moderation-actions">
                <button
                  className="text-button danger"
                  type="button"
                  disabled={processing}
                  onClick={() => { setActionError(""); setPending({ type: "review", review }); }}
                >
                  <Trash2 size={14} /> Remover avaliação
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {pending && (
        <Modal
          title={pending.type === "review" ? "Remover avaliação" : "Remover foto"}
          onClose={() => setPending(null)}
          busy={processing}
        >
          <p>
            {pending.type === "review"
              ? "A avaliação, suas fotos e os pontos concedidos ao consumidor serão removidos permanentemente."
              : "A foto será removida da avaliação e os 5 pontos concedidos por ela serão estornados."}
          </p>
          {actionError && <p className="error" role="alert">{actionError}</p>}
          <div className="modal-actions">
            <button className="outline" type="button" disabled={processing} onClick={() => setPending(null)}>Cancelar</button>
            <button className="primary red" type="button" disabled={processing} onClick={confirm}>
              {processing ? "Removendo..." : "Confirmar remoção"}
            </button>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal title="Foto da avaliação" onClose={() => setPreview(null)} wide>
          <img className="moderation-preview" src={preview} alt="Foto da avaliação ampliada" />
        </Modal>
      )}
    </>
  );
}
