import { apiRequest } from "./api.js";

export const money = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const price = (product) =>
  Number(product?.sale || product?.price || product?.preco_base || 0);

export const normalize = (text = "") =>
  String(text || "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function rating(data, id) {
  const list = (data?.reviews || []).filter((r) => String(r.store) === String(id));
  return list.length
    ? (list.reduce((sum, r) => sum + Number(r.rating || 0), 0) / list.length)
        .toFixed(1)
        .replace(".", ",")
    : "Sem avaliações";
}

export const emptyCatalog = {
  categories: [],
  categoryRecords: [],
  stores: [],
  products: [],
  reviews: [],
};

export function sanitizeImageUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (/^(https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  return "";
}

export function normalizePublicProduct(product = {}, categories = []) {
  const categoryId =
    (product.categoria_id ?? product.categoryId) != null
      ? String(product.categoria_id ?? product.categoryId)
      : "";
  const storeId = String(product.loja_id ?? product.store ?? "");
  const categoryRecord = categories.find((c) => String(c.id) === categoryId);
  const categoryName =
    product.nome_categoria ||
    product.category ||
    categoryRecord?.nome ||
    categoryRecord?.name ||
    "";
  const basePrice = Number(product.preco_base ?? product.price ?? 0);
  const safeImage = sanitizeImageUrl(product.foto_principal_url ?? product.image ?? "");
  const whatsapp = product.whatsapp_loja || product.whatsapp || "";

  return {
    id: String(product.id),
    loja_id: storeId,
    store: storeId,
    nome_loja: product.nome_loja || product.storeName || "",
    storeName: product.nome_loja || product.storeName || "",
    whatsapp,
    categoria_id: categoryId,
    categoryId,
    nome_categoria: categoryName,
    category: categoryName,
    name: product.titulo || product.name || "",
    titulo: product.titulo || product.name || "",
    description: product.descricao || product.description || "",
    descricao: product.descricao || product.description || "",
    price: basePrice,
    preco_base: basePrice,
    sale: Number(product.sale || 0),
    image: safeImage,
    foto_principal_url: safeImage || null,
    variations: Array.isArray(product.variations) ? product.variations : [],
    active: product.ativo !== undefined ? Boolean(product.ativo) : true,
    ativo: product.ativo !== undefined ? Boolean(product.ativo) : true,
  };
}

export function sortCatalogProducts(products = [], sort = "relevancia") {
  return [...products].sort((a, b) =>
    sort === "menor"
      ? price(a) - price(b)
      : sort === "maior"
        ? price(b) - price(a)
        : String(a.name || a.id).localeCompare(String(b.name || b.id), "pt-BR", { numeric: true }),
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function catalogQuery(filters = {}, categories = []) {
  for (const key of ["min", "max"]) {
    if (
      filters[key] !== "" &&
      filters[key] != null &&
      (!Number.isFinite(Number(filters[key])) || Number(filters[key]) < 0)
    ) {
      throw new Error("Informe um preço válido.");
    }
  }
  if (
    filters.min !== "" &&
    filters.max !== "" &&
    filters.min != null &&
    filters.max != null &&
    Number(filters.min) > Number(filters.max)
  ) {
    throw new Error("O preço mínimo deve ser menor ou igual ao máximo.");
  }

  const params = new URLSearchParams();
  if (filters.query?.trim()) {
    params.set("q", filters.query.trim());
  }
  if (filters.category) {
    const category = categories.find(
      (c) =>
        c.nome === filters.category ||
        c.name === filters.category ||
        String(c.id) === String(filters.category),
    );
    if (category?.id) {
      params.set("categoria_id", String(category.id));
    } else if (UUID_REGEX.test(String(filters.category))) {
      params.set("categoria_id", String(filters.category));
    } else if (categories.length > 0) {
      throw new Error("Categoria não encontrada. Atualize a página.");
    }
  }
  if (filters.store) {
    params.set("loja_id", String(filters.store));
  }
  if (filters.min !== "" && filters.min != null) {
    params.set("preco_min", String(filters.min));
  }
  if (filters.max !== "" && filters.max != null) {
    params.set("preco_max", String(filters.max));
  }
  return params;
}

export function buildPublicCatalog(rawProducts = []) {
  const products = rawProducts.map((item) => normalizePublicProduct(item));
  const categoryMap = new Map();
  const storeMap = new Map();

  for (const product of products) {
    if (product.categoryId && product.category && !categoryMap.has(product.categoryId)) {
      categoryMap.set(product.categoryId, {
        id: product.categoryId,
        nome: product.category,
        name: product.category,
      });
    }
    if (product.store && !storeMap.has(product.store)) {
      storeMap.set(product.store, {
        id: product.store,
        name: product.storeName || "Loja parceira",
        whatsapp: product.whatsapp || "",
        category: product.category || "",
        description: "",
        address: "",
        hours: "",
        status: "aprovada",
      });
    }
  }

  const categoryRecords = [...categoryMap.values()];
  const categories = [...new Set(categoryRecords.map((c) => c.nome))];
  const stores = [...storeMap.values()];

  return {
    ...emptyCatalog,
    categories,
    categoryRecords,
    stores,
    products,
  };
}

export function createPublicCatalogService(request = apiRequest) {
  async function products(filters = {}, categories = [], signal) {
    const params = catalogQuery(filters, categories);
    const pageSize = 100;
    params.set("limit", String(pageSize));
    const list = [];

    for (let offset = 0; ; offset += pageSize) {
      params.set("offset", String(offset));
      const page = await request(`/produtos?${params.toString()}`, {
        authenticated: false,
        signal,
      });
      const normalizedPage = (page || []).map((item) =>
        normalizePublicProduct(item, categories),
      );
      list.push(...normalizedPage);
      if (!page || page.length < pageSize) break;
    }

    return sortCatalogProducts(list, filters.sort);
  }

  async function load(signal) {
    const allProducts = await products({}, [], signal);
    return buildPublicCatalog(allProducts);
  }

  return {
    products,
    load,
  };
}

export const publicCatalog = createPublicCatalogService();
