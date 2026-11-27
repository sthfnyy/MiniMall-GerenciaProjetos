import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Star } from "lucide-react";
import { Empty } from "../../components/ui";
import { fetchConsumerPurchases, purchaseStatusInfo } from "../../services/purchases";
import { listConsumerReviews } from "../../services/reviews";

export default function ConsumerPurchases({ go, fetchFn = fetchConsumerPurchases, listReviewsFn = listConsumerReviews }) {
  const [purchases, setPurchases] = useState([]);
  const [reviewedStoreIds, setReviewedStoreIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, reviews] = await Promise.all([fetchFn(), listReviewsFn().catch(() => [])]);
      setPurchases(list);
      setReviewedStoreIds(reviews.map((review) => String(review.loja_id)));
    } catch (err) {
      setError(err.message || "Não foi possível carregar suas compras.");
    } finally {
      setLoading(false);
    }
  }, [fetchFn, listReviewsFn]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="consumer-page">
      <button className="back-link" type="button" onClick={() => go("consumidor")}>← Voltar ao perfil</button>
      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Minhas compras</h1>
        <p>Acompanhe as confirmações de compra. Com a compra confirmada pela loja, você pode avaliá-la.</p>
      </div>

      {loading ? (
        <div className="panel" role="status"><p>Carregando suas compras...</p></div>
      ) : error ? (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} /><span>{error}</span>
          <button className="secondary" type="button" onClick={load}><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : purchases.length === 0 ? (
        <div className="panel">
          <Empty
            title="Nenhuma compra registrada"
            text="Na página de um produto que você comprou, use “Já comprei este produto” para pedir a confirmação da loja."
            action={<button className="primary" type="button" onClick={() => go("explorar")}>Ver produtos</button>}
          />
        </div>
      ) : (
        <div className="purchase-list">
          {purchases.map((purchase) => {
            const info = purchaseStatusInfo(purchase.status);
            const confirmed = purchase.status === "compra_confirmada";
            const reviewed = reviewedStoreIds.includes(String(purchase.loja?.id));
            return (
              <article className="panel purchase-card" key={purchase.id}>
                <div className="purchase-card-main">
                  <span className="eyebrow muted">Código {purchase.codigo}</span>
                  <h3>{purchase.produto?.titulo}</h3>
                  <p>
                    Loja:{" "}
                    <button type="button" className="text-button" onClick={() => go(`loja/${purchase.loja?.id}`)}>
                      {purchase.loja?.nome}
                    </button>
                  </p>
                  <small>{info.text} · Solicitada em {new Date(purchase.criado_em).toLocaleDateString("pt-BR")}</small>
                </div>
                <span className={`status-badge ${info.badge}`}>{info.label}</span>
                {confirmed && !reviewed && (
                  <div className="purchase-card-actions">
                    <button className="primary" type="button" onClick={() => go(`consumidor/avaliar/${purchase.loja?.id}`)}>
                      <Star size={16} /> Avaliar loja
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
