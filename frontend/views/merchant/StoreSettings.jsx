import React, { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock3, RotateCcw, Save, Send, Store,
} from "lucide-react";
import { Field, PageTitle } from "../../components/ui";
import StoreIdentity from "../../components/StoreIdentity";
import {
  createMerchantStore, fetchMerchantStore, requestStoreApproval, updateMerchantStore,
} from "../../services/merchant";
import MerchantNav from "./MerchantNav";

const emptyStore = {
  nome_loja: "", descricao: "", endereco_logradouro: "", endereco_numero: "",
  endereco_bairro: "", endereco_cidade: "", endereco_uf: "", endereco_cep: "",
  whatsapp: "", instagram: "", facebook: "", logo_url: "",
  horario_funcionamento: null,
};

function formValues(store) {
  if (!store) return { ...emptyStore };
  return {
    ...emptyStore,
    nome_loja: store.nome_loja || store.name || "",
    descricao: store.descricao || store.description || "",
    endereco_logradouro: store.endereco_logradouro || "",
    endereco_numero: store.endereco_numero || "",
    endereco_bairro: store.endereco_bairro || "",
    endereco_cidade: store.endereco_cidade || "",
    endereco_uf: store.endereco_uf || "",
    endereco_cep: store.endereco_cep || "",
    whatsapp: store.whatsapp || "",
    instagram: store.instagram || "",
    facebook: store.facebook || "",
    logo_url: store.logo_url || "",
    horario_funcionamento: store.horario_funcionamento || (store.hours ? { descricao: store.hours } : null),
  };
}

export default function StoreSettings({
  user, go, notify, onStoreCreated,
  fetchStoreFn = fetchMerchantStore,
  createStoreFn = createMerchantStore,
  updateStoreFn = updateMerchantStore,
  requestApprovalFn = requestStoreApproval,
}) {
  const [store, setStore] = useState(null);
  const [values, setValues] = useState(emptyStore);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    if (user?.role !== "lojista") {
      setStore(null);
      setValues({ ...emptyStore });
      setLoading(false);
      setLoadError("");
      return () => { active = false; };
    }
    setLoading(true);
    setLoadError("");
    fetchStoreFn()
      .then((result) => {
        if (!active) return;
        setStore(result);
        setValues(formValues(result));
      })
      .catch((err) => { if (active) setLoadError(err.message || "Erro ao carregar os dados da loja."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchStoreFn, revision, user?.role]);

  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  function handleReset() {
    setValues(formValues(store));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const isNew = !store;
    try {
      const saved = isNew ? await createStoreFn(values) : await updateStoreFn(values);
      setStore(saved);
      setValues(formValues(saved));
      if (isNew) await onStoreCreated?.();
      notify?.(isNew
        ? "Loja cadastrada com sucesso! Ela foi enviada para análise."
        : "Dados da loja atualizados com sucesso!");
    } catch (err) {
      setError(err.message || "Erro ao salvar as configurações da loja.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestApproval() {
    if (requestingApproval) return;
    setRequestingApproval(true);
    setError("");
    try {
      const updated = await requestApprovalFn();
      setStore(updated);
      setValues(formValues(updated));
      notify?.("Solicitação de aprovação enviada com sucesso!");
    } catch (err) {
      setError(err.message || "Erro ao solicitar aprovação da loja.");
    } finally {
      setRequestingApproval(false);
    }
  }

  const isApproved = store?.status === "aprovada";
  const isPending = store?.status === "pendente";
  const isRejected = store?.status === "rejeitada";
  const disabled = saving || requestingApproval;

  return (
    <section className="consumer-page merchant-page">
      <PageTitle eyebrow="PAINEL DO LOJISTA" title="Configuração da Loja" text="Cadastre e mantenha atualizadas as informações da sua loja para os clientes no MiniMall." />
      <MerchantNav current="configuracao" go={go} />

      {loading ? <div className="merchant-loading-state" role="status"><p>Carregando dados da loja…</p></div>
        : loadError ? <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{loadError}</span><button className="secondary" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button></div>
          : <>
            {store ? <div className="merchant-status-banner">
              <div className="merchant-identity-preview"><StoreIdentity store={store} /><div>
                <div className="merchant-title-row"><h2>{store.name}</h2>
                  {isApproved && <span className="status-badge approved"><CheckCircle2 size={14} />Aprovada</span>}
                  {isPending && <span className="status-badge pending"><Clock3 size={14} />Pendente de aprovação</span>}
                  {isRejected && <span className="status-badge rejected"><AlertTriangle size={14} />Rejeitada</span>}
                </div>
                <p className="muted merchant-status-desc">
                  {isApproved && "Sua loja está aprovada no MiniMall."}
                  {isPending && "Seu cadastro está aguardando aprovação da administração."}
                  {isRejected && (store.motivo_rejeicao ? `Motivo: ${store.motivo_rejeicao}` : "Sua loja precisa de revisões.")}
                </p>
              </div></div>
              {isRejected && <button type="button" className="primary merchant-approval-btn" onClick={handleRequestApproval} disabled={disabled}><Send size={16} />{requestingApproval ? "Solicitando…" : "Solicitar aprovação"}</button>}
            </div> : <div className="merchant-empty-notice"><Store size={32} /><div><h3>Cadastre sua loja</h3><p>Preencha os campos abaixo para registrar seu estabelecimento no MiniMall.</p></div></div>}

            <div className="consumer-profile-card merchant-form-card"><form onSubmit={handleSubmit} className="merchant-form"><fieldset disabled={disabled}>
              <div className="merchant-form-section"><h3>Informações Básicas</h3><p className="muted">Esses dados identificam sua loja.</p>
                <Field label="Nome da loja *"><input required minLength={2} maxLength={150} value={values.nome_loja} onChange={(e) => set("nome_loja", e.target.value)} /></Field>
                <Field label="Descrição da loja"><textarea rows={3} value={values.descricao} onChange={(e) => set("descricao", e.target.value)} /></Field>
                <div className="merchant-grid">
                  <Field label="URL do logo"><input type="url" placeholder="https://…" value={values.logo_url} onChange={(e) => set("logo_url", e.target.value)} /></Field>
                  <Field label="Horário de funcionamento"><input value={values.horario_funcionamento?.descricao || ""} onChange={(e) => set("horario_funcionamento", e.target.value ? { descricao: e.target.value } : null)} /></Field>
                </div>
              </div>

              <div className="merchant-form-section"><h3>Contato e Localização</h3><p className="muted">Canais e endereço do estabelecimento.</p>
                <div className="merchant-grid">
                  <Field label="WhatsApp *"><input type="tel" required value={values.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></Field>
                  <Field label="Instagram"><input value={values.instagram} onChange={(e) => set("instagram", e.target.value)} /></Field>
                  <Field label="Facebook"><input value={values.facebook} onChange={(e) => set("facebook", e.target.value)} /></Field>
                  <Field label="CEP"><input inputMode="numeric" value={values.endereco_cep} onChange={(e) => set("endereco_cep", e.target.value)} /></Field>
                  <Field label="Rua / Avenida *"><input required value={values.endereco_logradouro} onChange={(e) => set("endereco_logradouro", e.target.value)} /></Field>
                  <Field label="Número"><input value={values.endereco_numero} onChange={(e) => set("endereco_numero", e.target.value)} /></Field>
                  <Field label="Bairro"><input value={values.endereco_bairro} onChange={(e) => set("endereco_bairro", e.target.value)} /></Field>
                  <Field label="Cidade *"><input required value={values.endereco_cidade} onChange={(e) => set("endereco_cidade", e.target.value)} /></Field>
                  <Field label="UF *"><input required minLength={2} maxLength={2} value={values.endereco_uf} onChange={(e) => set("endereco_uf", e.target.value.toUpperCase())} /></Field>
                </div>
              </div>

              {error && <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
              <div className="consumer-form-actions merchant-actions">
                <button type="button" className="secondary" onClick={handleReset}><RotateCcw size={16} />Descartar alterações</button>
                <button type="submit" className="primary"><Save size={16} />{saving ? "Salvando…" : store ? "Salvar alterações" : "Cadastrar loja"}</button>
              </div>
            </fieldset></form></div>
          </>}
    </section>
  );
}
