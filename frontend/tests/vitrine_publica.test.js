import test from "node:test";
import assert from "node:assert/strict";
import { canAccessRoute } from "../services/auth.js";
import {
  buildPublicCatalog,
  catalogQuery,
  createPublicCatalogService,
  normalizePublicProduct,
} from "../services/catalog.js";
import { searchProducts } from "../services/search.js";

const rawProduct = (overrides = {}) => ({
  id: "7800fcb0-03a3-48c6-a413-cf339f67d555",
  loja_id: "1ad8150b-eaf6-4c68-9d34-0a18321b6630",
  categoria_id: "8134d10c-ddce-4e4f-8fe9-446719882c86",
  titulo: "Camisa de linho",
  descricao: "Leve e confortável",
  preco_base: "159.90",
  foto_principal_url: "https://example.com/camisa.jpg",
  ativo: true,
  nome_loja: "Dona Flor",
  nome_categoria: "Vestuário",
  ...overrides,
});

test("filtros da vitrine montam query compatível com GET /produtos", () => {
  const params = catalogQuery(
    {
      query: " Camisa ",
      category: "Vestuário",
      store: "1ad8150b-eaf6-4c68-9d34-0a18321b6630",
      min: "50",
      max: "200",
      sort: "menor",
    },
    [{ id: "8134d10c-ddce-4e4f-8fe9-446719882c86", nome: "Vestuário" }],
  );
  assert.equal(params.get("q"), "Camisa");
  assert.equal(
    params.get("categoria_id"),
    "8134d10c-ddce-4e4f-8fe9-446719882c86",
  );
  assert.equal(
    params.get("loja_id"),
    "1ad8150b-eaf6-4c68-9d34-0a18321b6630",
  );
  assert.equal(params.get("preco_min"), "50");
  assert.equal(params.get("preco_max"), "200");
});

test("rejeita preços inválidos e intervalo invertido na vitrine", () => {
  assert.throws(() => catalogQuery({ min: "100", max: "50" }), /mínimo/);
  assert.throws(() => catalogQuery({ min: "-10" }), /válido/);
  assert.throws(() => catalogQuery({ max: "abc" }), /válido/);
});

test("vitrine pública consulta /produtos sem autenticação e monta lojas e categorias", async () => {
  const calls = [];
  const service = createPublicCatalogService(async (url, options) => {
    calls.push({ url, options });
    return [
      rawProduct(),
      rawProduct({
        id: "9900fcb0-03a3-48c6-a413-cf339f67d555",
        titulo: "Calça de linho",
        preco_base: "89.90",
      }),
    ];
  });

  const catalog = await service.load();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^\/produtos\?/);
  assert.equal(calls[0].options.authenticated, false);
  assert.equal(catalog.products.length, 2);
  assert.deepEqual(catalog.categories, ["Vestuário"]);
  assert.equal(catalog.stores.length, 1);
  assert.equal(catalog.stores[0].name, "Dona Flor");

  const sortedAsc = await service.products({ sort: "menor" }, catalog.categoryRecords);
  assert.equal(sortedAsc[0].price, 89.9);
  assert.equal(sortedAsc[1].price, 159.9);
});

test("normalização de produto bloqueia URLs inseguras e preserva dados da API", () => {
  const item = normalizePublicProduct(
    rawProduct({
      foto_principal_url: "javascript:alert(1)",
      whatsapp_loja: "(89) 99999-8888",
    }),
  );
  assert.equal(item.image, "");
  assert.equal(item.name, "Camisa de linho");
  assert.equal(item.storeName, "Dona Flor");
  assert.equal(item.category, "Vestuário");
  assert.equal(item.price, 159.9);
  assert.equal(item.whatsapp, "(89) 99999-8888");
});

test("catálogo associa à loja o WhatsApp real recebido com o produto", () => {
  const catalog = buildPublicCatalog([
    rawProduct({ whatsapp_loja: "89999998888" }),
  ]);
  assert.equal(catalog.stores[0].whatsapp, "89999998888");
});

test("searchProducts filtra e ordena produtos da vitrine", () => {
  const catalog = buildPublicCatalog([
    rawProduct(),
    rawProduct({
      id: "2222fcb0-03a3-48c6-a413-cf339f67d555",
      titulo: "Caneca artesanal",
      descricao: "Cerâmica",
      preco_base: "49.90",
      categoria_id: "3333d10c-ddce-4e4f-8fe9-446719882c86",
      nome_categoria: "Casa e decoração",
    }),
  ]);

  const byQuery = searchProducts(catalog, { query: "caneca" });
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0].name, "Caneca artesanal");

  const byCategory = searchProducts(catalog, { category: "Vestuário" });
  assert.equal(byCategory.length, 1);
  assert.equal(byCategory[0].name, "Camisa de linho");
});

test("rotas públicas da vitrine permanecem acessíveis sem login", () => {
  assert.equal(canAccessRoute("inicio", null), true);
  assert.equal(canAccessRoute("explorar", null), true);
  assert.equal(canAccessRoute("lojas", null), true);
  assert.equal(canAccessRoute("produto/7800fcb0-03a3-48c6-a413-cf339f67d555", null), true);
  assert.equal(canAccessRoute("loja/1ad8150b-eaf6-4c68-9d34-0a18321b6630", null), true);
});
