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
    // Preço promocional: exibido em destaque com o regular riscado.
    sale: Number(product.preco_promocional ?? product.sale ?? 0) || 0,
    preco_promocional: product.preco_promocional == null ? null : Number(product.preco_promocional),
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

function hoursText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.descricao || value.texto || Object.entries(value).map(([day, hours]) => `${day}: ${hours}`).join(" · ");
}

export function storeAddress(store = {}) {
  const street = [store.endereco_logradouro, store.endereco_numero].filter(Boolean).join(", ");
  const city = store.endereco_cidade && store.endereco_uf
    ? `${store.endereco_cidade} – ${store.endereco_uf}`
    : store.endereco_cidade || store.endereco_uf || "";
  return [street, store.endereco_bairro, city, store.endereco_cep].filter(Boolean).join(", ");
}

export function safeExternalUrl(value, allowedHosts = []) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const handle = raw.replace(/^@/, "");
  const url = /^https?:\/\//i.test(raw) ? raw : allowedHosts[0] && /^[\w.]+$/.test(handle) ? `https://${allowedHosts[0]}/${handle}` : "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    if (allowedHosts.length && !allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

// Loja pública vinda de GET /lojas (somente dados comerciais).
export function normalizePublicStore(store = {}, products = []) {
  const id = String(store.id);
  const categories = products.filter((product) => product.store === id).map((product) => product.category).filter(Boolean);
  const mainCategory = categories.sort((a, b) => categories.filter((c) => c === b).length - categories.filter((c) => c === a).length)[0] || "";
  const address = storeAddress(store);
  return {
    id,
    name: store.nome_loja || "Loja parceira",
    description: store.descricao || "",
    address,
    hours: hoursText(store.horario_funcionamento),
    whatsapp: store.whatsapp || "",
    instagram: safeExternalUrl(store.instagram, ["instagram.com"]),
    facebook: safeExternalUrl(store.facebook, ["facebook.com"]),
    logo_url: sanitizeImageUrl(store.logo_url),
    mapsUrl: address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "",
    rating: store.media_avaliacoes == null ? null : Number(store.media_avaliacoes),
    reviewCount: Number(store.total_avaliacoes || 0),
    productCount: Number(store.total_produtos || 0),
    category: mainCategory,
    status: "aprovada",
  };
}

export function buildPublicCatalog(rawProducts = [], rawStores = null) {
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
  // Com GET /lojas, todas as lojas aprovadas aparecem (inclusive sem produtos);
  // sem ele, as lojas são deduzidas dos produtos publicados.
  const stores = Array.isArray(rawStores)
    ? rawStores.map((store) => normalizePublicStore(store, products))
    : [...storeMap.values()];

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

  async function stores(signal) {
    try {
      const response = await request("/lojas", { authenticated: false, signal });
      return Array.isArray(response) ? response : null;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return null;
    }
  }

  async function load(signal) {
    const [allProducts, allStores] = await Promise.all([products({}, [], signal), stores(signal)]);
    return buildPublicCatalog(allProducts, allStores);
  }

  return {
    products,
    stores,
    load,
  };
}

export const publicCatalog = createPublicCatalogService();
