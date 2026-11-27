import React, { useId } from "react";
import { ImagePlus } from "lucide-react";
import { REVIEW_PHOTO_TYPES } from "../services/reviews.js";

export const PHOTO_HELP_TEXT = "Até 3 fotos. JPEG, PNG ou WebP. Máximo de 5 MB por imagem.";

/**
 * Botão de seleção de fotos: o input nativo fica visualmente oculto (mas
 * acessível por teclado e leitor de tela) dentro de um rótulo estilizado.
 */
export default function PhotoUploadButton({
  onSelect,
  disabled = false,
  multiple = true,
  label = "Adicionar fotos",
  ariaLabel,
  remaining,
}) {
  const helpId = useId();
  return (
    <div className="photo-upload">
      <label className={`photo-upload-button ${disabled ? "disabled" : ""}`}>
        <input
          className="visually-hidden"
          type="file"
          accept={REVIEW_PHOTO_TYPES.join(",")}
          multiple={multiple}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-describedby={helpId}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            if (files.length) onSelect(files);
          }}
        />
        <ImagePlus size={20} aria-hidden="true" />
        <span>{label}</span>
      </label>
      <small id={helpId} className="photo-upload-help">
        {PHOTO_HELP_TEXT}
        {typeof remaining === "number" ? ` Restam ${remaining}.` : ""}
      </small>
    </div>
  );
}
