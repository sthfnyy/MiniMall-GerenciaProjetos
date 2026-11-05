export function normalizeWhatsApp(number) {
  let digits = String(number || '').replace(/\D/g, '');
  if (/^\d{10,11}$/.test(digits)) digits = `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : null;
}
export function whatsappLink(number, message = '') {
  const digits = normalizeWhatsApp(number);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}
export function productContact(product, stores, productUrl) {
  const store = stores.find(item => String(item.id) === String(product.store));
  if (!store) return null;
  const amount = Number(product.sale || product.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const message = `Olá, ${store.name}! Tenho interesse no produto ${product.name} (${amount}).\n${productUrl}`;
  return { store, message, url: whatsappLink(store.whatsapp, message) };
}
