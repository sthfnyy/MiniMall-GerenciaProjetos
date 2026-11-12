import { getSupabaseClient, isSupabaseConfigured } from "./supabase.js";

const API_URL = import.meta.env?.VITE_API_URL || "http://127.0.0.1:8000";

export function getAuthenticatedRoute(role) {
  if (role === "consumidor") return "consumidor";
  if (role === "lojista") return "lojista";
  if (role === "admin") return "admin";
  return "inicio";
}

export function canAccessRoute(route, user) {
  if (route === "consumidor" || route.startsWith("consumidor/")) {
    return user?.role === "consumidor";
  }
  if (route === "lojista" || route.startsWith("lojista/")) {
    return user?.role === "lojista";
  }
  if (route === "admin" || route.startsWith("admin/")) {
    return user?.role === "admin";
  }
  return true;
}

export function passwordsMatch(password, confirmation) {
  return password === confirmation;
}

export async function signIn(_users, email, password, client = getSupabaseClient()) {
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error("Não foi possível entrar. Confira o e-mail, a senha e a confirmação da conta.");
  if (!data.session || !data.user) throw new Error("O Supabase não retornou uma sessão válida.");
  return { user: data.user, session: data.session, accessToken: data.session.access_token };
}

export async function signUp(_users, values, fetchImpl = globalThis.fetch) {
  const nomeCompleto = values.name?.trim();
  if (!nomeCompleto || nomeCompleto.length < 2) throw new Error("Informe seu nome completo.");
  if ((values.password || "").length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
  const response = await fetchImpl(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome_completo: nomeCompleto, email: values.email.trim().toLowerCase(), senha: values.password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join("; ") : body.detail;
    throw new Error(detail || "Não foi possível cadastrar. Verifique os dados e tente novamente.");
  }
  return body;
}

export async function getCurrentSession(client) {
  if (!client && !isSupabaseConfigured()) return null;
  const { data, error } = await (client || getSupabaseClient()).auth.getSession();
  if (error) throw new Error(error.message || "Não foi possível recuperar a sessão.");
  return data.session;
}

export function observeAuthChanges(callback, client) {
  if (!client && !isSupabaseConfigured()) return () => {};
  const { data } = (client || getSupabaseClient()).auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signOut(client = getSupabaseClient()) {
  const { error } = await client.auth.signOut();
  if (error) throw new Error(error.message || "Não foi possível sair.");
}

export async function getAccessToken(client) {
  return (await getCurrentSession(client))?.access_token ?? null;
}

export async function getAuthenticatedProfile(token, fetchImpl = globalThis.fetch) {
  const accessToken = token ?? (await getAccessToken());
  if (!accessToken) return null;
  const response = await fetchImpl(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Não foi possível carregar o perfil: HTTP ${response.status}`);
  return body;
}
