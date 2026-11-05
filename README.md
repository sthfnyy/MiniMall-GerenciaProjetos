# MiniMall — Gerência de Projetos

Vitrine de produtos e lojas locais, com front-end React/Vite e API FastAPI.

## Executar

1. Crie o ambiente Python e instale `backend/requirements.txt`.
2. Copie `backend/.env.example` para `backend/.env` e configure o banco e o Supabase.
3. Na raiz, execute `python -m uvicorn backend.main:app --reload`.
4. Em `frontend`, execute `npm ci`, copie `.env.example` para `.env` e configure as variáveis públicas.
5. Em `frontend`, execute `npm run dev` e abra o endereço informado.

O front-end e a API devem apontar para o **mesmo projeto Supabase**. Use apenas a chave pública/anon no navegador. As tabelas e os perfis precisam estar provisionados no banco; a aplicação não cria nem altera o banco de produção automaticamente.

## Funcionalidades

- Cadastro, confirmação de e-mail, login, sessão e navegação por perfil (#23).
- Cadastro, consulta e edição da loja; acompanhamento da aprovação (#24).
- Cadastro, listagem, edição, ativação/inativação e exclusão de produtos (#25).
- Vitrine sem login, busca, filtros de categoria/loja/preço e ordenação (#10).
- Contato pelo WhatsApp da loja com produto, preço e link na mensagem (#11).
- Administração de categorias e moderação de avaliações (#13).
- Layout adaptado para celular, filtros acessíveis e tabelas com rolagem interna (#16).

O cadastro cria uma conta comum. Ao cadastrar uma loja, a API atribui o perfil de lojista. O perfil `admin` deve ser concedido por um administrador do banco. Somente lojas aprovadas e produtos ativos aparecem na vitrine. A aprovação das lojas segue o processo do back-end; a interface desta entrega usa as rotas de categorias e moderação disponíveis nesta API.

As telas desta entrega atendem ao escopo das issues listadas. Avaliações do consumidor, pontos e favoritos não são expostos na navegação, pois suas APIs não fazem parte deste repositório.

## Verificação

Em `frontend`:

```sh
npm test
npm run build
```

Na raiz, com o ambiente Python ativo:

```sh
DATABASE_URL=postgresql+asyncpg://test:test@127.0.0.1/test SUPABASE_JWT_SECRET=test-only python -m unittest discover -s backend/tests -v
```

Os testes usam substitutos do provedor de autenticação e banco SQLite isolado. Não é necessário disponibilizar credenciais reais para executar a suíte. Veja [as entregas e evidências](docs/TAREFAS-FRONTEND.md).

## Licença

MIT. Consulte [LICENSE](LICENSE).
