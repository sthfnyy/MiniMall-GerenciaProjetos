# Entregas do front-end

| Issue | Entrega |
| --- | --- |
| #23 | Cadastro, login, sessão e acesso por perfil |
| #24 | Cadastro, consulta e edição da loja |
| #25 | Cadastro, consulta, edição e exclusão de produtos |
| #10 | Vitrine pública, busca e filtros |
| #11 | Contato com a loja pelo WhatsApp |
| #13 | Categorias e moderação administrativa |
| #16 | Responsividade das telas da Iteração 2 |

As entregas são registradas em commits separados, com referência à issue correspondente.

## Validação no navegador

A inspeção manual utilizou a aplicação React e os controladores reais da API com banco SQLite temporário. Apenas a identificação das contas foi substituída por um provedor local de teste. Nenhuma conta ou dado de produção foi alterado.

Fluxos conferidos:

- Cadastro com estado de confirmação de e-mail, login como lojista e administrador e encerramento da sessão.
- Cadastro de loja por uma conta nova, atualização do perfil para lojista e bloqueio da administração para uma conta comum.
- Consulta e edição da loja com confirmação do servidor.
- Cadastro, edição de preço e exclusão de um produto de teste.
- Cadastro, edição e exclusão de uma categoria de teste.
- Consulta e remoção de uma avaliação na área de moderação, seguida do estado sem avaliações.
- Filtro de preço e abertura de um produto a partir do resultado.
- Destino do WhatsApp, nome da loja, preço, nome e link do produto na mensagem.
- Telas de loja, produtos, categorias, filtros e detalhes em larguras de 320 e 375 px sem transbordamento horizontal da página.

![Categorias no celular](evidencias/frontend/admin-mobile.jpg)
![Vitrine no celular](evidencias/frontend/vitrine-mobile.jpg)

A confirmação de e-mail, a renovação de sessão pelo Supabase e as operações no banco remoto dependem das configurações reais do ambiente. A suíte automatizada cobre as respostas e os erros esperados; esses serviços externos não foram exercitados com credenciais reais.

## Reproduzir a prévia isolada

Na raiz, com as dependências Python instaladas:

```sh
DATABASE_URL=postgresql+asyncpg://test:test@127.0.0.1/test SUPABASE_JWT_SECRET=test-only python -m uvicorn backend.tests.preview_app:app --host 127.0.0.1 --port 8100
```

Em outro terminal, dentro de `frontend`:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:8100 VITE_SUPABASE_ANON_KEY=preview-public-key VITE_API_URL=http://127.0.0.1:8100 npm run dev -- --port 5173 --strictPort
```

Contas fictícias: `lojista@teste.local`, `admin@teste.local` e `consumidor@teste.local`. Senha exclusiva dessa prévia: `Teste1234!`. Os dados são recriados em memória ao reiniciar. O módulo `backend.tests.preview_app` é somente para validação local; o comando normal da aplicação continua sendo `backend.main:app`.

## Resultado automatizado — 05/11/2026

- 26 testes do front-end aprovados.
- 67 testes da API aprovados, incluindo assinatura ES256, emissor configurado, catálogo público e proteção por perfil.
- Compilação de produção do front-end aprovada.
- `git diff --check` sem erros.
- Workflow `Validação MiniMall` configurado para executar os testes e a compilação em pushes e Pull Requests.

Os resultados acima correspondem à execução local. O resultado do workflow remoto é apresentado separadamente pelo GitHub.
