import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, ShoppingBag, Star, XCircle } from "lucide-react";
import {
  fetchConsumerPurchases,
  productPurchase,
  requestPurchaseConfirmation,
  storePurchaseState,
} from "../services/purchases";
import { listConsumerReviews } from "../services/reviews";

/**
 * Confirmação de compra antes da avaliação.
 *
 * - mode="product": botão "Já comprei este produto" na página do produto.
 * - mode="store": situação do consumidor na loja + seleção do produto comprado.
 *
 * A interface apenas orienta: quem decide é o backend, que recusa
 * POST /consumidor/avaliacoes sem compra confirmada.
 */
export default function PurchaseGate({
  mode = "store",
  user,
  storeId,
  storeName,
  product,
  products = [],
  go,
  notify,
  fetchPurchasesFn = fetchConsumerPurchases,
  listReviewsFn = listConsumerReviews,
  requestFn = requestPurchaseConfirmation,
}) {
  const isConsumer = user?.role === "consumidor";
  const [purchases, setPurchases] = useState([]);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(isConsumer);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState(product?.id ? String(product.id) : "");

  const load = useCallback(async () => {
    if (!isConsumer) return;
    setLoading(true);
    setError("");
    try {
      const [list, reviews] = await Promise.all([fetchPurchasesFn(), listReviewsFn().catch(() => [])]);
      setPurchases(list);
      setReviewed(reviews.some((review) => String(review.loja_id) === String(storeId)));
    } catch (err) {
      setError(err.message || "Não foi possível consultar suas compras.");
    } finally {
      setLoading(false);
    }
  }, [isConsumer, storeId, fetchPurchasesFn, listReviewsFn]);

  useEffect(() => { load(); }, [load]);

  if (!user) {
    return (
      <div className="purchase-gate" role="note">
        <ShoppingBag size={20} aria-hidden="true" />
        <div>
          <strong>Comprou {mode === "product" ? "este produto" : "nesta loja"}?</strong>
          <p>Entre como consumidor para solicitar a confirmação da compra e avaliar a loja.</p>
        </div>
        <button type="button" className="secondary" onClick={() => go("login")}>Entrar</button>
      </div>
    );
  }
  if (!isConsumer) return null;
  if (loading) return <div className="purchase-gate" role="status"><p>Verificando suas compras…</p></div>;

  const storeState = storePurchaseState(purchases, storeId);
  const ownProduct = product ? productPurchase(purchases, product.id) : null;

  async function request() {
    const productId = mode === "product" ? product?.id : selected;
    if (!productId) {
      setError("Selecione o produto que você comprou.");
      return;
    }
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const created = await requestFn(productId, storeId);
      setPurchases((current) => [created, ...current]);
      notify?.(`Solicitação enviada (código ${created.codigo}). Aguarde a confirmação da loja.`);
    } catch (err) {
      setError(err.message || "Não foi possível enviar a solicitação.");
      if (err.status === 409) load();
    } finally {
      setSending(false);
    }
  }

  if (storeState === "confirmed") {
    return (
      <div className="purchase-gate confirmed" role="status">
        <CheckCircle2 size={20} aria-hidden="true" />
        <div>
          <strong>Compra confirmada pela loja</strong>
          <p>{reviewed ? "Você já avaliou esta loja. Edite sua avaliação em Minhas avaliações." : "Você já pode avaliar esta loja."}</p>
        </div>
        {reviewed ? (
          <button type="button" className="secondary" onClick={() => go("consumidor/avaliacoes")}>Minhas avaliações</button>
        ) : (
          <button type="button" className="primary" onClick={() => go(`consumidor/avaliar/${storeId}`)}>
            <Star size={16} aria-hidden="true" /> Avaliar {storeName || "loja"}
          </button>
        )}
      </div>
    );
  }

  const pendingHere = mode === "product" ? ownProduct?.status === "contato_realizado" : storeState === "pending";
  if (pendingHere) {
    const pending = mode === "product" ? ownProduct : purchases.find((item) => String(item.loja?.id) === String(storeId) && item.status === "contato_realizado");
    return (
      <div className="purchase-gate pending" role="status">
        <Clock3 size={20} aria-hidden="true" />
        <div>
          <strong>Confirmação pendente</strong>
          <p>
            A loja ainda não confirmou sua compra{pending?.codigo ? ` (código ${pending.codigo})` : ""}.
            Informe o código ao lojista, se necessário.
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => go("consumidor/compras")}>Minhas compras</button>
      </div>
    );
  }

  const rejected = storeState === "rejected";
  const options = products.filter((item) => String(item.store ?? item.loja_id) === String(storeId));
  return (
    <div className="purchase-gate" aria-live="polite">
      {rejected ? <XCircle size={20} aria-hidden="true" /> : <ShoppingBag size={20} aria-hidden="true" />}
      <div className="purchase-gate-body">
        <strong>{mode === "product" ? "Já comprou este produto?" : "Para avaliar, confirme sua compra"}</strong>
        <p>
          {rejected
            ? "A loja não reconheceu uma solicitação anterior. Você pode solicitar a confirmação de outra compra."
            : "A loja confirma a compra e então você pode publicar sua avaliação com fotos."}
        </p>
        {mode === "store" && (
          <label className="field purchase-gate-select">
            <span>Produto comprado</span>
            <select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={sending || !options.length}>
              <option value="">{options.length ? "Selecione o produto" : "Nenhum produto disponível"}</option>
              {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <button type="button" className="primary" disabled={sending || (mode === "store" && !selected)} onClick={request}>
        {sending ? "Enviando…" : mode === "product" ? "Já comprei este produto" : "Solicitar confirmação"}
      </button>
    </div>
  );
}
