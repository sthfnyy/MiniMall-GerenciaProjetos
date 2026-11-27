import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock3, ExternalLink, MapPin, MessageCircle, RefreshCw, Star } from "lucide-react";
import ProductCard from "../components/ProductCard";
import PurchaseGate from "../components/PurchaseGate";
import StoreIdentity, { storeIdentity } from "../components/StoreIdentity";
import { normalizeBrazilianWhatsApp } from "../services/contact";
import { listStoreReviews } from "../services/reviews";

function formatReviewDate(value) {
  if (!value) return "";
  const date = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}

function Stars({ value, size = 16 }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={n <= rounded ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

export default function StorePage({
  store: s,
  data,
  onProduct,
  onStore,
  go,
  user,
  notify,
  isFavorite,
  onToggleFavorite,
  isFavoriteBusy,
  fetchReviewsFn = listStoreReviews,
}) {
  const identity = storeIdentity(s.id);
  const products = (data?.products || []).filter(
    (p) => String(p.store) === String(s.id) && !p.deleted,
  );
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");

  // Avaliações públicas: leitura sem login (GET /lojas/{id}/avaliacoes).
  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    setReviewsError("");
    try {
      setReviews(await fetchReviewsFn(s.id));
    } catch (error) {
      setReviewsError(error.message || "Não foi possível carregar as avaliações.");
    } finally {
      setReviewsLoading(false);
    }
  }, [s.id, fetchReviewsFn]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const total = reviews.length;
  const average = total
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total
    : null;
  const averageLabel = average == null ? "" : average.toFixed(1).replace(".", ",");
  const whatsappDigits = normalizeBrazilianWhatsApp(s.whatsapp);

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
          {!reviewsLoading && !reviewsError && (
            <span className="rating">
              <Star size={16} aria-hidden="true" />
              {total ? `${averageLabel} · ${total} ${total === 1 ? "avaliação" : "avaliações"}` : "Sem avaliações"}
            </span>
          )}
        </div>
      </section>

      {(s.address || s.hours || whatsappDigits || s.instagram || s.facebook) && (
        <section className="store-info-panel" aria-label="Informações da loja">
          {s.address && (
            <div className="store-info-item">
              <MapPin size={18} aria-hidden="true" />
              <div>
                <span className="eyebrow muted">Endereço</span>
                <p>{s.address}</p>
                {s.mapsUrl && (
                  <a href={s.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-link">
                    Ver no mapa <ExternalLink size={13} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          )}
          {s.hours && (
            <div className="store-info-item">
              <Clock3 size={18} aria-hidden="true" />
              <div>
                <span className="eyebrow muted">Horário</span>
                <p>{s.hours}</p>
              </div>
            </div>
          )}
          {(whatsappDigits || s.instagram || s.facebook) && (
            <div className="store-info-item">
              <MessageCircle size={18} aria-hidden="true" />
              <div>
                <span className="eyebrow muted">Contato</span>
                <div className="store-info-links">
                  {whatsappDigits && (
                    <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className="text-link">
                      WhatsApp <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  )}
                  {s.instagram && (
                    <a href={s.instagram} target="_blank" rel="noopener noreferrer" className="text-link">
                      Instagram <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  )}
                  {s.facebook && (
                    <a href={s.facebook} target="_blank" rel="noopener noreferrer" className="text-link">
                      Facebook <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

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
        <p className="section-space muted">Esta loja ainda não publicou produtos.</p>
      )}

      <section className="review-section" aria-labelledby="store-reviews-title">
        <div className="section-heading">
          <h2 id="store-reviews-title">Avaliações</h2>
          {total > 0 && (
            <span className="review-summary">
              <Stars value={average} />
              <strong>{averageLabel}</strong>
              <span className="muted">de 5 · {total} {total === 1 ? "avaliação" : "avaliações"}</span>
            </span>
          )}
        </div>

        <PurchaseGate
          mode="store"
          user={user}
          storeId={s.id}
          storeName={s.name}
          products={products}
          go={go}
          notify={notify}
        />

        {reviewsLoading ? (
          <p className="section-space" role="status">Carregando avaliações...</p>
        ) : reviewsError ? (
          <div className="error-banner section-space" role="alert">
            <AlertTriangle size={18} /><span>{reviewsError}</span>
            <button className="secondary" type="button" onClick={loadReviews}><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        ) : reviews.length ? (
          <div className="review-list">
            {reviews.map((r) => (
              <article className="review" key={r.id}>
                <div className="review-top">
                  <span className="avatar" aria-hidden="true">{(r.name || "C")[0]}</span>
                  <div>
                    <strong>{r.name}</strong>
                    <small>{formatReviewDate(r.date)}</small>
                  </div>
                  <span className="rating" aria-label={`${r.rating} de 5 estrelas`}>
                    <Stars value={r.rating} size={14} />
                  </span>
                </div>
                {r.comment && <p>{r.comment}</p>}
                {r.photos?.length > 0 && (
                  <div className="review-photo-row">
                    {r.photos.map((photo, index) => (
                      <a key={photo.id || photo.url} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto ${index + 1} da avaliação de ${r.name}`}>
                        <img className="review-photo" src={photo.url} alt={`Foto ${index + 1} da avaliação de ${r.name}`} loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="section-space muted">Esta loja ainda não recebeu avaliações.</p>
        )}
      </section>
    </>
  );
}
