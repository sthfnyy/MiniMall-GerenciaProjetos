import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Image as ImageIcon, Save, Store } from "lucide-react";
import { Field, PageTitle } from "../../components/ui";
import {
  createStoreProduct,
  fetchMerchantStore,
  fetchProductCategories,
  getStoreProduct,
  updateStoreProduct,
} from "../../services/merchant";

const emptyProduct = {
  categoria_id: "", titulo: "", descricao: "", preco_base: "",
  foto_principal_url: "", ativo: true,
};

export default function ProductForm({ productId, go, notify }) {
  const isEdit = Boolean(productId);
  const [store, setStore] = useState(null);
  const [values, setValues] = useState(emptyProduct);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setCategoryError("");
    (async () => {
      const [storeResult, productResult, categoryResult] = await Promise.allSettled([
        fetchMerchantStore(),
        isEdit ? getStoreProduct(productId) : Promise.resolve(null),
        fetchProductCategories(),
      ]);
      if (!active) return;
      if (storeResult.status === "rejected") throw storeResult.reason;
      if (productResult.status === "rejected") throw productResult.reason;
      setStore(storeResult.value);
      setCategories(categoryResult.status === "fulfilled" ? categoryResult.value : []);
      if (categoryResult.status === "rejected") setCategoryError(categoryResult.reason.message);
      const product = productResult.value;
      setValues(product ? {
        categoria_id: product.categoria_id,
        titulo: product.titulo,
        descricao: product.descricao || "",
        preco_base: String(product.preco_base),
        foto_principal_url: product.foto_principal_url || "",
        ativo: product.ativo,
      } : { ...emptyProduct });
    })().catch((err) => { if (active) setLoadError(err.message || "Erro ao carregar o formulário."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isEdit, productId, revision]);

  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || !categories.length) return;
    setSaving(true);
    setError("");
    try {
      const saved = isEdit
        ? await updateStoreProduct(productId, values)
        : await createStoreProduct(values);
      notify?.(`Produto "${saved.titulo}" ${isEdit ? "atualizado" : "cadastrado"} com sucesso!`);
      go("lojista/produtos");
    } catch (err) {
      setError(err.message || "Erro ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="consumer-page merchant-page"><p role="status">Carregando formulário…</p></section>;

  if (loadError) return <section className="consumer-page merchant-page"><button type="button" className="back-link" onClick={() => go("lojista/produtos")}><ArrowLeft size={16} />Voltar para Meus Produtos</button><div className="error-banner section-space" role="alert"><AlertTriangle size={18} /><span>{loadError}</span><button className="secondary" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button></div></section>;

  if (!store) return <section className="consumer-page merchant-page"><div className="merchant-empty-notice"><Store size={32} /><div><h3>Cadastre sua loja primeiro</h3><p>Para cadastrar e editar produtos, sua loja precisa estar configurada.</p><button type="button" className="primary section-space" onClick={() => go("lojista")}>Configurar Loja</button></div></div></section>;

  return (
    <section className="consumer-page merchant-page">
      <button type="button" className="back-link" onClick={() => go("lojista/produtos")}><ArrowLeft size={16} />Voltar para Meus Produtos</button>
      <PageTitle eyebrow="PAINEL DO LOJISTA" title={isEdit ? `Editar Produto: ${values.titulo}` : "Cadastrar Novo Produto"} text={isEdit ? "Atualize as informações do produto." : "Preencha os detalhes para adicionar um novo item à sua loja."} />
      <div className="consumer-profile-card merchant-form-card"><form onSubmit={handleSubmit} className="merchant-form"><fieldset disabled={saving}>
        <div className="merchant-form-section"><h3>Foto do Produto</h3><p className="muted">Informe o link público de uma imagem do produto.</p>
          <div className="product-upload-container"><div className="product-upload-preview">{values.foto_principal_url ? <img src={values.foto_principal_url} alt="Pré-visualização do produto" /> : <div className="product-upload-placeholder"><ImageIcon size={44} /><span>Sem imagem informada</span></div>}</div>
            <div className="product-upload-controls"><Field label="URL da imagem"><input type="url" value={values.foto_principal_url} onChange={(event) => set("foto_principal_url", event.target.value)} placeholder="https://…" className="product-url-input" /></Field><p className="upload-help-text">O backend atual aceita URL pública; upload de arquivo não faz parte deste contrato.</p></div>
          </div>
        </div>

        <div className="merchant-form-section"><h3>Informações do Produto</h3><p className="muted">Nome, categoria e descrição principal.</p>
          <div className="merchant-grid">
            <Field label="Nome do produto *"><input required minLength={2} maxLength={180} value={values.titulo} onChange={(event) => set("titulo", event.target.value)} /></Field>
            <Field label="Categoria *"><select required value={values.categoria_id} onChange={(event) => set("categoria_id", event.target.value)} disabled={!categories.length}><option value="">Selecione uma categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select></Field>
          </div>
          {categoryError && <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{categoryError} O produto não pode ser salvo até que o backend ofereça a leitura de categorias.</span></div>}
          <Field label="Descrição detalhada"><textarea rows={4} value={values.descricao} onChange={(event) => set("descricao", event.target.value)} /></Field>
        </div>

        <div className="merchant-form-section"><h3>Preço e Situação</h3><p className="muted">Configure o valor regular e a disponibilidade do produto.</p><div className="merchant-grid">
          <Field label="Preço de venda (R$) *"><input type="number" step="0.01" min="0" max="99999999.99" required value={values.preco_base} onChange={(event) => set("preco_base", event.target.value)} /></Field>
          <Field label="Situação"><select value={String(values.ativo)} onChange={(event) => set("ativo", event.target.value === "true")}><option value="true">Ativo</option><option value="false">Inativo</option></select></Field>
        </div></div>

        {error && <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
        <div className="consumer-form-actions merchant-actions"><button type="button" className="secondary" onClick={() => go("lojista/produtos")} disabled={saving}>Cancelar</button><button type="submit" className="primary" disabled={saving || !categories.length}><Save size={16} />{saving ? "Salvando…" : isEdit ? "Salvar alterações" : "Cadastrar produto"}</button></div>
      </fieldset></form></div>
    </section>
  );
}
