import React from "react";
import { MessageCircle, ArrowUpRight, ShieldCheck } from "lucide-react";
import { buildWhatsAppLink } from "../services/contact.js";

export default function WhatsAppContactButton({ whatsapp, productName, price }) {
  const href = buildWhatsAppLink({ whatsapp, productName, price });
  if (!href) return null;

  return (
    <>
      <a
        className="primary whatsapp full"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle size={20} aria-hidden="true" focusable="false" />
        <span>Falar no WhatsApp</span>
        <ArrowUpRight size={18} aria-hidden="true" focusable="false" />
      </a>
      <div className="contact-note">
        <ShieldCheck size={19} aria-hidden="true" focusable="false" />
        <span>Combine a compra com a loja pelo WhatsApp.</span>
      </div>
    </>
  );
}
