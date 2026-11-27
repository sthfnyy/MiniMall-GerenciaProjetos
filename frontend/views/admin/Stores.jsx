import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Field, Modal } from "../../components/ui";
import {
  STORE_STATUS_LABELS,
  approveAdminStore,
  getAdminStores,
  rejectAdminStore,
  rejectionReason,
} from "../../services/admin";

const FILTERS = [
  ["pendente", "Pendentes"],
  ["aprovada", "Aprovadas"],
  ["rejeitada", "Rejeitadas"],
  ["", "Todas"],
];

const BADGE = { pendente: "pending", aprovada: "approved", rejeitada: "rejected" };

function address(store) {
  return [
    [store.endereco_logradouro, store.endereco_numero].filter(Boolean).join(", "),
    store.endereco_bairro,
    `${store.endereco_cidade} – ${store.endereco_uf}`,
  ].filter(Boolean).join(" · ");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}

export default function Stores({ notify, onStoresChange }) {
  const [filter, setFilter] = useState("pendente");
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStores(await getAdminStores(filter));
    } catch (err) {
      setError(err.message || "Não foi possível carregar as lojas.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  function openAction(type, store) {
    setAction({ type, store });
    setReason("");
    setActionError("");
  }

  async function confirmAction(event) {
    event?.preventDefault();
    if (!action || processing) return;
    setActionError("");
    let motivo = "";
    if (action.type === "reject") {
      try {
        motivo = rejectionReason(reason);
      } catch (validationError) {
        setActionError(validationError.message);
        return;
      }
    }
    setProcessing(true);
    try {
      if (action.type === "approve") await approveAdminStore(action.store.id);
      else await rejectAdminStore(action.store.id, motivo);
      notify?.(action.type === "approve"
        ? `Loja "${action.store.nome_loja}" aprovada. Ela já pode aparecer na vitrine.`
        : `Loja "${action.store.nome_loja}" rejeitada.`);
      setAction(null);
      onStoresChange?.();
      await load();
    } catch (err) {
      setActionError(err.message || "Não foi possível concluir a ação.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="admin-section-head">
          <h2>Cadastros de lojas</h2>
          <div className="admin-filter" role="group" aria-label="Filtrar lojas por status">
            {FILTERS.map(([value, label]) => (
              <button
                key={value || "todas"}
                type="button"
                className={filter === value ? "active" : ""}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p role="status">Carregando lojas...</p>}
        {!loading && error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={18} /><span>{error}</span>
            <button type="button" className="secondary" onClick={load}><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        )}
        {!loading && !error && stores.length === 0 && (
          <p className="muted">
            {filter === "pendente" ? "Nenhuma loja aguardando aprovação." : "Nenhuma loja encontrada neste filtro."}
          </p>
        )}

        {!loading && !error && stores.map((store) => (
          <article className="admin-row admin-store-row" key={store.id}>
            <div className="admin-store-info">
              <div className="admin-store-title">
                <strong>{store.nome_loja}</strong>
                <span className={`status-badge ${BADGE[store.status] || "pending"}`}>{STORE_STATUS_LABELS[store.status] || store.status}</span>
              </div>
              <small>Lojista: {store.lojista_nome || "—"}{store.lojista_email ? ` · ${store.lojista_email}` : ""}</small>
              <small>{address(store)}</small>
              <small>WhatsApp: {store.whatsapp} · Produtos: {store.total_produtos} · Cadastro: {formatDate(store.criado_em)}</small>
              {store.descricao && <p>{store.descricao}</p>}
              {store.status === "rejeitada" && store.motivo_rejeicao && (
                <p className="admin-store-reason"><strong>Motivo da rejeição:</strong> {store.motivo_rejeicao}</p>
              )}
            </div>
            <div className="moderation-actions">
              {store.status !== "aprovada" && (
                <button type="button" className="primary" disabled={processing} onClick={() => openAction("approve", store)}>
                  <CheckCircle2 size={16} /> Aprovar
                </button>
              )}
              {store.status !== "rejeitada" && (
                <button type="button" className="text-button danger" disabled={processing} onClick={() => openAction("reject", store)}>
                  <XCircle size={16} /> Rejeitar
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      {action && (
        <Modal
          title={action.type === "approve" ? "Aprovar loja" : "Rejeitar loja"}
          onClose={() => setAction(null)}
          busy={processing}
        >
          <form onSubmit={confirmAction}>
            <p>
              {action.type === "approve"
                ? `Aprovar "${action.store.nome_loja}"? Os produtos ativos da loja passarão a aparecer na vitrine.`
                : `Rejeitar "${action.store.nome_loja}"? O lojista verá o motivo e poderá solicitar nova análise.`}
            </p>
            {action.type === "reject" && (
              <Field label="Motivo da rejeição *">
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ex.: endereço incompleto ou WhatsApp inválido."
                />
              </Field>
            )}
            {actionError && <p className="error" role="alert">{actionError}</p>}
            <div className="modal-actions">
              <button className="outline" type="button" disabled={processing} onClick={() => setAction(null)}>Cancelar</button>
              <button className={action.type === "approve" ? "primary" : "primary red"} type="submit" disabled={processing}>
                {processing ? "Processando..." : action.type === "approve" ? "Aprovar loja" : "Rejeitar loja"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
