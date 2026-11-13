import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("RNF02 mantém os breakpoints do MiniMall original", async () => {
  const css = (await Promise.all(
    ["base", "theme", "home", "delivery"].map((name) => read(`../styles/${name}.css`)),
  )).join("\n");
  for (const width of [400, 420, 760, 768, 1050, 1200]) {
    assert.match(css, new RegExp(`@media\\s*\\((max|min)-width:\\s*${width}px\\)|max-width:\\s*${width}px`));
  }
});

test("RNF02 garante alvos de toque de 44px no mobile sem alterar o desktop", async () => {
  const css = await read("../styles/delivery.css");
  const block = css.slice(css.lastIndexOf("/* RNF02"));
  assert.match(block, /@media \(max-width: 760px\)/);
  assert.match(block, /\.search-submit,\s*\.icon-button\s*\{\s*width:\s*44px;\s*height:\s*44px/);
  for (const selector of [".account-button", ".text-button", ".outline", ".sort select", ".category-row button"]) {
    assert.ok(block.includes(selector), `${selector} deve ter alvo de toque adequado`);
  }
  assert.match(block, /min-height:\s*44px/);
});

test("painel administrativo usa navegação e linhas responsivas do MiniMall", async () => {
  const css = await read("../styles/theme.css") + await read("../styles/delivery.css") + await read("../styles/base.css");
  assert.match(css, /\.admin-navigation/);
  assert.match(css, /\.admin-row/);
  assert.match(css, /\.modal-actions/);
});

test("foco visível e redução de movimento continuam disponíveis", async () => {
  const base = await read("../styles/base.css");
  const home = await read("../styles/home.css");
  assert.match(base, /button:focus-visible/);
  assert.match(base, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(home, /@media \(prefers-reduced-motion: reduce\)/);
});

test("header usa o símbolo da marca do MiniMall original", async () => {
  const app = await read("../App.jsx");
  assert.match(app, /className="brand-symbol"/);
});

test("botão de WhatsApp segue a composição visual do MiniMall", async () => {
  const source = await read("../components/WhatsAppContactButton.jsx");
  assert.match(source, /className="primary whatsapp full"/);
  assert.match(source, /className="contact-note"/);
});
