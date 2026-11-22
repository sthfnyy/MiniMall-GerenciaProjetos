import { apiRequest } from "./api.js";

export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_PHOTO_SIZE = 5 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateConsumerReviewPhoto(file, currentPhotoCount = 0) {
  if (!file) {
    throw new Error("Selecione uma imagem para enviar.");
  }

  if (currentPhotoCount >= MAX_REVIEW_PHOTOS) {
    throw new Error("Cada avaliação pode ter no máximo 3 fotos.");
  }

  if (!REVIEW_PHOTO_TYPES.includes(file.type)) {
    throw new Error("Envie uma imagem JPEG, PNG ou WebP.");
  }

  if (file.size > MAX_REVIEW_PHOTO_SIZE) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }

  return file;
}

// O apiRequest de Gerência expõe o código HTTP em error.status; o formato
// "HTTP <código>" na mensagem é mantido por compatibilidade com o PDSI-I.
function errorStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  const match = /HTTP (\d{3})/.exec(error?.message || "");
  return match ? Number(match[1]) : null;
}

function withStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function friendlyPhotoError(error) {
  const message = error?.message || "Não foi possível processar a foto.";
  const status = errorStatus(error);

  if (status === 401) {
    return withStatus("Sua sessão expirou. Entre novamente para enviar fotos.", 401);
  }
  if (status === 403) {
    return withStatus("Somente o consumidor autor da avaliação pode alterar as fotos.", 403);
  }
  if (status === 404) {
    return withStatus("A avaliação ou a foto não foi encontrada.", 404);
  }
  if (status === 409) {
    return withStatus("Esta avaliação já possui o limite de 3 fotos.", 409);
  }
  if (status === 413) {
    return withStatus("A imagem deve ter no máximo 5 MB.", 413);
  }
  if (status === 415 || status === 422) {
    return withStatus("O arquivo enviado não é uma imagem válida.", status);
  }
  if (status && status >= 500) {
    return withStatus("Não foi possível processar a foto no momento. Tente novamente mais tarde.", status);
  }

  return error instanceof Error ? error : new Error(message);
}

export function friendlyReviewError(error) {
  const status = errorStatus(error);

  if (status === 401) {
    return withStatus("Sua sessão expirou. Entre novamente como consumidor.", 401);
  }
  if (status === 403) {
    return withStatus("Somente consumidores podem publicar e consultar avaliações.", 403);
  }
  if (status === 404) {
    return withStatus(
      "Loja ou avaliação não encontrada, ou o serviço de avaliações não está disponível no momento.",
      404,
    );
  }
  if (status === 422) {
    return withStatus(
      "Dados da avaliação inválidos. Confira a nota (1 a 5) e o comentário.",
      422,
    );
  }
  if (status && status >= 500) {
    return withStatus(
      "Não foi possível acessar as avaliações no momento. Tente novamente mais tarde.",
      status,
    );
  }

  return error instanceof Error
    ? error
    : new Error(error?.message || "Não foi possível processar a avaliação.");
}

async function reviewRequest(promise) {
  try {
    return await promise;
  } catch (error) {
    throw friendlyReviewError(error);
  }
}

export async function uploadConsumerReviewPhoto(
  assessmentId,
  file,
  request = apiRequest,
) {
  validateConsumerReviewPhoto(file);
  const body = new FormData();
  body.append("arquivo", file);

  try {
    return await request(`/consumidor/avaliacoes/${assessmentId}/fotos`, {
      method: "POST",
      body,
    });
  } catch (error) {
    throw friendlyPhotoError(error);
  }
}

export async function deleteConsumerReviewPhoto(
  assessmentId,
  photoId,
  request = apiRequest,
) {
  try {
    return await request(
      `/consumidor/avaliacoes/${assessmentId}/fotos/${photoId}`,
      { method: "DELETE" },
    );
  } catch (error) {
    throw friendlyPhotoError(error);
  }
}

export function appendReviewPhoto(reviews, reviewId, photo) {
  return reviews.map((review) =>
    review.id === reviewId
      ? { ...review, fotos: [...(review.fotos || []), photo] }
      : review,
  );
}

export function removeReviewPhoto(reviews, reviewId, photoId) {
  return reviews.map((review) =>
    review.id === reviewId
      ? {
          ...review,
          fotos: (review.fotos || []).filter((photo) => photo.id !== photoId),
        }
      : review,
  );
}

export async function listConsumerReviews(request = apiRequest) {
  const response = await reviewRequest(request("/consumidor/avaliacoes"));
  return Array.isArray(response) ? response : [];
}

export function normalizeStoreReview(review) {
  if (!review) return null;

  return {
    id: review.id,
    store: review.store ?? review.storeId ?? review.loja_id,
    name: review.name ?? review.consumerName ?? review.consumidor_nome ?? "Consumidor",
    rating: Number(review.rating ?? review.nota) || 0,
    comment: review.comment ?? review.comentario ?? "",
    photo: review.photo ?? review.foto_url ?? "",
    photos: getReviewPhotos(review),
    date: review.date ?? review.criado_em,
  };
}

export async function listStoreReviews(storeId, request = apiRequest) {
  const response = await reviewRequest(
    request(`/consumidor/avaliacoes/loja/${storeId}`),
  );
  if (!Array.isArray(response)) return [];
  return response.map(normalizeStoreReview).filter(Boolean);
}

export async function createConsumerReview(values, request = apiRequest) {
  return reviewRequest(
    request("/consumidor/avaliacoes", {
      method: "POST",
      body: JSON.stringify({
        loja_id: values.loja_id,
        nota: values.nota,
        comentario: values.comentario,
      }),
    }),
  );
}

export async function updateConsumerReview(id, values, request = apiRequest) {
  const payload = {};
  if (values.nota !== undefined) payload.nota = values.nota;
  if (values.comentario !== undefined) payload.comentario = values.comentario;

  return reviewRequest(
    request(`/consumidor/avaliacoes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteConsumerReview(id, request = apiRequest) {
  return reviewRequest(
    request(`/consumidor/avaliacoes/${id}`, { method: "DELETE" }),
  );
}

export function isBackendStoreId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

export function getReviewPhotos(review) {
  if (Array.isArray(review?.fotos) && review.fotos.length > 0) {
    return review.fotos.filter((photo) => photo?.url);
  }

  const legacyUrl = review?.foto_url || review?.photo;
  return legacyUrl ? [{ id: `legacy-${review.id}`, url: legacyUrl }] : [];
}

export function getReviewUserId(review) {
  return review?.user ?? review?.usuario_id;
}

export function getReviewStoreId(review) {
  return review?.store ?? review?.loja_id;
}

export function getReviewDate(review) {
  return review?.date ?? review?.criado_em;
}

export function getUserReviews(reviews = [], userId) {
  if (userId == null) return [];

  return reviews
    .filter(
      (review) =>
        String(getReviewUserId(review)) === String(userId),
    )
    .sort(
      (a, b) =>
        new Date(getReviewDate(b) || 0) -
        new Date(getReviewDate(a) || 0),
    );
}

export function getStoreReviews(reviews = [], storeId) {
  return reviews.filter(
    (review) =>
      String(getReviewStoreId(review)) === String(storeId),
  );
}

// Mesmas regras e mensagens do publishReview do PDSI-I, sem persistência local.
export function validateReviewInput({ user, store, rating, comment, photos = [] }) {
  if (user?.role !== "consumidor") {
    throw new Error("Somente consumidores podem publicar avaliações.");
  }

  if (!store?.id) {
    throw new Error("Loja não encontrada.");
  }

  if (!isBackendStoreId(store.id)) {
    throw new Error("Esta loja ainda não está disponível para avaliações na API.");
  }

  const numericRating = Number(rating);

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new Error("Selecione uma nota de 1 a 5 estrelas.");
  }

  const normalizedComment = comment?.trim() || "";

  if (!normalizedComment) {
    throw new Error("Escreva um comentário sobre sua experiência.");
  }

  if (photos.length > MAX_REVIEW_PHOTOS) {
    throw new Error("Cada avaliação pode ter no máximo 3 fotos.");
  }
  photos.forEach((photo) => validateConsumerReviewPhoto(photo));

  return {
    loja_id: store.id,
    nota: numericRating,
    comentario: normalizedComment,
  };
}

// Cria a avaliação e, em seguida, envia as fotos para
// POST /consumidor/avaliacoes/{id}/fotos. O usuário nunca vai no payload:
// o backend associa a avaliação ao consumidor do token.
export async function publishConsumerReview(
  { user, store, rating, comment, photos = [] },
  request = apiRequest,
) {
  const payload = validateReviewInput({ user, store, rating, comment, photos });
  const review = await createConsumerReview(payload, request);
  const uploadedPhotos = [];
  const failedPhotos = [];

  for (const file of photos) {
    try {
      uploadedPhotos.push(await uploadConsumerReviewPhoto(review.id, file, request));
    } catch (error) {
      failedPhotos.push({ file, error });
    }
  }

  return {
    review: { ...review, fotos: [...(review.fotos || []), ...uploadedPhotos] },
    uploadedPhotos,
    failedPhotos,
  };
}
