export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function createApiClient({ baseUrl = '', getToken = async () => null, fetchImpl = globalThis.fetch } = {}) {
  return async function request(endpoint, { authenticated = true, token, ...options } = {}) {
    const headers = new Headers(options.headers);
    if (authenticated) {
      const accessToken = token ?? await getToken();
      if (!accessToken) throw new ApiError('Entre na sua conta para continuar.', 401);
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    if (options.body != null && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    let response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${endpoint}`, { ...options, headers });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError('Não foi possível conectar ao MiniMall. Tente novamente.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const detail = Array.isArray(body.detail)
        ? body.detail.map(item => `${item.loc?.slice(1).join('.') || 'Campo'}: ${item.msg}`).join('; ')
        : body.detail;
      const fallback = response.status === 401 ? 'Sessão expirada. Entre novamente.'
        : response.status === 403 ? 'Você não tem permissão para esta ação.' : 'Não foi possível concluir a operação.';
      throw new ApiError(typeof detail === 'string' ? detail : fallback, response.status);
    }
    return response.status === 204 ? null : response.json();
  };
}
