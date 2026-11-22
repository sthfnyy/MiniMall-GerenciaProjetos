import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import ProductCard from "../components/ProductCard";
import StoreIdentity, { storeIdentity } from "../components/StoreIdentity";
import { listStoreReviews } from "../services/reviews";

export default function StorePage({
  store: s,
  data,
  onProduct,
  onStore,
  go,
  user,
  onReview,
  isFavorite,
  onToggleFavorite,
  isFavoriteBusy,
  fetchReviewsFn = listStoreReviews,
}) {
  const identity = storeIdentity(s.id);
  const products = (data?.products || []).filter(
    (p) => String(p.store) === String(s.id) && !p.deleted,
  );
  // GET /consumidor/avaliacoes/loja/{id} exige consumidor autenticado.
  const canReadReviews = user?.role === "consumidor";
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(canReadReviews);
  const [reviewsError, setReviewsError] = useState("");

  useEffect(() => {
    let active = true;

    if (!canReadReviews) {
      setReviews([]);
      setReviewsLoading(false);
      setReviewsError("");
      return () => { active = false; };
    }

    setReviewsLoading(true);
    setReviewsError("");
    fetchReviewsFn(s.id)
      .then((items) => {
        if (active) setReviews(items);
      })
      .catch((error) => {
        if (active) setReviewsError(error.message || "Não foi possível carregar as avaliações.");
      })
      .finally(() => {
        if (active) setReviewsLoading(false);
      });

    return () => { active = false; };
  }, [canReadReviews, s.id, fetchReviewsFn]);

  const averageRating = reviews.length
    ? (reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
    : "Sem avaliações";
  const formatReviewDate = (value) => {
    if (!value) return "";
    const date = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
  };

  return (
    <>
      <button className="back-link" onClick={() => go("lojas")}>
        ← Lojas
      </button>
      <section
        className={`store-cover identity-${identity.name}`}
        style={{ "--store-paper": identity.paper, "--store-ink": identity.ink }}
      >
        <StoreIdentity store={s} />
        <div>
          {s.category && <span className="eyebrow">{s.category}</span>}
          <h1>{s.name}</h1>
          {s.description && <p>{s.description}</p>}
          {canReadReviews && !reviewsLoading && !reviewsError && (
            <span className="rating">
              <Star size={16} />
              {averageRating} · {reviews.length} avaliações
            </span>
          )}
        </div>
      </section>
      <div className="section-heading">
        <h2>Produtos</h2>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              store={s}
              onProduct={onProduct}
              onStore={onStore}
              isFavorite={isFavorite ? isFavorite(p.id) : false}
              onToggleFavorite={onToggleFavorite}
              favoriteBusy={isFavoriteBusy ? isFavoriteBusy(p.id) : false}
            />
          ))}
        </div>
      ) : (
        <p>Nenhum produto publicado.</p>
      )}
      <section className="review-section">
        <div className="section-heading">
          <h2>Avaliações</h2>
          {user?.role === "consumidor" && onReview && (
            <button className="primary" type="button" onClick={() => onReview(s)}>
              <Star size={17} />
              Avaliar esta loja
            </button>
          )}
        </div>
        {!canReadReviews ? (
          <p className="section-space">
            {user
              ? "As avaliações desta loja ficam disponíveis para consumidores."
              : "Entre com uma conta de consumidor para ver e publicar avaliações."}
          </p>
        ) : reviewsLoading ? (
          <p className="section-space">Carregando avaliações...</p>
        ) : reviewsError ? (
          <p className="section-space" role="alert">{reviewsError}</p>
        ) : reviews.length ? (
          <div className="review-list">
            {reviews.map((r) => (
              <article className="review" key={r.id}>
                <div className="review-top">
                  <span className="avatar">{r.name[0]}</span>
                  <div>
                    <strong>{r.name}</strong>
                    <small>{formatReviewDate(r.date)}</small>
                  </div>
                  <span
                    className="rating"
                    aria-label={`${r.rating} de 5 estrelas`}
                  >
                    {"★".repeat(r.rating)}
                  </span>
                </div>
                {r.comment && <p>{r.comment}</p>}
                {(r.photos?.length ? r.photos : r.photo ? [{ id: `legacy-${r.id}`, url: r.photo }] : []).map((photo) => (
                  <img
                    key={photo.id || photo.url}
                    className="review-photo"
                    src={photo.url}
                    alt="Foto da avaliação"
                  />
                ))}
              </article>
            ))}
          </div>
        ) : (
          <p className="section-space">Nenhuma avaliação cadastrada.</p>
        )}
      </section>
    </>
  );
}
