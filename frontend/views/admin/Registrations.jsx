import React, { useEffect, useState } from "react";
import { Modal } from "../../components/ui";
import {
  getAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
} from "../../services/admin";

export default function Registrations({ notify, onCategoriesChange }) {
  const [adminCategories, setAdminCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [categoryError, setCategoryError] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryDeleting, setCategoryDeleting] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setCategoriesLoading(true);
    setCategoriesError("");

    async function loadCategories() {
      try {
        const result = await getAdminCategories();
        if (active) {
          setAdminCategories(result || []);
          setCategoriesError("");
        }
      } catch (err) {
        if (active) {
          setCategoriesError(err.message || "Não foi possível carregar as categorias.");
        }
      } finally {
        if (active) {
          setCategoriesLoading(false);
        }
      }
    }

    loadCategories();

    return () => {
      active = false;
    };
  }, [revision]);

  async function handleSaveCategory(e) {
    e.preventDefault();
    if (categorySaving) return;

    const nome = name.trim();
    if (!nome) {
      setCategoryError("Informe o nome da categoria.");
      return;
    }

    setCategorySaving(true);
    setCategoryError("");

    try {
      if (editing) {
        const updated = await updateAdminCategory(editing.id, nome);
        setAdminCategories((prev) =>
          prev
            .map((c) => (c.id === editing.id ? updated : c))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        );
        notify?.("Categoria atualizada com sucesso.");
      } else {
        const created = await createAdminCategory(nome);
        setAdminCategories((prev) =>
          [...prev, created].sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR"),
          ),
        );
        notify?.("Categoria cadastrada com sucesso.");
      }

      setName("");
      setEditing(null);
      onCategoriesChange?.();
    } catch (err) {
      setCategoryError(err.message || "Erro ao salvar categoria.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleDeleteCategory() {
    if (!deleting || categoryDeleting) return;

    setCategoryDeleting(true);
    setCategoryError("");

    try {
      await deleteAdminCategory(deleting.id);
      setAdminCategories((prev) => prev.filter((c) => c.id !== deleting.id));

      if (editing?.id === deleting.id) {
        setEditing(null);
        setName("");
      }

      setDeleting(null);
      notify?.("Categoria excluída com sucesso.");
      onCategoriesChange?.();
    } catch (err) {
      setCategoryError(err.message || "Erro ao excluir categoria.");
      setDeleting(null);
    } finally {
      setCategoryDeleting(false);
    }
  }

  function cancelEditing() {
    setEditing(null);
    setName("");
    setCategoryError("");
  }

  return (
    <>
      <section className="panel">
        <h2>Categorias globais</h2>

        <form className="category-form" onSubmit={handleSaveCategory}>
          <input
            aria-label="Nome da categoria"
            required
            minLength={2}
            maxLength={100}
            value={name}
            disabled={categorySaving || categoriesLoading}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da categoria"
          />

          <button
            className="primary"
            type="submit"
            disabled={categorySaving || categoriesLoading}
          >
            {categorySaving
              ? "Salvando..."
              : editing
                ? "Salvar alteração"
                : "Cadastrar categoria"}
          </button>

          {editing && (
            <button
              className="outline"
              type="button"
              disabled={categorySaving}
              onClick={cancelEditing}
            >
              Cancelar
            </button>
          )}
        </form>

        {categoryError && (
          <p className="error" role="alert">
            {categoryError}
          </p>
        )}

        {categoriesLoading && <p role="status">Carregando categorias...</p>}

        {categoriesError && (
          <div className="error" role="alert">
            Erro ao carregar categorias: {categoriesError}{" "}
            <button
              className="text-button"
              type="button"
              onClick={() => setRevision((r) => r + 1)}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!categoriesLoading &&
          !categoriesError &&
          adminCategories.length === 0 && (
            <p>Nenhuma categoria cadastrada.</p>
          )}

        {!categoriesLoading &&
          !categoriesError &&
          adminCategories.map((c) => (
            <div className="admin-row" key={c.id}>
              <strong>{c.nome}</strong>

              <div className="row">
                <button
                  className="text-button"
                  disabled={categorySaving || categoryDeleting}
                  onClick={() => {
                    setEditing(c);
                    setName(c.nome);
                    setCategoryError("");
                  }}
                  aria-label={`Alterar ${c.nome}`}
                >
                  Alterar
                </button>

                <button
                  className="text-button danger"
                  disabled={categorySaving || categoryDeleting}
                  onClick={() => {
                    setDeleting(c);
                    setCategoryError("");
                  }}
                  aria-label={`Excluir ${c.nome}`}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
      </section>

      {deleting && (
        <Modal
          title="Excluir categoria?"
          onClose={() => {
            if (!categoryDeleting) setDeleting(null);
          }}
        >
          <p>{deleting.nome}</p>
          <p>Categorias com produtos vinculados não podem ser excluídas.</p>

          <div className="modal-actions">
            <button
              className="outline"
              disabled={categoryDeleting}
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </button>

            <button
              className="primary red"
              disabled={categoryDeleting}
              onClick={handleDeleteCategory}
            >
              {categoryDeleting ? "Excluindo..." : "Excluir categoria"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
