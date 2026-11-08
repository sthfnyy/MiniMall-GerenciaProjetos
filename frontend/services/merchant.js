import { apiRequest } from "./api.js";

const PALETTE = ["#ede4d7", "#dce8ed", "#f2e2e9", "#e2e8d9", "#ede0f6", "#fef3c7"];

export function generateInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ml";
  if (parts.length === 1) return parts[0].slice(0, 2).toLowerCase();
  return (parts[0][0] + parts[1][0]).toLowerCase();
}

export function generateColor(id = "") {
  const size = String(id).length;
  return PALETTE[size % PALETTE.length];
}

function hoursText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.descricao || value.texto || "";
}

export function normalizeStoreFromApi(apiStore) {
  if (!apiStore) return null;
  const address = [
    apiStore.endereco_logradouro,
    apiStore.endereco_numero,
    apiStore.endereco_bairro,
    apiStore.endereco_cidade && apiStore.endereco_uf
      ? `${apiStore.endereco_cidade} – ${apiStore.endereco_uf}`
      : apiStore.endereco_cidade || apiStore.endereco_uf,
    apiStore.endereco_cep,
  ].filter(Boolean).join(", ");
  return {
    ...apiStore,
    name: apiStore.nome_loja || "",
    description: apiStore.descricao || "",
    address,
    hours: hoursText(apiStore.horario_funcionamento),
    initials: generateInitials(apiStore.nome_loja || ""),
    color: generateColor(apiStore.id),
  };
}

export function validateStoreData(values = {}) {
  const clean = {
    nome_loja: values.nome_loja?.trim() || "",
    descricao: values.descricao?.trim() || "",
    endereco_logradouro: values.endereco_logradouro?.trim() || "",
    endereco_numero: values.endereco_numero?.trim() || "",
    endereco_bairro: values.endereco_bairro?.trim() || "",
    endereco_cidade: values.endereco_cidade?.trim() || "",
    endereco_uf: values.endereco_uf?.trim().toUpperCase() || "",
    endereco_cep: values.endereco_cep?.trim() || "",
    whatsapp: values.whatsapp?.trim() || "",
    instagram: values.instagram?.trim() || "",
    facebook: values.facebook?.trim() || "",
    logo_url: values.logo_url?.trim() || "",
    hours: hoursText(values.horario_funcionamento).trim(),
  };
  if (clean.nome_loja.length < 2) throw new Error("Informe o nome da loja (mínimo de 2 caracteres).");
  if (clean.whatsapp.length < 8) throw new Error("Informe um número de WhatsApp válido.");
  if (!clean.endereco_logradouro || clean.endereco_logradouro.length < 3) throw new Error("Informe a localização ou endereço da loja.");
  if (!clean.endereco_cidade) throw new Error("Informe a cidade da loja.");
  if (!/^[A-Z]{2}$/.test(clean.endereco_uf)) throw new Error("Informe a UF com 2 caracteres.");
  if (clean.logo_url && !/^https?:\/\//i.test(clean.logo_url)) throw new Error("Informe uma URL de logo com http ou https.");
  return clean;
}

export function storePayload(values) {
  const clean = validateStoreData(values);
  return {
    nome_loja: clean.nome_loja,
    descricao: clean.descricao || null,
    endereco_logradouro: clean.endereco_logradouro || null,
    endereco_numero: clean.endereco_numero || null,
    endereco_bairro: clean.endereco_bairro || null,
    endereco_cidade: clean.endereco_cidade,
    endereco_uf: clean.endereco_uf,
    endereco_cep: clean.endereco_cep || null,
    horario_funcionamento: clean.hours ? { descricao: clean.hours } : null,
    whatsapp: clean.whatsapp,
    instagram: clean.instagram || null,
    facebook: clean.facebook || null,
    logo_url: clean.logo_url || null,
  };
}

export async function fetchMerchantStore(request = apiRequest) {
  try {
    return normalizeStoreFromApi(await request("/lojista/loja"));
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function createMerchantStore(values, request = apiRequest) {
  const response = await request("/lojista/loja", { method: "POST", body: JSON.stringify(storePayload(values)) });
  return normalizeStoreFromApi(response);
}

export async function updateMerchantStore(values, request = apiRequest) {
  const response = await request("/lojista/loja", { method: "PATCH", body: JSON.stringify(storePayload(values)) });
  return normalizeStoreFromApi(response);
}

export async function requestStoreApproval(request = apiRequest) {
  return normalizeStoreFromApi(await request("/lojista/loja/solicitar-aprovacao", { method: "POST" }));
}
