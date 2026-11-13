import React from "react";
import ProductCard from "../components/ProductCard";
import StoreIdentity, { storeIdentity } from "../components/StoreIdentity";

export default function StorePage({
  store: s,
  data,
  onProduct,
  onStore,
  go,
}) {
  const identity = storeIdentity(s.id);
  const products = (data?.products || []).filter(
    (p) => String(p.store) === String(s.id) && !p.deleted,
  );

  return (
    <>
      <button className="back-link" onClick={() => go("lojas")}>
        ← Lojas
      </button>
      <section
        className={`store-cover identity-${identity.name}`}
        style={{ "--store-paper": identity.paper, "--store-ink": identity.ink }}
      >
        <StoreIdentity store={s} />
        <div>
          {s.category && <span className="eyebrow">{s.category}</span>}
          <h1>{s.name}</h1>
          {s.description && <p>{s.description}</p>}
        </div>
      </section>
      <div className="section-heading">
        <h2>Produtos</h2>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              store={s}
              onProduct={onProduct}
              onStore={onStore}
            />
          ))}
        </div>
      ) : (
        <p>Nenhum produto publicado.</p>
      )}
    </>
  );
}
