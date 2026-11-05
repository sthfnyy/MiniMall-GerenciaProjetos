import React, { useCallback, useEffect, useRef, useState } from 'react';
import { House, Store, LayoutGrid, LogOut, ShieldCheck, User, X, MessageCircle, ArrowRight } from 'lucide-react';
import Home from './views/Home';
import Catalog from './views/Catalog';
import StorePage from './views/StorePage';
import ProductDetail from './views/ProductDetail';
import AuthPage from './views/AuthPage';
import StoreSettings from './views/merchant/StoreSettings';
import ProductList from './views/merchant/ProductList';
import ProductForm from './views/merchant/ProductForm';
import Admin from './views/admin/Admin';
import StoreCard from './components/StoreCard';
import { Empty, Modal } from './components/ui';
import { seed, money, price } from './services/catalog';
import { whatsappLink } from './services/contact';
import { getCurrentSession, getAuthenticatedProfile, observeAuthChanges, signOut, roleHome, canAccessRoute } from './services/auth';

const emptyFilters = { query: '', category: '', store: '', min: '', max: '', sort: 'relevancia' };
export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || 'inicio');
  const [data, setData] = useState(() => structuredClone(seed));
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [toast, setToast] = useState('');
  const [contact, setContact] = useState(null);
  const authRevision = useRef(0);
  const go = path => { location.hash = path; };
  const syncSession = useCallback(async session => {
    const revision = ++authRevision.current;
    setLoadingAuth(true); setAuthError(''); setUser(null);
    try {
      if (session?.access_token) {
        const profile = await getAuthenticatedProfile(session.access_token);
        if (revision === authRevision.current) {
          const next = { id: profile.id, name: profile.nome_completo, email: session.user?.email, role: profile.role };
          setUser(next);
          return next;
        }
      }
    } catch (error) {
      if (revision === authRevision.current) setAuthError(error.message);
      throw error;
    } finally { if (revision === authRevision.current) setLoadingAuth(false); }
    return null;
  }, []);
  useEffect(() => {
    let active = true;
    const stop = observeAuthChanges(session => { if (active) void syncSession(session).catch(() => {}); });
    getCurrentSession().then(session => { if (active) return syncSession(session); }).catch(error => {
      if (active) { setAuthError(error.message); setLoadingAuth(false); }
    });
    return () => { active = false; authRevision.current++; stop(); };
  }, [syncSession]);
  useEffect(() => {
    const change = () => { setRoute(location.hash.slice(1) || 'inicio'); setContact(null); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  async function login(session) {
    const profile = await syncSession(session);
    if (profile) { go(roleHome(profile.role)); setToast('Você entrou na conta.'); }
  }
  async function logout() {
    try { await signOut(); await syncSession(null); setContact(null); go('inicio'); setToast('Você saiu da conta.'); }
    catch (error) { setToast(error.message); }
  }
  const update = fn => setData(prev => fn(structuredClone(prev)));
  const approved = data.stores.filter(s => s.status === 'aprovada');
  const products = data.products.filter(p => !p.deleted && approved.some(s => s.id === p.store));
  const product = products.find(p => route === `produto/${p.id}`);
  const store = approved.find(s => route === `loja/${s.id}`);
  const onProduct = p => go(`produto/${p.id}`);
  const onStore = id => go(`loja/${id}`);
  const storeCard = s => <StoreCard key={s.id} store={s} data={data} onStore={onStore} />;
  const currentStore = contact && data.stores.find(s => s.id === contact.store);
  const message = contact ? `Olá! Tenho interesse em ${contact.name} (${money(price(contact))}). ${location.origin}${location.pathname}#produto/${contact.id}` : '';
  const nav = [['inicio', 'Início', House], ['explorar', 'Produtos', LayoutGrid], ['lojas', 'Lojas', Store]];
  if (user) nav.push([roleHome(user.role), user.role === 'admin' ? 'Administração' : user.role === 'lojista' ? 'Minha loja' : 'Minha conta', user.role === 'admin' ? ShieldCheck : User]);
  const known = ['inicio', 'explorar', 'lojas', 'login', 'cadastro', 'conta', 'lojista', 'lojista/produtos', 'lojista/produtos/novo', 'admin'].includes(route) || route.startsWith('lojista/produtos/editar/') || product || store;
  const restricted = !canAccessRoute(route, user);
  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content').focus(); }}>Pular para o conteúdo</a>
    <header><div className="header-inner">
      <a className="brand" href="#inicio">mini<span>mall</span><i /></a>
      <form className="header-search" role="search" onSubmit={event => { event.preventDefault(); go('explorar'); }}>
        <input aria-label="Pesquisar produtos" placeholder="O que você procura?" value={filters.query} onChange={event => setFilters(f => ({ ...f, query: event.target.value }))} />
        <button className="search-submit" aria-label="Pesquisar"><ArrowRight size={18} /></button>
      </form>
      {loadingAuth ? <span role="status">Verificando sessão…</span> : user ? <div className="row account-status"><span>{user.name}</span><button className="icon-button" aria-label="Sair" onClick={logout}><LogOut size={18} /></button></div> : <button className="account-button" onClick={() => go('login')}>Entrar</button>}
    </div></header>
    <nav className="nav-bar" aria-label="Navegação principal"><div className="nav-inner"><div>{nav.map(([path, label, Icon]) => <button key={path} aria-current={route === path ? 'page' : undefined} className={route === path ? 'active' : ''} onClick={() => go(path)}><Icon size={16} />{label}</button>)}</div></div></nav>
    <main id="main-content" tabIndex={-1} className={route === 'inicio' ? 'home-main' : ''}>
      {authError && <div className="error" role="alert">{authError} <button className="text-button" onClick={() => getCurrentSession().then(syncSession).catch(() => {})}>Tentar novamente</button></div>}
      {restricted ? loadingAuth ? <p role="status">Verificando acesso…</p> : <Empty title="Acesso restrito" text="Entre com uma conta autorizada para acessar esta página." action={<button className="primary" onClick={() => go('login')}>Entrar</button>} /> : <>
        {route === 'inicio' && <Home products={products} stores={approved} onProduct={onProduct} onExplore={category => { setFilters({ ...emptyFilters, category: category || '' }); go('explorar'); }} onStores={() => go('lojas')} storeCard={storeCard} />}
        {route === 'explorar' && <Catalog data={data} filters={filters} setFilters={setFilters} onProduct={onProduct} onStore={onStore} isFavorite={() => false} />}
        {route === 'lojas' && <><div className="page-title"><h1>Lojas</h1></div><div className="store-grid all-stores">{approved.map(storeCard)}</div>{!approved.length && <Empty title="Nenhuma loja publicada" text="As lojas aprovadas aparecerão aqui." />}</>}
        {store && <StorePage store={store} data={data} onProduct={onProduct} onStore={onStore} go={go} />}
        {product && <ProductDetail product={product} store={data.stores.find(s => s.id === product.store)} go={go} contact={() => setContact(product)} />}
        {['login', 'cadastro'].includes(route) && <AuthPage key={route} mode={route} onSuccess={login} go={go} />}
        {route === 'conta' && <section className="panel"><h1>Minha conta</h1><p>{user.name}</p><p>{user.email}</p><button className="primary" onClick={() => go('lojista')}>Cadastrar minha loja</button></section>}
        {route === 'lojista' && <StoreSettings user={user} data={data} go={go} notify={setToast} onSaveStore={async saved => { update(d => { d.stores = [...d.stores.filter(s => s.id !== saved.id), saved]; return d; }); if (user.role !== 'lojista') await getCurrentSession().then(syncSession).catch(error => setToast(error.message)); }} />}
        {route === 'lojista/produtos' && <ProductList user={user} data={data} update={update} go={go} notify={setToast} />}
        {(route === 'lojista/produtos/novo' || route.startsWith('lojista/produtos/editar/')) && <ProductForm key={route} user={user} data={data} productId={route.split('/')[3] || null} go={go} update={update} notify={setToast} />}
        {route === 'admin' && <Admin data={data} update={update} notify={setToast} />}
        {!known && <Empty title="Página não encontrada" text="O produto ou a loja não está disponível." action={<button className="primary" onClick={() => go('explorar')}>Ver produtos</button>} />}
      </>}
    </main>
    <footer><a className="brand" href="#inicio">mini<span>mall</span><i /></a></footer>
    {toast && <div className="toast" role="status">{toast}<button aria-label="Fechar mensagem" onClick={() => setToast('')}><X size={16} /></button></div>}
    {contact && <Modal title="Contato com a loja" onClose={() => setContact(null)}><div className="message-preview">{message}</div>{whatsappLink(currentStore?.whatsapp, message) ? <a className="primary full whatsapp" href={whatsappLink(currentStore.whatsapp, message)} target="_blank" rel="noreferrer"><MessageCircle size={18} />Abrir WhatsApp</a> : <p>Esta loja ainda não informou um WhatsApp válido.</p>}</Modal>}
  </>;
}
