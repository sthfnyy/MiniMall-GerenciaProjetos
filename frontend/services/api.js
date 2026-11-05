import { createApiClient } from './http.js';
import { getAccessToken } from './auth.js';
export const apiRequest = createApiClient({
  baseUrl: import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000',
  getToken: getAccessToken,
});
