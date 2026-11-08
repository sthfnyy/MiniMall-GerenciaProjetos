import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Image as ImageIcon, Pencil, Plus, Search, Store, Trash2 } from "lucide-react";
import { Empty, Modal, PageTitle } from "../../components/ui";
import { money, normalize } from "../../services/catalog";
import { deleteStoreProduct, fetchMerchantStore, getStoreProducts } from "../../services/merchant";
import MerchantNav from "./MerchantNav";

export default function ProductList({ go, notify }) {
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [viewProduct, setViewProduct] = useState(null);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    (async () => {
      const currentStore = await fetchMerchantStore();
      const list = currentStore ? await getStoreProducts() : [];
      if (active) { setStore(currentStore); setProducts(list); }
    })().catch((error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const categories = useMemo(() => [...new Set(products.map((product) => product.categoria_id))], [products]);
  const filteredProducts = products.filter((product) => {
    const query = normalize(search.trim());
    const matchesSearch = !query || normalize(product.titulo).includes(query) || normalize(product.descricao).includes(query);
    return matchesSearch && (!selectedCategory || product.categoria_id === selectedCategory);
  });

  async function handleConfirmDelete() {
    if (!deleteProduct || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteStoreProduct(deleteProduct.id);
      setProducts((current) => current.filter((product) => product.id !== deleteProduct.id));
      notify?.(`Produto "${deleteProduct.titulo}" excluído.`);
      setDeleteProduct(null);
    } catch (error) {
      setDeleteError(error.message || "Não foi possível excluir o produto.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="consumer-page merchant-page">
      <PageTitle eyebrow="PAINEL DO LOJISTA" title="Catálogo de Produtos" text="Acompanhe, consulte, edite e remova os itens da sua loja cadastrada no MiniMall." />
      <MerchantNav current="produtos" go={go} />

      {loading ? <p role="status">Carregando produtos…</p>
        : loadError ? <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{loadError}</span><button className="secondary" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button></div>
          : !store ? <div className="merchant-empty-notice"><Store size={32} /><div><h3>Cadastre sua loja primeiro</h3><p>Para gerenciar produtos, é necessário configurar sua loja.</p><button type="button" className="primary section-space" onClick={() => go("lojista")}>Configurar Loja</button></div></div>
            : <>
              <div className="merchant-products-toolbar">
                <div className="merchant-toolbar-filters">
                  <div className="merchant-search-box"><Search size={18} /><input placeholder="Pesquisar no catálogo..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Pesquisar produtos" /></div>
                  <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="merchant-category-select" aria-label="Filtrar por categoria">
                    <option value="">Todas as categorias</option>
                    {categories.map((id) => <option key={id} value={id}>Categoria {id.slice(0, 8)}</option>)}
                  </select>
                </div>
                <div className="merchant-toolbar-actions"><span className="merchant-count-badge">{products.length} {products.length === 1 ? "produto" : "produtos"}</span><button type="button" className="primary" onClick={() => go("lojista/produtos/novo")}><Plus size={16} />Cadastrar produto</button></div>
              </div>

              {filteredProducts.length === 0 ? <div className="panel empty-products-panel"><Empty
                title={products.length ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
                text={products.length ? "Tente outro termo ou remova o filtro." : "Cadastre o primeiro item da sua loja."}
                action={products.length ? <button className="secondary" onClick={() => { setSearch(""); setSelectedCategory(""); }}>Limpar filtros</button> : <button className="primary" onClick={() => go("lojista/produtos/novo")}><Plus size={16} />Cadastrar primeiro produto</button>}
              /></div> : <div className="merchant-products-grid">{filteredProducts.map((product) => <article key={product.id} className="merchant-product-card">
                <div className="merchant-card-media">{product.foto_principal_url ? <img src={product.foto_principal_url} alt={product.titulo} /> : <div className="product-upload-placeholder"><ImageIcon size={44} /><span>Sem imagem</span></div>}</div>
                <div className="merchant-card-info"><span className="merchant-card-category">Categoria {product.categoria_id.slice(0, 8)}</span><h3 className="merchant-card-title">{product.titulo}</h3><div className="merchant-card-pricing"><strong className="merchant-price">{money(product.preco_base)}</strong></div><span className={`status-badge ${product.ativo ? "approved" : "rejected"}`}>{product.ativo ? "Ativo" : "Inativo"}</span></div>
                <div className="merchant-card-actions">
                  <button type="button" className="icon-action-btn view-btn" aria-label={`Consultar ${product.titulo}`} onClick={() => setViewProduct(product)}><Eye size={17} /><span>Consultar</span></button>
                  <button type="button" className="icon-action-btn edit-btn" aria-label={`Editar ${product.titulo}`} onClick={() => go(`lojista/produtos/editar/${product.id}`)}><Pencil size={17} /><span>Editar</span></button>
                  <button type="button" className="icon-action-btn delete-btn" aria-label={`Excluir ${product.titulo}`} onClick={() => { setDeleteError(""); setDeleteProduct(product); }}><Trash2 size={17} /><span>Excluir</span></button>
                </div>
              </article>)}</div>}
            </>}

      {viewProduct && <Modal title="Detalhes do Produto" onClose={() => setViewProduct(null)} wide><div className="merchant-modal-detail">
        <div className="merchant-detail-image-wrap">{viewProduct.foto_principal_url ? <img src={viewProduct.foto_principal_url} alt={viewProduct.titulo} /> : <div className="product-upload-placeholder"><ImageIcon size={44} /><span>Sem imagem</span></div>}</div>
        <div className="merchant-detail-content"><span className="eyebrow muted">Categoria {viewProduct.categoria_id}</span><h2>{viewProduct.titulo}</h2><div className="merchant-detail-prices"><span className="detail-price-regular">{money(viewProduct.preco_base)}</span></div><div className="merchant-detail-section"><h4>Descrição</h4><p>{viewProduct.descricao || "Nenhuma descrição informada."}</p></div><div className="merchant-detail-footer-actions"><button className="secondary" onClick={() => setViewProduct(null)}>Fechar</button><button className="primary" onClick={() => go(`lojista/produtos/editar/${viewProduct.id}`)}><Pencil size={16} />Editar produto</button></div></div>
      </div></Modal>}

      {deleteProduct && <Modal title="Excluir produto?" onClose={() => { if (!deleting) setDeleteProduct(null); }}><div className="merchant-delete-confirm"><div className="delete-warning-icon"><AlertTriangle size={28} /></div><h3>Excluir “{deleteProduct.titulo}”?</h3><p>Esta ação removerá o produto definitivamente.</p>{deleteError && <p className="error" role="alert">{deleteError}</p>}<div className="consumer-form-actions section-space"><button className="secondary" disabled={deleting} onClick={() => setDeleteProduct(null)}>Cancelar</button><button className="primary delete-confirm-btn" disabled={deleting} onClick={handleConfirmDelete}><Trash2 size={16} />{deleting ? "Excluindo…" : "Sim, excluir produto"}</button></div></div></Modal>}
    </section>
  );
}
