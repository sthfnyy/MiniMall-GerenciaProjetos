import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhatsApp, whatsappLink, productContact } from '../services/contact.js';
test('WhatsApp aceita formatação brasileira com DDD e DDI', () => {
  assert.equal(normalizeWhatsApp('(89) 99999-9999'), '5589999999999');
  assert.equal(normalizeWhatsApp('+55 (89) 99999-9999'), '5589999999999');
  assert.equal(normalizeWhatsApp(''), null); assert.equal(normalizeWhatsApp('1234'), null);
  assert.equal(whatsappLink(null, 'produto'), null);
});
test('contato utiliza a loja do produto selecionado e codifica a mensagem', () => {
  const stores = [{ id: 'a', name: 'Loja A', whatsapp: '5589999999999' }, { id: 'b', name: 'Loja B', whatsapp: '5586999999999' }];
  const contact = productContact({ id: 'p', store: 'b', name: 'Café & chá', price: 29.90 }, stores, 'https://minimall.local/#produto/p');
  const url = new URL(contact.url);
  assert.equal(url.pathname, '/5586999999999');
  assert.match(url.searchParams.get('text'), /Loja B/); assert.match(url.searchParams.get('text'), /Café & chá/);
  assert.match(url.searchParams.get('text'), /produto\/p/); assert.match(url.searchParams.get('text'), /29,90/);
});
test('não escolhe outro contato quando loja ou telefone estão ausentes', () => {
  assert.equal(productContact({ store: 'inexistente' }, [], 'url'), null);
  assert.equal(productContact({ store: 'a', name: 'Produto', price: 10 }, [{ id: 'a', name: 'Loja', whatsapp: '' }], 'url').url, null);
});
