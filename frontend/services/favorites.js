import { apiRequest } from "./api.js";

const UNAVAILABLE_MESSAGE =
  "O serviço de favoritos ainda não está disponível. Tente novamente mais tarde.";

function withStatus(message, status, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

// O apiRequest de Gerência usa o "detail" do FastAPI como mensagem e expõe o
// código em error.status. Um 404 com "Not Found" significa rota inexistente,
// ou seja, API de favoritos ainda não publicada no backend.
export function friendlyFavoriteError(error) {
  const status = Number.isInteger(error?.status) ? error.status : null;

  if (status === 401) {
    return withStatus("Sua sessão expirou. Entre novamente como consumidor para usar os favoritos.", 401);
  }
  if (status === 403) {
    return withStatus("Somente consumidores podem usar a lista de favoritos.", 403);
  }
  if ((status === 404 && (!error.message || error.message === "Not Found")) || [501, 502, 503].includes(status)) {
    return withStatus(UNAVAILABLE_MESSAGE, status, { unavailable: true });
  }
  if (status === 422) {
    return withStatus("Produto inválido para a lista de favoritos.", 422);
  }
  if (status && status >= 500) {
    return withStatus("Não foi possível atualizar seus favoritos no momento. Tente novamente mais tarde.", status);
  }

  return error instanceof Error
    ? error
    : new Error("Não foi possível atualizar seus favoritos.");
}

async function favoriteRequest(promise) {
  try {
    return await promise;
  } catch (error) {
    throw friendlyFavoriteError(error);
  }
}

export async function listConsumerFavorites(request = apiRequest) {
  const response = await favoriteRequest(request("/consumidor/favoritos"));
  return Array.isArray(response) ? response.filter((favorite) => favorite?.produto?.id) : [];
}

export async function addConsumerFavorite(productId, request = apiRequest) {
  return favoriteRequest(
    request("/consumidor/favoritos", {
      method: "POST",
      body: JSON.stringify({ produto_id: productId }),
    }),
  );
}

export async function deleteConsumerFavorite(productId, request = apiRequest) {
  return favoriteRequest(
    request(`/consumidor/favoritos/${encodeURIComponent(productId)}`, {
      method: "DELETE",
    }),
  );
}

export function getFavoriteProductIds(favorites = []) {
  return favorites.map((favorite) => String(favorite.produto.id));
}

// Alterna o favorito no backend e devolve o estado confirmado por ele.
// Nada é alterado no estado da tela antes da resposta da API.
//  - 409 ao adicionar: o backend informa que o produto já é favorito;
//  - 404 com detalhe do backend ao remover: o favorito já não existe.
export async function toggleConsumerFavorite(productId, currentlyFavorite, request = apiRequest) {
  if (currentlyFavorite) {
    try {
      await deleteConsumerFavorite(productId, request);
    } catch (error) {
      if (error.status === 404 && !error.unavailable) return false;
      throw error;
    }
    return false;
  }

  try {
    await addConsumerFavorite(productId, request);
  } catch (error) {
    if (error.status === 409) return true;
    throw error;
  }
  return true;
}

export function applyFavoriteState(ids = [], productId, favorite) {
  const id = String(productId);
  const without = ids.filter((item) => item !== id);
  return favorite ? [...without, id] : without;
}
