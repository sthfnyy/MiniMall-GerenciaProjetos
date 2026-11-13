import React from "react";
import { MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "../services/contact.js";

export default function WhatsAppContactButton({ whatsapp, productName, price }) {
  const href = buildWhatsAppLink({ whatsapp, productName, price });
  if (!href) return null;

  return (
    <a
      className="primary full whatsapp"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <MessageCircle size={18} aria-hidden="true" focusable="false" />
      <span>Falar no WhatsApp</span>
    </a>
  );
}
