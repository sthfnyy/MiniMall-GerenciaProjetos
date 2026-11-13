import { apiRequest } from "./api.js";

export function categoryName(value = "") {
  const name = String(value || "").trim();
  if (!name) {
    throw new Error("Informe o nome da categoria.");
  }
  if (name.length < 2 || name.length > 100) {
    throw new Error("O nome da categoria deve ter entre 2 e 100 caracteres.");
  }
  return name;
}

export async function getAdminCategories(request = apiRequest) {
  return request("/admin/categorias");
}

export async function createAdminCategory(nome, request = apiRequest) {
  const cleanName = categoryName(nome);
  return request("/admin/categorias", {
    method: "POST",
    body: JSON.stringify({ nome: cleanName }),
  });
}

export async function updateAdminCategory(id, nome, request = apiRequest) {
  const cleanName = categoryName(nome);
  return request(`/admin/categorias/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ nome: cleanName }),
  });
}

export async function deleteAdminCategory(id, request = apiRequest) {
  return request(`/admin/categorias/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getAdminReviews(lojaId = null, request = apiRequest) {
  const query = lojaId ? `?loja_id=${encodeURIComponent(lojaId)}` : "";
  return request(`/admin/moderacao/avaliacoes${query}`);
}

export async function deleteAdminReview(id, request = apiRequest) {
  return request(`/admin/moderacao/avaliacoes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function deleteAdminReviewPhoto(id, request = apiRequest) {
  return request(`/admin/moderacao/avaliacao-fotos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function createAdminService(request = apiRequest) {
  return {
    categories: () => getAdminCategories(request),
    saveCategory(name, id) {
      return id
        ? updateAdminCategory(id, name, request)
        : createAdminCategory(name, request);
    },
    deleteCategory: (id) => deleteAdminCategory(id, request),
    reviews: (lojaId = null) => getAdminReviews(lojaId, request),
    deleteReview: (id) => deleteAdminReview(id, request),
    deleteReviewPhoto: (id) => deleteAdminReviewPhoto(id, request),
  };
}

export const adminApi = createAdminService();
