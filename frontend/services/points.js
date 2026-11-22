import { apiRequest } from "./api.js";

// Códigos que indicam que a API de pontos ainda não está disponível.
const UNAVAILABLE_STATUS = [404, 501, 502, 503];

function withStatus(message, status, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

export function friendlyPointsError(error) {
  const status = Number.isInteger(error?.status) ? error.status : null;

  if (status === 401) {
    return withStatus("Sua sessão expirou. Entre novamente como consumidor para consultar seus pontos.", 401);
  }
  if (status === 403) {
    return withStatus("Somente consumidores podem consultar pontos.", 403);
  }
  if (UNAVAILABLE_STATUS.includes(status)) {
    return withStatus(
      "O serviço de pontos ainda não está disponível. Tente novamente mais tarde.",
      status,
      { unavailable: true },
    );
  }
  if (status && status >= 500) {
    return withStatus("Não foi possível consultar seus pontos no momento. Tente novamente mais tarde.", status);
  }

  return error instanceof Error
    ? error
    : new Error("Não foi possível consultar seus pontos.");
}

// Apenas valida o formato da resposta: saldo, saldos por loja e histórico
// vêm do backend e nunca são recalculados no frontend.
export function normalizeConsumerPoints(response) {
  const saldoTotal = Number(response?.saldo_total);

  if (!response || !Number.isFinite(saldoTotal)) {
    throw new Error("A API de pontos retornou uma resposta inválida.");
  }

  return {
    saldo_total: saldoTotal,
    saldos_por_loja: Array.isArray(response.saldos_por_loja) ? response.saldos_por_loja : [],
    historico: Array.isArray(response.historico) ? response.historico : [],
  };
}

export async function getConsumerPoints(request = apiRequest) {
  let response;
  try {
    response = await request("/consumidor/pontos");
  } catch (error) {
    throw friendlyPointsError(error);
  }
  return normalizeConsumerPoints(response);
}
