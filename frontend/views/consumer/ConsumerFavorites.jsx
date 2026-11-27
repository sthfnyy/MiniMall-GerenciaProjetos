import React, { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { money, sanitizeImageUrl } from "../../services/catalog.js";
import {
  deleteConsumerFavorite,
  listConsumerFavorites,
} from "../../services/favorites.js";

export default function ConsumerFavorites({
  go,
  onFavoriteRemoved,
  listFavoritesFn = listConsumerFavorites,
  removeFavoriteFn = deleteConsumerFavorite,
}) {
  const [realFavorites, setRealFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setLoadFailed(false);
    listFavoritesFn()
      .then((favorites) => {
        if (active) setRealFavorites(favorites);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.message);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listFavoritesFn]);

  const list = realFavorites;

  async function removeRealFavorite(productId) {
    if (removingId) return;
    setRemovingId(productId);
    setError("");

    try {
      await removeFavoriteFn(productId);
    } catch (removeError) {
      // 404 com detalhe do backend: o favorito já não existe mais.
      if (removeError.status !== 404 || removeError.unavailable) {
        setError(removeError.message);
        setRemovingId(null);
        return;
      }
    }

    setRealFavorites((current) =>
      current.filter((favorite) => favorite.produto.id !== productId),
    );
    onFavoriteRemoved?.(productId);
    setRemovingId(null);
  }

  return (
    <section className="consumer-page">
      {go && (
        <button className="back-link" onClick={() => go("consumidor")}>
          ← Voltar ao perfil
        </button>
      )}

      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>

        <h1>Meus favoritos</h1>

        <p>
          Consulte os produtos que você adicionou à sua lista de favoritos.
        </p>
      </div>

      {loading && <p>Carregando seus favoritos...</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!loading && !loadFailed && (
        <div className="consumer-favorites-header">
          <div>
            <span className="section-index">
              PRODUTOS SALVOS
            </span>

            <h2>
              {list.length}{" "}
              {list.length === 1
                ? "produto favorito"
                : "produtos favoritos"}
            </h2>
          </div>
        </div>
      )}

      {!loading && list.length > 0 ? (
        <div className="product-grid">
          {list.map(({ produto }) => {
            const image = sanitizeImageUrl(produto.foto_principal_url);

            return (
              <article className="product-card" key={produto.id}>
                <div className="product-visual">
                  {image ? (
                    <img
                      src={image}
                      alt={produto.titulo}
                    />
                  ) : (
                    <div className="empty">
                      <Heart size={28} />
                    </div>
                  )}
                  <button
                    className="favorite is-favorite"
                    type="button"
                    aria-label={`Remover ${produto.titulo} dos favoritos`}
                    aria-pressed="true"
                    disabled={removingId === produto.id}
                    onClick={() => removeRealFavorite(produto.id)}
                  >
                    <Heart size={20} fill="currentColor" />
                  </button>
                </div>
                <div className="product-info">
                  {go && produto.ativo !== false ? (
                    <button type="button" className="product-name-link" onClick={() => go(`produto/${produto.id}`)}>
                      <strong className="product-name">{produto.titulo}</strong>
                    </button>
                  ) : (
                    <strong className="product-name">{produto.titulo}</strong>
                  )}
                  {produto.ativo === false && <span className="status-badge rejected">Indisponível</span>}
                  <p>{produto.descricao}</p>
                  <div className="price">
                    {produto.preco_promocional ? (
                      <><strong>{money(Number(produto.preco_promocional))}</strong> <s>{money(Number(produto.preco_base))}</s></>
                    ) : (
                      <strong>{money(Number(produto.preco_base))}</strong>
                    )}
                  </div>
                  {removingId === produto.id && <small>Removendo...</small>}
                </div>
              </article>
            );
          })}
        </div>
      ) : !loading && !error ? (
        <div className="empty">
          <Heart size={34} />

          <h3>Nenhum favorito ainda</h3>

          <p>
            Quando você encontrar um produto que gostar,
            poderá adicioná-lo aos seus favoritos.
          </p>

          {go && (
            <button className="primary" onClick={() => go("explorar")}>
              Explorar produtos
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
