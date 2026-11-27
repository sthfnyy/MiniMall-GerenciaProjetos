import { apiRequest } from "./api.js";

// Confirmação de compra. O backend usa os
// status abaixo e exige uma compra confirmada para aceitar uma avaliação.
export const PURCHASE_STATUS = {
  contato_realizado: { label: "Pendente", badge: "pending", text: "Aguardando a confirmação da loja." },
  compra_confirmada: { label: "Confirmada", badge: "approved", text: "A loja confirmou sua compra. Você já pode avaliá-la." },
  compra_nao_reconhecida: { label: "Rejeitada", badge: "rejected", text: "A loja não reconheceu esta compra." },
};

export function purchaseStatusInfo(status) {
  return PURCHASE_STATUS[status] || { label: status || "Desconhecido", badge: "pending", text: "" };
}

function withStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function friendlyPurchaseError(error) {
  const status = Number.isInteger(error?.status) ? error.status : null;
  if (status === 401) return withStatus("Sua sessão expirou. Entre novamente para continuar.", 401);
  if (status === 403) return withStatus("Você não tem permissão para esta operação.", 403);
  if (status === 404) return withStatus(error?.message && error.message !== "Not Found" ? error.message : "Produto, loja ou solicitação não encontrada.", 404);
  if (status === 409) return withStatus(error.message, 409);
  if (status && status >= 500) return withStatus("Serviço temporariamente indisponível. Tente novamente em instantes.", status);
  return error instanceof Error ? error : new Error("Não foi possível concluir a operação.");
}

async function purchaseRequest(promise) {
  try {
    return await promise;
  } catch (error) {
    throw friendlyPurchaseError(error);
  }
}

// ---------------- Consumidor ----------------

export async function fetchConsumerPurchases(request = apiRequest) {
  const response = await purchaseRequest(request("/consumidor/intencoes-compra"));
  return Array.isArray(response) ? response : [];
}

export async function requestPurchaseConfirmation(productId, storeId, request = apiRequest) {
  if (!productId || !storeId) throw new Error("Selecione o produto que você comprou.");
  return purchaseRequest(request("/consumidor/intencoes-compra", {
    method: "POST",
    body: JSON.stringify({ produto_id: String(productId), loja_id: String(storeId) }),
  }));
}

// Resume a situação do consumidor em uma loja, priorizando a confirmação.
export function storePurchaseState(purchases = [], storeId) {
  const ofStore = purchases.filter((purchase) => String(purchase.loja?.id) === String(storeId));
  if (ofStore.some((purchase) => purchase.status === "compra_confirmada")) return "confirmed";
  if (ofStore.some((purchase) => purchase.status === "contato_realizado")) return "pending";
  if (ofStore.length) return "rejected";
  return "none";
}

export function productPurchase(purchases = [], productId) {
  return purchases.find((purchase) => String(purchase.produto?.id) === String(productId)
    && purchase.status !== "compra_nao_reconhecida") || null;
}

// ---------------- Lojista ----------------

export async function fetchMerchantPurchases(request = apiRequest) {
  const response = await purchaseRequest(request("/lojista/intencoes-compra"));
  return Array.isArray(response) ? response : [];
}

export async function decideMerchantPurchase(purchaseId, status, request = apiRequest) {
  if (!["compra_confirmada", "compra_nao_reconhecida"].includes(status)) {
    throw new Error("Decisão inválida.");
  }
  return purchaseRequest(request(`/lojista/intencoes-compra/${encodeURIComponent(purchaseId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }));
}

export function updatePurchaseInList(purchases, updated) {
  return purchases.map((purchase) => (purchase.id === updated.id ? { ...purchase, ...updated } : purchase));
}
