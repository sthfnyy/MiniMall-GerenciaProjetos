import React, { useState } from "react";
import { PageTitle } from "../../components/ui";
import Moderation from "./Moderation";
import Registrations from "./Registrations";

export default function Admin(props) {
  const [page, setPage] = useState("registrations");
  const pages = [
    ["registrations", "Gestão de Categorias"],
    ["moderation", "Moderação"],
  ];

  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRAÇÃO"
        title={pages.find(([id]) => id === page)[1]}
        text="Gerencie as categorias globais e a moderação de avaliações da plataforma."
      />
      <nav className="admin-navigation" aria-label="Painel do administrador">
        {pages.map(([id, label]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {page === "moderation" ? (
        <Moderation {...props} />
      ) : (
        <Registrations {...props} />
      )}
    </>
  );
}
