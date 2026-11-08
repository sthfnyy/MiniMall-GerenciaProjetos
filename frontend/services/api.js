import { getAccessToken } from "./auth.js";

const API_URL = import.meta.env?.VITE_API_URL || "http://127.0.0.1:8000";

export async function apiRequest(endpoint, options = {}) {
  const { authenticated = true, token, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  if (authenticated) {
    const accessToken = token ?? (await getAccessToken());
    if (!accessToken) {
      const error = new Error("Sessão expirada ou usuário não autenticado.");
      error.status = 401;
      throw error;
    }
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (fetchOptions.body != null && !(fetchOptions.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, { ...fetchOptions, headers });
  } catch (cause) {
    const error = new Error("Não foi possível conectar ao MiniMall.");
    error.cause = cause;
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join("; ") : body.detail;
    const fallback = response.status === 401 ? "Sessão inválida ou expirada."
      : response.status === 403 ? "Você não possui permissão para realizar esta operação."
        : `Erro na API: HTTP ${response.status}`;
    const error = new Error(typeof detail === "string" ? detail : fallback);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
