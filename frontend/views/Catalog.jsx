import React, { useState, useEffect } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Field, Empty } from "../components/ui";
import ProductCard from "../components/ProductCard";
import { publicCatalog } from "../services/public-catalog";
import { money } from "../services/catalog";
export default function Catalog({
  data,
  filters,
  setFilters,
  onProduct,
  onStore,
  isFavorite,
  onToggleFavorite,
}) {
  const [open, setOpen] = useState(false);
  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clear = () =>
    setFilters({
      query: "",
      category: "",
      store: "",
      min: "",
      max: "",
      sort: "relevancia",
    });
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setList([]);
    const timer = setTimeout(() => {
      publicCatalog.products(filters, data.categoryRecords || [], controller.signal).then(result => {
        if (!controller.signal.aborted) setList(result);
      }).catch(err => { if (err.name !== 'AbortError') setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters.query, filters.category, filters.store, filters.min, filters.max, filters.sort, data.categoryRecords, revision]);
  const active =
    filters.query ||
    filters.category ||
    filters.store ||
    filters.min ||
    filters.max;
  return (
    <>
      <div className="page-title">
        <h1>Produtos</h1>
      </div>
      <section className="category-row" aria-label="Categorias">
        <button
          aria-pressed={!filters.category}
          className={!filters.category ? "selected" : ""}
          onClick={() => set("category", "")}
        >
          Todas
        </button>
        {data.categories.map((c) => (
          <button
            key={c}
            aria-pressed={filters.category === c}
            className={filters.category === c ? "selected" : ""}
            onClick={() => set("category", filters.category === c ? "" : c)}
          >
            {c}
          </button>
        ))}
      </section>
      <div className="section-heading">
        <span aria-live="polite">
          {loading ? "Pesquisando…" : `${list.length} ${list.length === 1 ? "produto" : "produtos"}`}
        </span>
        <div className="row">
          <label className="sort">
            Ordenar por{" "}
            <select
              aria-label="Ordenar produtos"
              value={filters.sort}
              onChange={(e) => set("sort", e.target.value)}
            >
              <option value="relevancia">Relevância</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
            </select>
          </label>
          <button
            className="outline"
            aria-expanded={open}
            aria-controls="product-filters"
            onClick={() => setOpen(!open)}
          >
            <SlidersHorizontal size={17} />
            Filtros
          </button>
        </div>
      </div>
      {open && (
        <div id="product-filters" className="filters">
          <Field label="Loja">
            <select
              value={filters.store}
              onChange={(e) => set("store", e.target.value)}
            >
              <option value="">Todas as lojas</option>
              {data.stores
                .filter((s) => s.status === "aprovada")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field
            label="Preço mínimo"
            type="number"
            min="0"
            value={filters.min}
            onChange={(e) => set("min", e.target.value)}
          />
          <Field
            label="Preço máximo"
            type="number"
            min="0"
            value={filters.max}
            onChange={(e) => set("max", e.target.value)}
          />
          <button className="text-button" onClick={clear}>
            Limpar filtros
          </button>
        </div>
      )}
      {active && (
        <div className="applied-filters" aria-label="Filtros aplicados">
          {[
            ["query", filters.query],
            ["category", filters.category],
            [
              "store",
              data.stores.find((s) => String(s.id) === String(filters.store))?.name,
            ],
          ].map(
            ([key, label]) =>
              label && (
                <button
                  key={key}
                  aria-label={`Remover filtro ${label}`}
                  onClick={() => set(key, "")}
                >
                  {label}
                  <X size={14} />
                </button>
              ),
          )}
          {(filters.min || filters.max) && (
            <button
              aria-label="Remover filtro de preço"
              onClick={() => setFilters((f) => ({ ...f, min: "", max: "" }))}
            >
              {filters.min ? money(filters.min) : "R$ 0"} —{" "}
              {filters.max ? money(filters.max) : "Sem limite"}
              <X size={14} />
            </button>
          )}
          <button className="clear-all" onClick={clear}>
            Limpar tudo
          </button>
        </div>
      )}
      {loading ? <p role="status">Pesquisando produtos…</p> : error ? (
        <p className="error" role="alert">
          {error} <button className="text-button" onClick={() => setRevision(r => r + 1)}>Tentar novamente</button>
        </p>
      ) : list.length ? (
        <div className="product-grid">
          {list.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              store={data.stores.find((s) => s.id === p.store) || { id: p.store, name: "Ver loja" }}
              onProduct={onProduct}
              onStore={onStore}
              isFavorite={isFavorite?.(p.id) || false}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        <Empty
          action={
            <button className="primary" onClick={clear}>
              Limpar filtros
            </button>
          }
        />
      )}
    </>
  );
}
