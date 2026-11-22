import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, House, LayoutGrid, LogOut, Search, ShieldCheck, Store, User, X } from "lucide-react";
import Home from "./views/Home";
import Catalog from "./views/Catalog";
import StorePage from "./views/StorePage";
import ProductDetail from "./views/ProductDetail";
import AuthPage from "./views/AuthPage";
import Admin from "./views/admin/Admin";
import ConsumerProfile from "./views/consumer/ConsumerProfile";
import ConsumerFavorites from "./views/consumer/ConsumerFavorites";
import ConsumerReviews from "./views/consumer/ConsumerReviews";
import ConsumerPoints from "./views/consumer/ConsumerPoints";
import ReviewForm from "./views/consumer/ReviewForm";
import StoreSettings from "./views/merchant/StoreSettings";
import ProductList from "./views/merchant/ProductList";
import ProductForm from "./views/merchant/ProductForm";
import StoreReviews from "./views/merchant/StoreReviews";
import StoreCard from "./components/StoreCard";
import { Empty } from "./components/ui";
import { emptyCatalog, publicCatalog } from "./services/catalog";
import { publishConsumerReview } from "./services/reviews";
import {
  applyFavoriteState,
  getFavoriteProductIds,
  listConsumerFavorites,
  toggleConsumerFavorite,
} from "./services/favorites";
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
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoritePending, setFavoritePending] = useState([]);
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

  // Favoritos vêm sempre da API: recarregados a cada sessão de consumidor
  // (inclusive após F5) e descartados ao sair ou trocar de perfil.
  useEffect(() => {
    let active = true;
    setFavoriteIds([]);
    setFavoritePending([]);
    if (user?.role !== "consumidor") return undefined;
    listConsumerFavorites()
      .then((favorites) => {
        if (active) setFavoriteIds(getFavoriteProductIds(favorites));
      })
      .catch((error) => {
        if (active) setToast(error.message);
      });
    return () => { active = false; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  async function login(session) {
    const profile = await syncSession(session);
    if (profile) { go(getAuthenticatedRoute(profile.role)); setToast("Você entrou na conta."); }
  }

  async function publishReview(values) {
    const result = await publishConsumerReview({ ...values, user, store: reviewStore });
    if (result.failedPhotos.length) {
      const reason = result.failedPhotos[0].error.message;
      setToast(`Avaliação publicada, mas ${result.failedPhotos.length} foto(s) não foram enviadas: ${reason} Você pode reenviá-las em Minhas avaliações.`);
    } else {
      setToast("Avaliação publicada com sucesso.");
    }
    go("consumidor/avaliacoes");
  }

  const isFavorite = (productId) => favoriteIds.includes(String(productId));
  const isFavoriteBusy = (productId) => favoritePending.includes(String(productId));

  async function toggleFavorite(favoriteProduct) {
    if (!user) {
      setToast("Entre como consumidor para adicionar favoritos.");
      go("login");
      return;
    }
    if (user.role !== "consumidor") {
      setToast("Somente consumidores podem adicionar favoritos.");
      return;
    }
    const id = String(favoriteProduct.id);
    if (favoritePending.includes(id)) return;
    setFavoritePending((ids) => [...ids, id]);
    try {
      const favorite = await toggleConsumerFavorite(favoriteProduct.id, isFavorite(id));
      setFavoriteIds((ids) => applyFavoriteState(ids, id, favorite));
      setToast(favorite
        ? `"${favoriteProduct.name}" adicionado aos favoritos.`
        : `"${favoriteProduct.name}" removido dos favoritos.`);
    } catch (error) {
      setToast(error.message);
    } finally {
      setFavoritePending((ids) => ids.filter((item) => item !== id));
    }
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
  const reviewStore = approved.find((s) => route === `consumidor/avaliar/${s.id}`);

  const onProduct = (p) => go(`produto/${p.id}`);
  const onStore = (id) => go(`loja/${id}`);
  const storeCard = (s) => <StoreCard key={s.id} store={s} data={data} onStore={onStore} />;

  // Lojista e admin não recebem as ações privadas de favorito do consumidor.
  const favoriteProps = user && user.role !== "consumidor"
    ? {}
    : { isFavorite, onToggleFavorite: toggleFavorite, isFavoriteBusy };

  const productFormRoute = route === "lojista/produtos/novo" || route.startsWith("lojista/produtos/editar/");
  const known =
    ["inicio", "explorar", "lojas", "login", "cadastro", "consumidor", "lojista", "lojista/produtos", "lojista/produtos/novo", "admin", "consumidor/favoritos", "consumidor/pontos", "consumidor/avaliacoes", "lojista/avaliacoes"].includes(route) ||
    productFormRoute ||
    Boolean(product) ||
    Boolean(store) ||
    Boolean(reviewStore);
  const restricted = !canAccessRoute(route, user);
  const nav = [
    ["inicio", "Início", House],
    ["explorar", "Produtos", LayoutGrid],
    ["lojas", "Lojas", Store],
  ];
  if (user?.role === "consumidor") nav.push(["consumidor", "Minha conta", User]);
  if (user?.role === "lojista") nav.push(["lojista", "Minha loja", Store]);
  if (user?.role === "admin") nav.push(["admin", "Administração", ShieldCheck]);

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <header><div className="header-inner">
      <a className="brand" href="#inicio">
        <span className="brand-symbol">
          <svg
            viewBox="0 0 32 32"
            width="27"
            height="27"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 25V12a5.5 5.5 0 0 1 11 0v13-13a5.5 5.5 0 0 1 11 0v13"
              stroke="currentColor"
              strokeWidth="3.5"
            />
            <path
              d="M3 26h26"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </span>
        mini<span>mall</span>
        <i />
      </a>
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
        {route === "explorar" && <Catalog data={data} filters={filters} setFilters={setFilters} onProduct={onProduct} onStore={onStore} {...favoriteProps} />}
        {route === "lojas" && <>
          <div className="page-title"><h1>Lojas</h1></div>
          {approved.length ? <div className="store-grid all-stores">{approved.map(storeCard)}</div> : <Empty title="Nenhuma loja encontrada" text="Ainda não há lojas com produtos publicados na vitrine." action={<button className="primary" onClick={() => go("explorar")}>Ver vitrine</button>} />}
        </>}
        {store && <StorePage store={store} data={data} onProduct={onProduct} onStore={onStore} go={go} user={user} onReview={(selectedStore) => go(`consumidor/avaliar/${selectedStore.id}`)} {...favoriteProps} />}
        {product && <ProductDetail product={product} store={approved.find((s) => String(s.id) === String(product.store))} go={go} {...(favoriteProps.onToggleFavorite ? { isFavorite: isFavorite(product.id), onToggleFavorite: toggleFavorite, favoriteBusy: isFavoriteBusy(product.id) } : {})} />}
        {["login", "cadastro"].includes(route) && <AuthPage key={route} mode={route} onSuccess={login} go={go} />}
        {route === "consumidor" && <ConsumerProfile user={user} onLogout={logout} onFavorites={() => go("consumidor/favoritos")} onPoints={() => go("consumidor/pontos")} onReviews={() => go("consumidor/avaliacoes")} />}
        {route === "consumidor/favoritos" && <ConsumerFavorites go={go} onFavoriteRemoved={(productId) => setFavoriteIds((ids) => applyFavoriteState(ids, productId, false))} />}
        {route === "consumidor/pontos" && <ConsumerPoints data={data} go={go} />}
        {route === "consumidor/avaliacoes" && <ConsumerReviews data={data} go={go} />}
        {reviewStore && <ReviewForm key={reviewStore.id} store={reviewStore} onCancel={() => go(`loja/${reviewStore.id}`)} onPublish={publishReview} />}
        {route === "lojista" && <StoreSettings user={user} go={go} notify={setToast} onStoreCreated={async () => {
          const session = await getCurrentSession();
          await syncSession(session);
        }} />}
        {route === "lojista/produtos" && <ProductList go={go} notify={setToast} />}
        {route === "lojista/avaliacoes" && <StoreReviews go={go} />}
        {productFormRoute && <ProductForm key={route} productId={route.startsWith("lojista/produtos/editar/") ? route.split("/")[3] : null} go={go} notify={setToast} />}
        {route === "admin" && <Admin notify={setToast} onCategoriesChange={() => setCatalogRevision((r) => r + 1)} />}
        {!known && !catalogLoading && <Empty title="Página não encontrada" text="Esta página não está disponível." action={<button className="primary" onClick={() => go("inicio")}>Voltar ao início</button>} />}
      </>}
    </main>
    <footer><a className="brand" href="#inicio">mini<span>mall</span><i /></a></footer>
    {toast && <div className="toast" role="status">{toast}<button aria-label="Fechar mensagem" onClick={() => setToast("")}><X size={16} /></button></div>}
  </>;
}
