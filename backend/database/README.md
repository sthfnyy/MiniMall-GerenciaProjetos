# Banco de dados (Supabase / PostgreSQL)

O MiniMall usa um esquema já existente no Supabase. Este backend **não cria tabelas**: ele pressupõe a estrutura abaixo.

## Tabelas usadas pela API

`profiles`, `lojas`, `categorias`, `produtos` (inclui `preco_promocional`),
`avaliacoes`, `avaliacao_fotos`, `pontos_transacoes`, `favoritos`,
`intencoes_compra` e `auth.users` (Supabase Auth).

## Triggers e objetos necessários (existentes no banco)

| Objeto | Efeito | Observação |
|---|---|---|
| `on_auth_user_created` → `handle_new_user()` | cria `profiles` com papel `consumidor` | o cadastro (`POST /auth/register`) aplica em seguida o papel escolhido |
| `trg_creditar_pontos_avaliacao` (AFTER INSERT em `avaliacoes`) | credita 10 pontos | o backend detecta o crédito e não duplica |
| `trg_promover_a_lojista` (AFTER INSERT em `lojas`) | promove o dono a lojista | hoje só lojistas criam loja (`require_lojista`) |
| `trg_proteger_status_loja` (BEFORE UPDATE em `lojas`) | preenche `aprovado_em` | — |
| enum `status_intencao_compra` | `contato_realizado`, `compra_confirmada`, `compra_nao_reconhecida` | exibidos como Pendente / Confirmada / Rejeitada |
| bucket `fotos-avaliacoes` (público) | fotos das avaliações | upload/remoção pelo backend com a service_role |

## Papéis

- **Consumidor / Lojista**: escolhidos no cadastro público.
- **Administrador**: nunca pelo cadastro público. Promoção manual e restrita:
  `update public.profiles set role = 'admin' where id = '<uuid-do-usuario>';`

## Manutenção

- `relatorio_pontos_orfaos.sql`: relatório (somente leitura) de créditos de pontos
  órfãos gerados antes da correção da moderação, com a correção comentada para revisão.
