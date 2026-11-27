import React from "react";
import {
  Store,
  ChevronRight,
  ArrowUpRight,
  Image as ImageIcon,
  Heart,
} from "lucide-react";
import PurchaseGate from "../components/PurchaseGate";
import WhatsAppContactButton from "../components/WhatsAppContactButton";
import { money, price } from "../services/catalog";

export default function ProductDetail({
  product: p,
  store: s,
  go,
  user,
  notify,
  isFavorite = false,
  onToggleFavorite,
  favoriteBusy = false,
}) {
  const storeName = s?.name || p.storeName || "Loja parceira";
  const storeId = s?.id || p.store;

  return (
    <>
      <button className="back-link" onClick={() => go("explorar")}>
        ← Voltar à vitrine
      </button>
      <div className="product-detail">
        <div className="detail-image">
          {p.image ? (
            <img src={p.image} alt={p.name} />
          ) : (
            <div className="product-upload-placeholder">
              <ImageIcon size={48} />
              <span>Sem imagem</span>
            </div>
          )}
          {p.sale > 0 && <span className="sale-tag">Oferta</span>}
          {onToggleFavorite && (
            <button
              className={`favorite ${isFavorite ? "is-favorite" : ""}`}
              type="button"
              aria-label={
                isFavorite
                  ? `Remover ${p.name} dos favoritos`
                  : `Adicionar ${p.name} aos favoritos`
              }
              aria-pressed={isFavorite}
              aria-busy={favoriteBusy}
              disabled={favoriteBusy}
              onClick={() => onToggleFavorite(p)}
            >
              <Heart
                size={20}
                fill={isFavorite ? "currentColor" : "none"}
              />
            </button>
          )}
        </div>
        <div className="detail-copy">
          <span className="eyebrow muted">{p.category}</span>
          <h1>{p.name}</h1>
          <button className="store-link" onClick={() => go(`loja/${storeId}`)}>
            <Store size={16} />
            {storeName}
            <ChevronRight size={15} />
          </button>
          <div className="price big-price">
            <strong>{money(price(p))}</strong>
            {p.sale > 0 && <s>{money(p.price)}</s>}
          </div>
          <p>{p.description || "Nenhuma descrição informada."}</p>
          <WhatsAppContactButton
            whatsapp={s?.whatsapp || p.whatsapp}
            productName={p.name}
            price={price(p)}
            productId={p.id}
          />
          <PurchaseGate
            mode="product"
            user={user}
            storeId={storeId}
            storeName={storeName}
            product={p}
            go={go}
            notify={notify}
          />
        </div>
      </div>
      <div className="panel store-summary">
        <div>
          <span className="eyebrow muted">LOJA</span>
          <h2>{storeName}</h2>
        </div>
        <button className="outline" onClick={() => go(`loja/${storeId}`)}>
          Ver produtos da loja
          <ArrowUpRight size={17} />
        </button>
      </div>
    </>
  );
}
