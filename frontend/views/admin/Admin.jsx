import React, { useState } from "react";
import { PageTitle } from "../../components/ui";
import Moderation from "./Moderation";
import Registrations from "./Registrations";
import Stores from "./Stores";

const PAGES = [
  ["stores", "Lojas", "Aprove ou rejeite os cadastros de lojas antes de aparecerem na vitrine."],
  ["registrations", "Gestão de Categorias", "Gerencie as categorias globais usadas pelos lojistas."],
  ["moderation", "Moderação", "Remova avaliações ou fotos que violem as regras da plataforma."],
];

export default function Admin({ notify, onCategoriesChange, onStoresChange }) {
  const [page, setPage] = useState("stores");
  const [, title, text] = PAGES.find(([id]) => id === page);

  return (
    <>
      <PageTitle eyebrow="ADMINISTRAÇÃO" title={title} text={text} />
      <nav className="admin-navigation" aria-label="Painel do administrador">
        {PAGES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={page === id ? "active" : ""}
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {page === "stores" && <Stores notify={notify} onStoresChange={onStoresChange} />}
      {page === "registrations" && <Registrations notify={notify} onCategoriesChange={onCategoriesChange} />}
      {page === "moderation" && <Moderation notify={notify} />}
    </>
  );
}
