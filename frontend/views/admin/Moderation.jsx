import React, { useEffect, useState } from "react";
import { Modal } from "../../components/ui";
import { getAdminReviews, deleteAdminReview } from "../../services/admin";

export default function Moderation({ notify }) {
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [actionError, setActionError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setReviewsLoading(true);
    setReviewsError("");

    async function loadReviews() {
      try {
        const result = await getAdminReviews();
        if (active) {
          setReviews(result || []);
          setReviewsError("");
        }
      } catch (err) {
        if (active) {
          setReviewsError(err.message || "Não foi possível carregar as avaliações.");
        }
      } finally {
        if (active) {
          setReviewsLoading(false);
        }
      }
    }

    loadReviews();

    return () => {
      active = false;
    };
  }, [revision]);

  async function handleConfirmDelete() {
    if (!deleting || processing) return;

    setProcessing(true);
    setActionError("");

    try {
      await deleteAdminReview(deleting.id);
      setReviews((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleting(null);
      notify?.("Avaliação removida com sucesso.");
    } catch (err) {
      setActionError(err.message || "Erro ao remover avaliação.");
    } finally {
      setProcessing(false);
    }
  }

  function closeModal() {
    if (processing) return;
    setDeleting(null);
    setActionError("");
  }

  return (
    <>
      <section className="panel">
        <h2>Avaliações e comentários</h2>

        {reviewsLoading && <p role="status">Carregando avaliações...</p>}

        {reviewsError && (
          <div className="error" role="alert">
            Erro ao carregar avaliações: {reviewsError}{" "}
            <button
              className="text-button"
              type="button"
              onClick={() => setRevision((r) => r + 1)}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!reviewsLoading && !reviewsError && reviews.length === 0 && (
          <p>Nenhuma avaliação cadastrada.</p>
        )}

        {!reviewsLoading &&
          !reviewsError &&
          reviews.map((review) => (
            <article className="admin-row" key={review.id}>
              <div>
                <strong>Avaliação de loja</strong>
                <small>Nota: {review.nota} de 5</small>
                <small>
                  Data:{" "}
                  {new Date(review.criado_em).toLocaleDateString("pt-BR")}
                </small>
                <p>{review.comentario || "Sem comentário."}</p>
                {review.foto_url && /^https?:\/\//i.test(review.foto_url) && (
                  <img
                    className="review-photo"
                    src={review.foto_url}
                    alt="Foto da avaliação"
                  />
                )}
              </div>

              <div className="moderation-actions">
                <button
                  className="text-button danger"
                  disabled={processing}
                  onClick={() => {
                    setDeleting(review);
                    setActionError("");
                  }}
                >
                  Remover avaliação
                </button>
              </div>
            </article>
          ))}
      </section>

      {deleting && (
        <Modal title="Remover avaliação" onClose={closeModal}>
          <p>Esta avaliação será excluída permanentemente.</p>

          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}

          <div className="modal-actions">
            <button
              className="outline"
              type="button"
              disabled={processing}
              onClick={closeModal}
            >
              Cancelar
            </button>

            <button
              className="primary red"
              type="button"
              disabled={processing}
              onClick={handleConfirmDelete}
            >
              {processing ? "Processando..." : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
