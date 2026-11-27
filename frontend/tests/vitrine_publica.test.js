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
    if (url === "/lojas") {
      return [
        { id: "1ad8150b-eaf6-4c68-9d34-0a18321b6630", nome_loja: "Dona Flor", endereco_cidade: "Picos", endereco_uf: "PI", whatsapp: "89999998888" },
      ];
    }
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
  // Produtos e lojas públicas são carregados sem autenticação.
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^\/produtos\?/);
  assert.equal(calls[0].options.authenticated, false);
  assert.equal(calls[1].url, "/lojas");
  assert.equal(calls[1].options.authenticated, false);
  assert.equal(catalog.products.length, 2);
  assert.deepEqual(catalog.categories, ["Vestuário"]);
  assert.equal(catalog.stores.length, 1);
  assert.equal(catalog.stores[0].name, "Dona Flor");

  const sortedAsc = await service.products({ sort: "menor" }, catalog.categoryRecords);
  assert.equal(sortedAsc[0].price, 89.9);
  assert.equal(sortedAsc[1].price, 159.9);
});

test("lojas aprovadas sem produtos aparecem e trazem dados comerciais", () => {
  const catalog = buildPublicCatalog([rawProduct()], [
    {
      id: "1ad8150b-eaf6-4c68-9d34-0a18321b6630", nome_loja: "Dona Flor", descricao: "Moda",
      endereco_logradouro: "Rua A", endereco_numero: "10", endereco_cidade: "Picos", endereco_uf: "PI",
      horario_funcionamento: { descricao: "Seg a Sex 8h-18h" }, whatsapp: "89999998888",
      instagram: "@donaflor", facebook: "javascript:alert(1)", media_avaliacoes: 4.5, total_avaliacoes: 2,
    },
    { id: "2bd8150b-eaf6-4c68-9d34-0a18321b6631", nome_loja: "Loja Nova", endereco_cidade: "Picos", endereco_uf: "PI", whatsapp: "" },
  ]);
  assert.equal(catalog.stores.length, 2);
  const [flor, nova] = catalog.stores;
  assert.equal(flor.address, "Rua A, 10, Picos – PI");
  assert.equal(flor.hours, "Seg a Sex 8h-18h");
  assert.equal(flor.instagram, "https://instagram.com/donaflor");
  assert.equal(flor.facebook, "");
  assert.equal(flor.rating, 4.5);
  assert.equal(flor.category, "Vestuário");
  assert.match(flor.mapsUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.equal(nova.name, "Loja Nova");
  assert.equal(nova.productCount, 0);
});

test("preço promocional da API vira destaque no card", () => {
  const item = normalizePublicProduct(rawProduct({ preco_promocional: "129.90" }));
  assert.equal(item.sale, 129.9);
  assert.equal(item.price, 159.9);
  assert.equal(normalizePublicProduct(rawProduct()).sale, 0);
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
