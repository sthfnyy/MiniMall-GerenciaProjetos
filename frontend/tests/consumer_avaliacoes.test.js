import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { canAccessRoute } from "../services/auth.js";
import {
  appendReviewPhoto,
  createConsumerReview,
  deleteConsumerReviewPhoto,
  friendlyReviewError,
  getReviewPhotos,
  isBackendStoreId,
  listConsumerReviews,
  listStoreReviews,
  MAX_REVIEW_PHOTO_SIZE,
  normalizeStoreReview,
  publishConsumerReview,
  uploadConsumerReviewPhoto,
  validateConsumerReviewPhoto,
  validateReviewInput,
} from "../services/reviews.js";

const STORE_ID = "55c27b92-8108-4fb2-9ad0-28fc2441548c";
const consumer = { id: "consumer-uuid", role: "consumidor", name: "Ana" };
const store = { id: STORE_ID, name: "Flor de Lis" };
const image = (type = "image/jpeg") => new Blob(["image"], { type });
const httpError = (status, message = "Not Found") => {
  const error = new Error(message);
  error.status = status;
  return error;
};
const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Testes de avaliações do consumidor
// ---------------------------------------------------------------------------

test("API de avaliações lista somente pelo endpoint autenticado do consumidor", async () => {
  const calls = [];
  const reviews = [{ id: "review-1", nota: 5 }];
  const request = async (...args) => {
    calls.push(args);
    return reviews;
  };

  assert.deepEqual(await listConsumerReviews(request), reviews);
  assert.deepEqual(calls, [["/consumidor/avaliacoes"]]);
});

test("API lista e normaliza avaliações da loja selecionada", async () => {
  const calls = [];
  const reviews = await listStoreReviews(STORE_ID, async (...args) => {
    calls.push(args);
    return [{
      id: "review-1",
      loja_id: STORE_ID,
      nota: 5,
      comentario: "Excelente",
      consumidor_nome: "Ana",
      criado_em: "2026-11-09T12:00:00Z",
      foto_url: "",
      fotos: [{ id: "photo-1", url: "https://cdn.invalid/photo.jpg" }],
    }];
  });

  // Leitura pública: não exige login (GET /lojas/{id}/avaliacoes).
  assert.deepEqual(calls, [[`/lojas/${STORE_ID}/avaliacoes`, { authenticated: false }]]);
  assert.deepEqual(reviews[0], {
    id: "review-1",
    store: STORE_ID,
    name: "Ana",
    rating: 5,
    comment: "Excelente",
    photo: "",
    photos: [{ id: "photo-1", url: "https://cdn.invalid/photo.jpg" }],
    date: "2026-11-09T12:00:00Z",
  });
});

test("normalização da avaliação pública aceita campos legados", () => {
  const review = normalizeStoreReview({
    id: 1,
    store: 2,
    name: "Maria",
    rating: 4,
    comment: "Boa loja",
    photo: "/foto.jpg",
    date: "2026-11-09",
  });

  assert.equal(review.store, 2);
  assert.equal(review.name, "Maria");
  assert.deepEqual(review.photos, [{ id: "legacy-1", url: "/foto.jpg" }]);
});

test("API cria avaliação sem enviar usuário ou pontuação no payload", async () => {
  const calls = [];
  const request = async (...args) => {
    calls.push(args);
    return { id: "review-1" };
  };

  await createConsumerReview(
    {
      loja_id: STORE_ID,
      nota: 5,
      comentario: "Ótimo atendimento",
      usuario_id: "outro-usuario",
      quantidade: 999,
      pontos: 999,
    },
    request,
  );

  assert.equal(calls[0][0], "/consumidor/avaliacoes");
  assert.equal(calls[0][1].method, "POST");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    loja_id: STORE_ID,
    nota: 5,
    comentario: "Ótimo atendimento",
  });
});

test("erros da API de avaliações são propagados para tratamento da tela", async () => {
  await assert.rejects(
    listConsumerReviews(async () => {
      throw new Error("Falha ao carregar avaliações");
    }),
    /Falha ao carregar avaliações/,
  );
});

test("fotos usa fotos[] da API e mantém fallback de foto_url", () => {
  assert.deepEqual(
    getReviewPhotos({
      id: "real",
      foto_url: "https://legacy.invalid/foto.jpg",
      fotos: [
        { id: "photo-1", url: "https://cdn.invalid/1.jpg" },
        { id: "sem-url" },
      ],
    }),
    [{ id: "photo-1", url: "https://cdn.invalid/1.jpg" }],
  );
  assert.deepEqual(
    getReviewPhotos({ id: 101, photo: "/images/review.jpg" }),
    [{ id: "legacy-101", url: "/images/review.jpg" }],
  );
  assert.deepEqual(getReviewPhotos({ id: "empty", fotos: [] }), []);
});

test("somente UUID de loja é compatível com a API real de avaliações", () => {
  assert.equal(isBackendStoreId(STORE_ID), true);
  assert.equal(isBackendStoreId(1), false);
  assert.equal(isBackendStoreId("loja-1"), false);
  assert.equal(isBackendStoreId(null), false);
});

test("upload de foto usa POST com FormData e sem Content-Type manual", async () => {
  const calls = [];
  const file = image();
  const returnedPhoto = { id: "photo-1", url: "https://cdn.invalid/1.jpg" };
  const request = async (...args) => {
    calls.push(args);
    return returnedPhoto;
  };

  assert.deepEqual(await uploadConsumerReviewPhoto("review-1", file, request), returnedPhoto);
  assert.equal(calls[0][0], "/consumidor/avaliacoes/review-1/fotos");
  assert.equal(calls[0][1].method, "POST");
  assert.ok(calls[0][1].body instanceof FormData);
  assert.equal(calls[0][1].body.get("arquivo").type, file.type);
  assert.equal(calls[0][1].body.get("arquivo").size, file.size);
  assert.equal(calls[0][1].body.has("file"), false);
  assert.equal(calls[0][1].headers, undefined);
});

test("remoção de foto usa o DELETE da avaliação e foto corretas", async () => {
  const calls = [];
  await deleteConsumerReviewPhoto("review-1", "photo-1", async (...args) => {
    calls.push(args);
    return null;
  });

  assert.deepEqual(calls, [[
    "/consumidor/avaliacoes/review-1/fotos/photo-1",
    { method: "DELETE" },
  ]]);
});

test("foto maior que 5 MB é rejeitada antes da API", async () => {
  let requested = false;
  const file = { type: "image/jpeg", size: MAX_REVIEW_PHOTO_SIZE + 1 };

  await assert.rejects(
    uploadConsumerReviewPhoto("review-1", file, async () => {
      requested = true;
    }),
    /máximo 5 MB/,
  );
  assert.equal(requested, false);
});

test("limite de 3 fotos é validado antes do upload", () => {
  assert.throws(
    () => validateConsumerReviewPhoto({ type: "image/png", size: 100 }, 3),
    /no máximo 3 fotos/,
  );
});

test("foto só aparece no estado depois que o upload tem sucesso", async () => {
  const initial = [{ id: "review-1", fotos: [] }];
  const photo = { id: "photo-1", url: "https://cdn.invalid/1.jpg" };
  const saved = await uploadConsumerReviewPhoto("review-1", image("image/png"), async () => photo);
  const updated = appendReviewPhoto(initial, "review-1", saved);

  assert.deepEqual(initial[0].fotos, []);
  assert.deepEqual(updated[0].fotos, [photo]);
});

test("erro no upload não adiciona foto ao estado", async () => {
  const initial = [{ id: "review-1", fotos: [] }];

  await assert.rejects(
    uploadConsumerReviewPhoto("review-1", image("image/png"), async () => {
      throw new Error("Falha de rede");
    }),
    /Falha de rede/,
  );
  assert.deepEqual(initial[0].fotos, []);
});

test("todas as fotos retornadas em fotos[] ficam disponíveis para renderização", () => {
  const photos = getReviewPhotos({
    id: "review-1",
    fotos: [
      { id: "photo-1", url: "https://cdn.invalid/1.jpg" },
      { id: "photo-2", url: "https://cdn.invalid/2.jpg" },
      { id: "photo-3", url: "https://cdn.invalid/3.webp" },
    ],
  });

  assert.deepEqual(photos.map((photo) => photo.id), ["photo-1", "photo-2", "photo-3"]);
});

// ---------------------------------------------------------------------------
// Testes novos: lacunas completadas em Gerência
// ---------------------------------------------------------------------------

test("publicação envia nota, comentário e loja corretos e depois as fotos", async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push([path, options]);
    if (path === "/consumidor/avaliacoes") {
      return { id: "review-1", loja_id: STORE_ID, nota: 4, comentario: "Muito bom", fotos: [] };
    }
    return { id: `photo-${calls.length}`, url: `https://cdn.invalid/${calls.length}.jpg` };
  };

  const result = await publishConsumerReview(
    { user: consumer, store, rating: 4, comment: "  Muito bom  ", photos: [image(), image("image/webp")] },
    request,
  );

  assert.equal(calls[0][0], "/consumidor/avaliacoes");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    loja_id: STORE_ID,
    nota: 4,
    comentario: "Muito bom",
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.slice(1).map(([path]) => path), [
    "/consumidor/avaliacoes/review-1/fotos",
    "/consumidor/avaliacoes/review-1/fotos",
  ]);
  assert.ok(calls.slice(1).every(([, options]) => options.body.get("arquivo")));
  assert.equal(result.review.fotos.length, 2);
  assert.deepEqual(result.failedPhotos, []);
});

test("publicação não envia identificador do consumidor (sem publicar por outro usuário)", async () => {
  let body;
  await publishConsumerReview(
    { user: { ...consumer, id: "outro-usuario" }, store, rating: 5, comment: "Ok" },
    async (_path, options) => {
      body = JSON.parse(options.body);
      return { id: "review-1" };
    },
  );

  assert.equal("usuario_id" in body, false);
  assert.equal(Object.values(body).includes("outro-usuario"), false);
});

test("publicação sem fotos continua válida", async () => {
  const calls = [];
  const result = await publishConsumerReview(
    { user: consumer, store, rating: 5, comment: "Ótimo" },
    async (...args) => {
      calls.push(args);
      return { id: "review-1" };
    },
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(result.uploadedPhotos, []);
});

test("usuário não autenticado, lojista e admin não publicam avaliação", async () => {
  let requested = false;
  const request = async () => {
    requested = true;
  };

  for (const user of [null, { role: "lojista" }, { role: "admin" }]) {
    await assert.rejects(
      publishConsumerReview({ user, store, rating: 5, comment: "Ok" }, request),
      /Somente consumidores/,
    );
  }
  assert.equal(requested, false);
});

test("nota, comentário, loja e fotos inválidos são rejeitados antes da API", () => {
  const base = { user: consumer, store, rating: 5, comment: "Ok" };

  assert.throws(() => validateReviewInput({ ...base, rating: 0 }), /nota de 1 a 5/);
  assert.throws(() => validateReviewInput({ ...base, rating: 6 }), /nota de 1 a 5/);
  assert.throws(() => validateReviewInput({ ...base, comment: "   " }), /comentário/);
  assert.throws(() => validateReviewInput({ ...base, store: null }), /Loja não encontrada/);
  assert.throws(() => validateReviewInput({ ...base, store: { id: 1 } }), /não está disponível/);
  assert.throws(
    () => validateReviewInput({ ...base, photos: [image(), image(), image(), image()] }),
    /no máximo 3 fotos/,
  );
  assert.throws(
    () => validateReviewInput({ ...base, photos: [image("image/gif")] }),
    /JPEG, PNG ou WebP/,
  );
});

test("falha no envio de foto preserva a avaliação criada e informa a foto não enviada", async () => {
  const result = await publishConsumerReview(
    { user: consumer, store, rating: 5, comment: "Ok", photos: [image()] },
    async (path) => {
      if (path === "/consumidor/avaliacoes") return { id: "review-1" };
      throw httpError(415, "Formato de imagem não permitido");
    },
  );

  assert.equal(result.review.id, "review-1");
  assert.equal(result.failedPhotos.length, 1);
  assert.match(result.failedPhotos[0].error.message, /não é uma imagem válida/);
});

test("erro ao criar avaliação é exibido e nenhuma foto é enviada", async () => {
  const calls = [];
  await assert.rejects(
    publishConsumerReview(
      { user: consumer, store, rating: 5, comment: "Ok", photos: [image()] },
      async (path) => {
        calls.push(path);
        throw new Error("Não foi possível conectar ao MiniMall.");
      },
    ),
    /Não foi possível conectar/,
  );
  assert.deepEqual(calls, ["/consumidor/avaliacoes"]);
});

test("respostas 401, 403, 404 e 422 viram mensagens adequadas", async () => {
  const cases = [
    [401, /sessão expirou/],
    [403, /Somente consumidores/],
    [404, /não encontrada|não está disponível/],
    [422, /nota \(1 a 5\) e o comentário/],
  ];

  for (const [status, message] of cases) {
    await assert.rejects(
      createConsumerReview({ loja_id: STORE_ID, nota: 5, comentario: "Ok" }, async () => {
        throw httpError(status);
      }),
      (error) => message.test(error.message) && error.status === status,
    );
    await assert.rejects(listConsumerReviews(async () => { throw httpError(status); }), message);
    await assert.rejects(listStoreReviews(STORE_ID, async () => { throw httpError(status); }), message);
  }

  assert.match(friendlyReviewError(new Error("Erro na API: HTTP 404")).message, /não encontrada/);
});

test("erros de foto 401/403/404/422 são traduzidos", async () => {
  const cases = [
    [401, /sessão expirou/],
    [403, /consumidor autor/],
    [404, /não foi encontrada/],
    [409, /limite de 3 fotos/],
    [413, /máximo 5 MB/],
    [422, /não é uma imagem válida/],
  ];

  for (const [status, message] of cases) {
    await assert.rejects(
      uploadConsumerReviewPhoto("review-1", image(), async () => {
        throw httpError(status);
      }),
      message,
    );
  }
});

test("avaliação criada aparece depois na listagem do consumidor e da loja", async () => {
  const saved = [];
  const request = async (path, options = {}) => {
    if (path === "/consumidor/avaliacoes" && options.method === "POST") {
      const body = JSON.parse(options.body);
      const review = { id: "review-1", ...body, foto_url: "", criado_em: "2026-11-22T12:00:00Z", fotos: [] };
      saved.push(review);
      return review;
    }
    if (path.endsWith("/fotos")) {
      const photo = { id: "photo-1", url: "https://cdn.invalid/1.jpg", criado_em: "2026-11-22T12:00:01Z" };
      saved[0].fotos.push(photo);
      return photo;
    }
    if (path === "/consumidor/avaliacoes") return saved;
    if (path === `/lojas/${STORE_ID}/avaliacoes`) {
      return saved.map((review) => ({ ...review, consumidor_nome: "Ana" }));
    }
    throw httpError(404);
  };

  await publishConsumerReview(
    { user: consumer, store, rating: 5, comment: "Recomendo", photos: [image()] },
    request,
  );

  const mine = await listConsumerReviews(request);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].loja_id, STORE_ID);
  assert.equal(mine[0].comentario, "Recomendo");
  assert.equal(getReviewPhotos(mine[0]).length, 1);

  const storeReviews = await listStoreReviews(STORE_ID, request);
  assert.equal(storeReviews[0].rating, 5);
  assert.equal(storeReviews[0].store, STORE_ID);
  assert.equal(storeReviews[0].photos[0].url, "https://cdn.invalid/1.jpg");
});

test("listagem vazia e resposta inesperada retornam lista vazia", async () => {
  assert.deepEqual(await listConsumerReviews(async () => []), []);
  assert.deepEqual(await listConsumerReviews(async () => null), []);
  assert.deepEqual(await listStoreReviews(STORE_ID, async () => []), []);
});

test("rotas de avaliação respeitam a matriz de autorização por role", () => {
  const route = `consumidor/avaliar/${STORE_ID}`;

  assert.equal(canAccessRoute(route, { role: "consumidor" }), true);
  assert.equal(canAccessRoute("consumidor/avaliacoes", { role: "consumidor" }), true);
  for (const user of [null, { role: "lojista" }, { role: "admin" }]) {
    assert.equal(canAccessRoute(route, user), false);
    assert.equal(canAccessRoute("consumidor/avaliacoes", user), false);
  }
  assert.equal(canAccessRoute("lojista/avaliacoes", { role: "lojista" }), true);
  assert.equal(canAccessRoute("lojista/avaliacoes", { role: "consumidor" }), false);
  assert.equal(canAccessRoute("lojista/avaliacoes", { role: "admin" }), false);
});

test("App registra as rotas de avaliação", async () => {
  const app = await source("../App.jsx");

  assert.match(app, /route === `consumidor\/avaliar\/\$\{s\.id\}`/);
  assert.match(app, /route === "consumidor\/avaliacoes" && <ConsumerReviews/);
  assert.match(app, /route === "lojista\/avaliacoes" && <StoreReviews/);
  assert.match(app, /reviewStore && <ReviewForm/);
  assert.match(app, /"consumidor\/avaliacoes", "consumidor\/compras", "lojista\/avaliacoes", "lojista\/compras"\]\.includes\(route\)/);
  assert.match(app, /route === "consumidor\/compras" && <ConsumerPurchases/);
  assert.match(app, /route === "lojista\/compras" && <PurchaseConfirmations/);
  assert.match(app, /const restricted = !canAccessRoute\(route, user\)/);
});

test("formulário de avaliação oferece fotos com preview, remoção e carregamento", async () => {
  const form = await source("../views/consumer/ReviewForm.jsx");
  const upload = await source("../components/PhotoUploadButton.jsx");

  assert.match(form, /<PhotoUploadButton/);
  assert.match(upload, /type="file"/);
  assert.match(upload, /Adicionar fotos/);
  assert.match(upload, /Até 3 fotos\. JPEG, PNG ou WebP\. Máximo de 5 MB por imagem\./);
  assert.match(form, /photo-thumb-remove/);
  assert.match(form, /Limite de \{MAX_REVIEW_PHOTOS\} fotos atingido/);
  assert.match(form, /URL\.createObjectURL/);
  assert.match(form, /URL\.revokeObjectURL/);
  assert.match(form, /Remover foto \$\{index \+ 1\}/);
  assert.match(form, /Publicando/);
  assert.match(form, /role="alert"/);
  assert.doesNotMatch(form, /localStorage|readAsDataURL/);
});

test("telas de avaliação usam somente a API, sem dados locais", async () => {
  for (const path of [
    "../views/consumer/ConsumerReviews.jsx",
    "../views/merchant/StoreReviews.jsx",
    "../views/StorePage.jsx",
    "../services/reviews.js",
  ]) {
    const code = await source(path);
    assert.doesNotMatch(code, /useRealApi|localStorage|data\.reviews|data\?\.reviews|publishReview\(/, path);
  }
});
