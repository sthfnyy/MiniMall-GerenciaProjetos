import { apiRequest } from "./api.js";

// Perfil do consumidor:
// GET/PATCH /consumidor/perfil. Somente nome e telefone são editáveis aqui;
// papel, identificador e e-mail não fazem parte do payload.
export function validateProfile(values = {}) {
  const nome = String(values.nome_completo || "").trim();
  if (nome.length < 2) throw new Error("Informe seu nome completo (mínimo de 2 caracteres).");
  if (nome.length > 150) throw new Error("O nome deve ter no máximo 150 caracteres.");
  const telefone = String(values.telefone || "").trim();
  const digits = telefone.replace(/\D/g, "");
  if (telefone && (digits.length < 10 || digits.length > 13)) {
    throw new Error("Informe um telefone com DDD (10 a 13 dígitos).");
  }
  return { nome_completo: nome, telefone: telefone || null };
}

export async function getConsumerProfile(request = apiRequest) {
  return request("/consumidor/perfil");
}

export async function updateConsumerProfile(values, request = apiRequest) {
  return request("/consumidor/perfil", {
    method: "PATCH",
    body: JSON.stringify(validateProfile(values)),
  });
}
