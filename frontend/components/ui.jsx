import React, { useRef, useEffect, useId } from "react";
import { X, Search } from "lucide-react";
// busy: enquanto uma operação assíncrona estiver em andamento, Esc, clique
// fora e o botão Fechar não encerram o diálogo (evita estado divergente).
export function Modal({ title, children, onClose, wide = false, busy = false }) {
  const ref = useRef();
  const titleId = useId();
  useEffect(() => {
    const old = document.activeElement;
    const d = ref.current;
    d.showModal();
    return () => {
      d.close();
      old?.focus();
    };
  }, []);
  const close = () => {
    if (!busy) onClose?.();
  };
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === ref.current && close()}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" type="button" aria-label="Fechar" onClick={close} disabled={busy}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title = "Nenhum produto encontrado",
  text = "Tente outra busca ou remova os filtros.",
  action,
  headingLevel = 3,
}) {
  const Heading = `h${headingLevel}`;
  return (
    <div className="empty">
      <Search size={34} aria-hidden="true" />
      <Heading>{title}</Heading>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function PageTitle({ eyebrow, title, text }) {
  return (
    <div className="page-title">
      <span className="eyebrow muted">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
