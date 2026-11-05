import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import { createApiClient } from './http.js';

export function roleHome(role) {
  return role === 'admin' ? 'admin' : role === 'lojista' ? 'lojista' : 'conta';
}
export function canAccessRoute(route, user) {
  if (route === 'admin' || route.startsWith('admin/')) return user?.role === 'admin';
  if (route === 'lojista') return Boolean(user);
  if (route.startsWith('lojista/')) return user?.role === 'lojista';
  if (route === 'conta') return Boolean(user);
  return true;
}
export const isConsumerRoute = route => route === 'consumidor' || route?.startsWith('consumidor/');
export const canAccessConsumerRoute = (route, user) => !isConsumerRoute(route) || user?.role === 'consumidor';

export async function signIn(_users, email, password, client = getSupabaseClient()) {
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error('Não foi possível entrar. Confira o e-mail, a senha e a confirmação da conta.');
  if (!data.session || !data.user) throw new Error('O serviço não retornou uma sessão válida.');
  return { user: data.user, session: data.session };
}
export async function signUp(_users, values, client = getSupabaseClient()) {
  if (values.name.trim().length < 2) throw new Error('Informe seu nome completo.');
  if (values.password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
  // O perfil é definido pela API. O cadastro nunca concede permissões administrativas.
  const { data, error } = await client.auth.signUp({
    email: values.email.trim().toLowerCase(), password: values.password,
    options: { data: { nome_completo: values.name.trim() } },
  });
  if (error) throw new Error('Não foi possível cadastrar. Verifique os dados e tente novamente.');
  return { user: data.user, session: data.session, confirmationRequired: !data.session };
}
export async function getCurrentSession(client) {
  if (!client && !isSupabaseConfigured()) return null;
  const { data, error } = await (client || getSupabaseClient()).auth.getSession();
  if (error) throw new Error('Não foi possível recuperar sua sessão.');
  return data.session;
}
export function observeAuthChanges(callback, client) {
  if (!client && !isSupabaseConfigured()) return () => {};
  const { data } = (client || getSupabaseClient()).auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
export async function signOut(client = getSupabaseClient()) {
  const { error } = await client.auth.signOut();
  if (error) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
}
export async function getAccessToken(client) {
  return (await getCurrentSession(client))?.access_token ?? null;
}
export async function getAuthenticatedProfile(token, request = createApiClient({
  baseUrl: import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000',
})) {
  return request('/auth/me', { token });
}
