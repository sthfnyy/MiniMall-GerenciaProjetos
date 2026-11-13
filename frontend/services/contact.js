import { money } from "./catalog.js";

/**
 * Normaliza um telefone brasileiro para o padrão internacional usado pelo wa.me.
 * Retorna null quando o valor não contém um DDD e um número válidos em quantidade
 * de dígitos (10 ou 11 dígitos nacionais; 12 ou 13 quando já começa com 55).
 */
export function normalizeBrazilianWhatsApp(whatsapp) {
  const digits = String(whatsapp ?? "").replace(/\D/g, "");
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  if (/^55\d{10,11}$/.test(digits)) return digits;
  return null;
}

/**
 * Gera a mensagem de interesse para o produto recebido.
 * Retorna null para nome vazio ou para preço informado que não seja válido.
 */
export function buildWhatsAppMessage({ productName, price } = {}) {
  const name = typeof productName === "string" ? productName.trim() : "";
  if (!name) return null;

  const hasPrice = price !== undefined && price !== null && price !== "";
  if (!hasPrice) return `Olá! Tenho interesse no produto ${name} anunciado no MiniMall.`;

  const numericPrice = typeof price === "number"
    ? price
    : Number(String(price).trim().replace(",", "."));
  if (!Number.isFinite(numericPrice) || numericPrice < 0) return null;

  return `Olá! Tenho interesse no produto ${name}, no valor de ${money(numericPrice)}, anunciado no MiniMall.`;
}

/**
 * Cria o link oficial do WhatsApp Web/App a partir de dados fornecidos pela tela.
 * Retorna null se o WhatsApp, o produto ou um preço informado forem inválidos.
 */
export function buildWhatsAppLink({ whatsapp, productName, price } = {}) {
  const number = normalizeBrazilianWhatsApp(whatsapp);
  const message = buildWhatsAppMessage({ productName, price });
  if (!number || !message) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
