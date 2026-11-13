import React from "react";
import { ArrowUpRight } from "lucide-react";
import StoreIdentity, { storeIdentity } from "./StoreIdentity";

export default function StoreCard({ store: s, onStore }) {
  const identity = storeIdentity(s.id);
  return (
    <button
      className={`store-card identity-${identity.name}`}
      style={{ "--store-paper": identity.paper, "--store-ink": identity.ink }}
      onClick={() => onStore(s.id)}
    >
      <span className="store-brand-panel" aria-hidden="true">
        <StoreIdentity store={s} />
        <span className="store-wordmark">{s.name}</span>
      </span>
      <span className="store-card-info">
        <strong>{s.name}</strong>
        {s.category && <small>{s.category}</small>}
      </span>
      <ArrowUpRight size={19} />
    </button>
  );
}
