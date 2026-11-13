import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, House, LayoutGrid, LogOut, Search, Store, User, X } from "lucide-react";
import Home from "./views/Home";
import Catalog from "./views/Catalog";
import StorePage from "./views/StorePage";
import ProductDetail from "./views/ProductDetail";
import AuthPage from "./views/AuthPage";
import ConsumerProfile from "./views/consumer/ConsumerProfile";
import StoreSettings from "./views/merchant/StoreSettings";
import ProductList from "./views/merchant/ProductList";
import ProductForm from "./views/merchant/ProductForm";
import StoreCard from "./components/StoreCard";
import { Empty } from "./components/ui";
import { emptyCatalog, publicCatalog } from "./services/catalog";
import {
  canAccessRoute,
  getAuthenticatedProfile,
  getAuthenticatedRoute,
  getCurrentSession,
  observeAuthChanges,
  signOut,
} from "./services/auth";

const emptyFilters = {
  query: "",
  category: "",
  store: "",
  min: "",
  max: "",
  sort: "relevancia",
};

export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "inicio");
  const [data, setData] = useState(emptyCatalog);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
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
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    publicCatalog
      .load(controller.signal)
      .then((catalog) => {
        if (!controller.signal.aborted) setData(catalog);
      })
      .catch((error) => {
        if (error.name !== "AbortError" && !controller.signal.aborted) {
          setCatalogError(error.message);
          setData(emptyCatalog);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [catalogRevision]);

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

  const approved = (data.stores || []).filter((s) => s.status === "aprovada");
  const products = (data.products || []).filter((p) => !p.deleted && p.active !== false);
  const product = products.find((p) => route === `produto/${p.id}`);
  const store = approved.find((s) => route === `loja/${s.id}`);

  const onProduct = (p) => go(`produto/${p.id}`);
  const onStore = (id) => go(`loja/${id}`);
  const storeCard = (s) => <StoreCard key={s.id} store={s} data={data} onStore={onStore} />;

  const productFormRoute = route === "lojista/produtos/novo" || route.startsWith("lojista/produtos/editar/");
  const known =
    ["inicio", "explorar", "lojas", "login", "cadastro", "conta", "lojista", "lojista/produtos", "lojista/produtos/novo"].includes(route) ||
    productFormRoute ||
    Boolean(product) ||
    Boolean(store);
  const restricted = !canAccessRoute(route, user);
  const nav = [
    ["inicio", "Início", House],
    ["explorar", "Produtos", LayoutGrid],
    ["lojas", "Lojas", Store],
  ];
  if (user) {
    nav.push(["conta", "Minha conta", User]);
    nav.push(["lojista", user.role === "lojista" ? "Minha loja" : "Cadastrar loja", Store]);
  }

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <header><div className="header-inner">
      <a className="brand" href="#inicio">mini<span>mall</span><i /></a>
      <form
        className="searchbox"
        onSubmit={(e) => {
          e.preventDefault();
          go("explorar");
        }}
      >
        <Search size={19} />
        <input
          aria-label="Buscar produtos"
          placeholder="Buscar produtos"
          value={filters.query}
          onChange={(e) => {
            setFilters((f) => ({ ...f, query: e.target.value }));
            if (route !== "explorar") go("explorar");
          }}
        />
        <button className="search-submit" aria-label="Pesquisar">
          <ArrowRight size={18} />
        </button>
      </form>
      {authLoading ? <span role="status">Verificando sessão…</span> : user ? <div className="row account-status"><span>{user.name}</span><button className="icon-button" aria-label="Sair" onClick={logout}><LogOut size={18} /></button></div> : <button className="account-button" onClick={() => go("login")}>Entrar</button>}
    </div></header>
    <nav className="nav-bar" aria-label="Navegação principal"><div className="nav-inner"><div>{nav.map(([path, label, Icon]) => <button key={path} aria-current={route === path ? "page" : undefined} className={route === path ? "active" : ""} onClick={() => go(path)}><Icon size={16} />{label}</button>)}</div></div></nav>
    <main id="main-content" tabIndex={-1} className={route === "inicio" ? "home-main" : ""}>
      {catalogError && <div className="error" role="alert">{catalogError} <button className="text-button" onClick={() => setCatalogRevision((r) => r + 1)}>Recarregar vitrine</button></div>}
      {catalogLoading && ["inicio", "explorar", "lojas"].includes(route) && <p role="status">Carregando vitrine…</p>}
      {authError && <div className="error" role="alert">{authError}</div>}
      {restricted ? authLoading ? <p role="status">Verificando acesso…</p> : <Empty title="Acesso restrito" text="Entre com uma conta autorizada para acessar esta página." action={<button className="primary" onClick={() => go("login")}>Entrar</button>} /> : <>
        {route === "inicio" && <Home products={products} stores={approved} onProduct={onProduct} onExplore={(category) => { setFilters({ ...emptyFilters, category: category || "" }); go("explorar"); }} onStores={() => go("lojas")} storeCard={storeCard} />}
        {route === "explorar" && <Catalog data={data} filters={filters} setFilters={setFilters} onProduct={onProduct} onStore={onStore} />}
        {route === "lojas" && <>
          <div className="page-title"><h1>Lojas</h1></div>
          {approved.length ? <div className="store-grid all-stores">{approved.map(storeCard)}</div> : <Empty title="Nenhuma loja encontrada" text="Ainda não há lojas com produtos publicados na vitrine." action={<button className="primary" onClick={() => go("explorar")}>Ver vitrine</button>} />}
        </>}
        {store && <StorePage store={store} data={data} onProduct={onProduct} onStore={onStore} go={go} />}
        {product && <ProductDetail product={product} store={approved.find((s) => String(s.id) === String(product.store))} go={go} />}
        {["login", "cadastro"].includes(route) && <AuthPage key={route} mode={route} onSuccess={login} go={go} />}
        {route === "conta" && <ConsumerProfile user={user} onLogout={logout} />}
        {route === "lojista" && <StoreSettings user={user} go={go} notify={setToast} onStoreCreated={async () => {
          const session = await getCurrentSession();
          await syncSession(session);
        }} />}
        {route === "lojista/produtos" && <ProductList go={go} notify={setToast} />}
        {productFormRoute && <ProductForm key={route} productId={route.startsWith("lojista/produtos/editar/") ? route.split("/")[3] : null} go={go} notify={setToast} />}
        {!known && !catalogLoading && <Empty title="Página não encontrada" text="Esta página não está disponível." action={<button className="primary" onClick={() => go("inicio")}>Voltar ao início</button>} />}
      </>}
    </main>
    <footer><a className="brand" href="#inicio">mini<span>mall</span><i /></a></footer>
    {toast && <div className="toast" role="status">{toast}<button aria-label="Fechar mensagem" onClick={() => setToast("")}><X size={16} /></button></div>}
  </>;
}
