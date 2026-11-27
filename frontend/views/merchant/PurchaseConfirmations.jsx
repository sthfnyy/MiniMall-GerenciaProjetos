import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShoppingBag, XCircle } from "lucide-react";
import { Empty, Modal, PageTitle } from "../../components/ui";
import {
  decideMerchantPurchase,
  fetchMerchantPurchases,
  purchaseStatusInfo,
  updatePurchaseInList,
} from "../../services/purchases";
import MerchantNav from "./MerchantNav";

export default function PurchaseConfirmations({
  go,
  notify,
  fetchFn = fetchMerchantPurchases,
  decideFn = decideMerchantPurchase,
}) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [decision, setDecision] = useState(null);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPurchases(await fetchFn());
    } catch (err) {
      setError(err.status === 404
        ? "Cadastre sua loja para receber solicitações de confirmação de compra."
        : err.message || "Não foi possível carregar as solicitações.");
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => { load(); }, [load]);

  async function confirmDecision() {
    if (!decision || deciding) return;
    setDeciding(true);
    setDecisionError("");
    try {
      const updated = await decideFn(decision.purchase.id, decision.status);
      setPurchases((current) => updatePurchaseInList(current, updated));
      notify?.(decision.status === "compra_confirmada"
        ? "Compra confirmada. O consumidor já pode avaliar sua loja."
        : "Compra marcada como não reconhecida.");
      setDecision(null);
    } catch (err) {
      setDecisionError(err.message || "Não foi possível registrar a decisão.");
    } finally {
      setDeciding(false);
    }
  }

  const pendingCount = purchases.filter((item) => item.status === "contato_realizado").length;
  const visible = onlyPending ? purchases.filter((item) => item.status === "contato_realizado") : purchases;

  return (
    <section className="consumer-page merchant-page">
      <PageTitle
        eyebrow="PAINEL DO LOJISTA"
        title="Confirmações de compra"
        text="Confirme as compras realizadas na sua loja. Só consumidores com compra confirmada podem avaliá-la."
      />
      <MerchantNav current="compras" go={go} />

      <div className="purchase-toolbar" role="group" aria-label="Filtrar solicitações">
        <button type="button" className={onlyPending ? "active" : ""} aria-pressed={onlyPending} onClick={() => setOnlyPending(true)}>
          Pendentes ({pendingCount})
        </button>
        <button type="button" className={!onlyPending ? "active" : ""} aria-pressed={!onlyPending} onClick={() => setOnlyPending(false)}>
          Todas ({purchases.length})
        </button>
      </div>

      {loading ? (
        <div className="panel" role="status"><p>Carregando solicitações...</p></div>
      ) : error ? (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} /><span>{error}</span>
          <button className="secondary" type="button" onClick={load}><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <Empty
            title={onlyPending ? "Nenhuma solicitação pendente" : "Nenhuma solicitação recebida"}
            text="Quando um consumidor informar que comprou um produto da sua loja, a solicitação aparecerá aqui."
          />
        </div>
      ) : (
        <div className="purchase-list">
          {visible.map((purchase) => {
            const info = purchaseStatusInfo(purchase.status);
            const pending = purchase.status === "contato_realizado";
            return (
              <article className="panel purchase-card" key={purchase.id}>
                <div className="purchase-card-main">
                  <span className="eyebrow muted">Código {purchase.codigo}</span>
                  <h3>{purchase.produto?.titulo}</h3>
                  <p>Consumidor: <strong>{purchase.consumidor?.nome}</strong></p>
                  <small>Solicitada em {new Date(purchase.criado_em).toLocaleString("pt-BR")}</small>
                </div>
                <span className={`status-badge ${info.badge}`}>{info.label}</span>
                {pending && (
                  <div className="purchase-card-actions">
                    <button className="primary" type="button" disabled={deciding} onClick={() => { setDecisionError(""); setDecision({ purchase, status: "compra_confirmada" }); }}>
                      <CheckCircle2 size={16} /> Confirmar compra
                    </button>
                    <button className="secondary" type="button" disabled={deciding} onClick={() => { setDecisionError(""); setDecision({ purchase, status: "compra_nao_reconhecida" }); }}>
                      <XCircle size={16} /> Não reconheço
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {decision && (
        <Modal title="Confirmar decisão" onClose={() => setDecision(null)} busy={deciding}>
          <p>
            {decision.status === "compra_confirmada"
              ? `Confirmar que ${decision.purchase.consumidor?.nome} comprou "${decision.purchase.produto?.titulo}"? A pessoa poderá avaliar sua loja.`
              : `Informar que não reconhece a compra de "${decision.purchase.produto?.titulo}"? A pessoa não poderá avaliar sua loja com esta solicitação.`}
          </p>
          <p className="muted">Esta decisão é definitiva.</p>
          {decisionError && <p className="error" role="alert">{decisionError}</p>}
          <div className="modal-actions">
            <button className="outline" type="button" disabled={deciding} onClick={() => setDecision(null)}>Cancelar</button>
            <button className={decision.status === "compra_confirmada" ? "primary" : "primary red"} type="button" disabled={deciding} onClick={confirmDecision}>
              <ShoppingBag size={16} /> {deciding ? "Salvando..." : "Confirmar decisão"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
