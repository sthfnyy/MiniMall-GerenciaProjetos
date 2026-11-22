import React, { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { Field } from "../../components/ui";
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_TYPES,
  validateConsumerReviewPhoto,
} from "../../services/reviews.js";

export default function ReviewForm({ store, onPublish, onCancel }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Pré-visualizações existem apenas em memória e são liberadas ao sair.
  useEffect(
    () => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview)),
    [],
  );

  const selectPhotos = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setPhotoError("");
    const accepted = [];

    for (const file of files) {
      try {
        validateConsumerReviewPhoto(file, photos.length + accepted.length);
        accepted.push({ file, preview: URL.createObjectURL(file) });
      } catch (validationError) {
        setPhotoError(validationError.message);
        break;
      }
    }

    if (accepted.length) setPhotos((current) => [...current, ...accepted]);
  };

  const removePhoto = (index) => {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, position) => position !== index);
    });
    setPhotoError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);

    try {
      await onPublish({ rating, comment, photos: photos.map((photo) => photo.file) });
    } catch (publicationError) {
      setError(publicationError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="consumer-page">
      <button className="back-link" type="button" onClick={onCancel}>
        ← Voltar à loja
      </button>

      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Avaliar loja</h1>
        <p>Compartilhe como foi sua experiência na {store.name}.</p>
      </div>

      <form className="review-form panel" onSubmit={handleSubmit} aria-busy={submitting}>
        <div className="review-form-store">
          <span className="eyebrow muted">LOJA</span>
          <h2>{store.name}</h2>
        </div>

        <fieldset className="review-rating-field">
          <legend>Como foi sua experiência?</legend>
          <div className="review-rating-options">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= rating ? "selected" : ""}
                aria-label={`${value} ${value === 1 ? "estrela" : "estrelas"}`}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
              >
                <Star size={32} fill={value <= rating ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <span className="review-rating-status" aria-live="polite">
            {rating ? `${rating} de 5 estrelas` : "Nenhuma nota selecionada"}
          </span>
        </fieldset>

        <Field label="Sua avaliação">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Escreva sobre sua experiência com a loja..."
            required
          />
        </Field>

        <div className="review-photo-controls">
          <span className="eyebrow muted">FOTOS (OPCIONAL)</span>
          <small>
            {photos.length} de {MAX_REVIEW_PHOTOS} fotos · JPEG, PNG ou WebP até 5 MB
          </small>
          {photos.length < MAX_REVIEW_PHOTOS ? (
            <input
              type="file"
              accept={REVIEW_PHOTO_TYPES.join(",")}
              multiple
              disabled={submitting}
              aria-label={`Selecionar fotos para avaliação de ${store.name}`}
              onChange={selectPhotos}
            />
          ) : (
            <small>Limite de fotos atingido.</small>
          )}
          {photoError && <p className="error" role="alert">{photoError}</p>}
        </div>

        {photos.length > 0 && (
          <div className="review-photo-list">
            {photos.map((photo, index) => (
              <div className="review-photo-item" key={photo.preview}>
                <img
                  className="review-photo"
                  src={photo.preview}
                  alt={`Pré-visualização da foto ${index + 1}`}
                />
                <button
                  className="text-button danger"
                  type="button"
                  disabled={submitting}
                  onClick={() => removePhoto(index)}
                >
                  Remover foto
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="review-form-actions">
          <button className="outline" type="button" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting
              ? photos.length
                ? "Publicando avaliação e fotos..."
                : "Publicando..."
              : "Publicar avaliação"}
          </button>
        </div>
      </form>
    </section>
  );
}
