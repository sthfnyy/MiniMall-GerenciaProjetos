import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildWhatsAppLink,
  buildWhatsAppMessage,
  normalizeBrazilianWhatsApp,
} from "../services/contact.js";

test("normaliza número brasileiro sem código 55", () => {
  assert.equal(normalizeBrazilianWhatsApp("89999998888"), "5589999998888");
});

test("preserva número que já possui código 55 sem duplicá-lo", () => {
  assert.equal(normalizeBrazilianWhatsApp("5589999998888"), "5589999998888");
  assert.equal(normalizeBrazilianWhatsApp("+55 (89) 99999-8888"), "5589999998888");
});

test("remove parênteses, espaços, hífen e outros símbolos", () => {
  assert.equal(normalizeBrazilianWhatsApp("(89) 99999-8888"), "5589999998888");
  assert.equal(normalizeBrazilianWhatsApp("(89) 9999-8888"), "558999998888");
});

test("gera mensagem com o produto informado e sem preço quando ele está ausente", () => {
  assert.equal(
    buildWhatsAppMessage({ productName: "Caderno artesanal" }),
    "Olá! Tenho interesse no produto Caderno artesanal anunciado no MiniMall.",
  );
});

test("gera mensagem com preço usando a formatação monetária existente", () => {
  assert.equal(
    buildWhatsAppMessage({ productName: "Caderno artesanal", price: 22.5 }),
    "Olá! Tenho interesse no produto Caderno artesanal, no valor de R$ 22,50, anunciado no MiniMall.",
  );
  assert.match(buildWhatsAppMessage({ productName: "Caneca", price: "49,90" }), /R\$ 49,90/);
});

test("codifica espaços, acentos e caracteres especiais na URL", () => {
  const link = buildWhatsAppLink({
    whatsapp: "(89) 99999-8888",
    productName: "Café & chá – edição #2",
    price: 29.9,
  });
  assert.match(link, /^https:\/\/wa\.me\/5589999998888\?text=/);
  assert.match(link, /%20/);
  assert.match(link, /%C3%A9/);
  assert.match(link, /%26/);
  assert.match(link, /%23/);

  const url = new URL(link);
  assert.equal(url.pathname, "/5589999998888");
  assert.match(url.searchParams.get("text"), /Café & chá – edição #2/);
});

test("retorna null para WhatsApp ausente ou com quantidade inválida de dígitos", () => {
  assert.equal(buildWhatsAppLink({ productName: "Produto" }), null);
  assert.equal(buildWhatsAppLink({ whatsapp: "1234", productName: "Produto" }), null);
  assert.equal(normalizeBrazilianWhatsApp("555589999998888"), null);
});

test("retorna null para nome de produto vazio", () => {
  assert.equal(buildWhatsAppLink({ whatsapp: "89999998888", productName: "   " }), null);
});

test("retorna null para preço informado mas inválido", () => {
  assert.equal(buildWhatsAppLink({ whatsapp: "89999998888", productName: "Produto", price: "abc" }), null);
  assert.equal(buildWhatsAppLink({ whatsapp: "89999998888", productName: "Produto", price: -1 }), null);
});

test("componente reutiliza o serviço e expõe um link externo acessível", async () => {
  const source = await readFile(new URL("../components/WhatsAppContactButton.jsx", import.meta.url), "utf8");
  assert.match(source, /buildWhatsAppLink\(\{ whatsapp, productName, price \}\)/);
  assert.match(source, /if \(!href\) return null/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, />Falar no WhatsApp</);
  assert.match(source, /aria-hidden="true"/);
});
