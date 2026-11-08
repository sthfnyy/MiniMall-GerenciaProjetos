import React, { useCallback, useEffect, useRef, useState } from "react";
import { House, LogOut, Store, User, X } from "lucide-react";
import AuthPage from "./views/AuthPage";
import ConsumerProfile from "./views/consumer/ConsumerProfile";
import StoreSettings from "./views/merchant/StoreSettings";
import { Empty } from "./components/ui";
import {
  canAccessRoute,
  getAuthenticatedProfile,
  getAuthenticatedRoute,
  getCurrentSession,
  observeAuthChanges,
  signOut,
} from "./services/auth";

export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "inicio");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");
  const authRevision = useRef(0);
  const go = (path) => { location.hash = path; };

  const syncSession = useCallback(async (session) => {
    const revision = ++authRevision.current;
    setAuthLoading(true);
    setAuthError("");
    setUser(null);
    try {
      if (!session?.access_token) return null;
      const profile = await getAuthenticatedProfile(session.access_token);
      const nextUser = {
        id: profile.id,
        name: profile.nome_completo,
        email: session.user?.email || "",
        role: profile.role,
      };
      if (revision === authRevision.current) setUser(nextUser);
      return nextUser;
    } catch (error) {
      if (revision === authRevision.current) setAuthError(error.message);
      throw error;
    } finally {
      if (revision === authRevision.current) setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const stop = observeAuthChanges((session) => { if (active) void syncSession(session).catch(() => {}); });
    getCurrentSession().then((session) => active && syncSession(session)).catch((error) => {
      if (active) { setAuthError(error.message); setAuthLoading(false); }
    });
    return () => { active = false; authRevision.current += 1; stop(); };
  }, [syncSession]);

  useEffect(() => {
    const change = () => { setRoute(location.hash.slice(1) || "inicio"); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  async function login(session) {
    const profile = await syncSession(session);
    if (profile) { go(getAuthenticatedRoute(profile.role)); setToast("Você entrou na conta."); }
  }

  async function logout() {
    try {
      await signOut();
      await syncSession(null);
      go("inicio");
      setToast("Você saiu da conta.");
    } catch (error) { setToast(error.message); }
  }

  const known = ["inicio", "login", "cadastro", "conta", "lojista", "lojista/produtos"].includes(route);
  const restricted = !canAccessRoute(route, user);
  const nav = [["inicio", "Início", House]];
  if (user) {
    nav.push(["conta", "Minha conta", User]);
    nav.push(["lojista", user.role === "lojista" ? "Minha loja" : "Cadastrar loja", Store]);
  }

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <header><div className="header-inner">
      <a className="brand" href="#inicio">mini<span>mall</span><i /></a>
      {authLoading ? <span role="status">Verificando sessão…</span> : user ? <div className="row account-status"><span>{user.name}</span><button className="icon-button" aria-label="Sair" onClick={logout}><LogOut size={18} /></button></div> : <button className="account-button" onClick={() => go("login")}>Entrar</button>}
    </div></header>
    <nav className="nav-bar" aria-label="Navegação principal"><div className="nav-inner"><div>{nav.map(([path, label, Icon]) => <button key={path} aria-current={route === path ? "page" : undefined} className={route === path ? "active" : ""} onClick={() => go(path)}><Icon size={16} />{label}</button>)}</div></div></nav>
    <main id="main-content" tabIndex={-1}>
      {authError && <div className="error" role="alert">{authError}</div>}
      {restricted ? authLoading ? <p role="status">Verificando acesso…</p> : <Empty title="Acesso restrito" text="Entre com uma conta autorizada para acessar esta página." action={<button className="primary" onClick={() => go("login")}>Entrar</button>} /> : <>
        {route === "inicio" && <section className="panel welcome-panel"><h1>MiniMall</h1><p>Entre ou crie sua conta para acessar seu perfil.</p>{!user && <button className="primary" onClick={() => go("login")}>Entrar</button>}</section>}
        {["login", "cadastro"].includes(route) && <AuthPage key={route} mode={route} onSuccess={login} go={go} />}
        {route === "conta" && <ConsumerProfile user={user} onLogout={logout} />}
        {route === "lojista" && <StoreSettings user={user} go={go} notify={setToast} onStoreCreated={async () => {
          const session = await getCurrentSession();
          await syncSession(session);
        }} />}
        {route === "lojista/produtos" && <Empty title="Catálogo de produtos" text="O gerenciamento de produtos será migrado na próxima etapa." action={<button className="secondary" onClick={() => go("lojista")}>Voltar à loja</button>} />}
        {!known && <Empty title="Página não encontrada" text="Esta página não está disponível." action={<button className="primary" onClick={() => go("inicio")}>Voltar ao início</button>} />}
      </>}
    </main>
    <footer><a className="brand" href="#inicio">mini<span>mall</span><i /></a></footer>
    {toast && <div className="toast" role="status">{toast}<button aria-label="Fechar mensagem" onClick={() => setToast("")}><X size={16} /></button></div>}
  </>;
}
