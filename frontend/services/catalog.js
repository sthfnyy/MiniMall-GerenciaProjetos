export const money = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const price = (product) => Number(product?.preco_base || 0);

export const normalize = (text = "") =>
  text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
