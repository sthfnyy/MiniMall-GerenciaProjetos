# 🛍️ MiniMall — Shopping Local Online

O **MiniMall** é uma plataforma web desenvolvida com o objetivo de aproximar consumidores e estabelecimentos do comércio local.

A aplicação funciona como uma **vitrine digital**, permitindo que lojistas divulguem seus estabelecimentos e produtos, enquanto consumidores podem pesquisar itens, consultar lojas, entrar em contato diretamente com os comerciantes e utilizar funcionalidades de interação, como avaliações, pontos e favoritos.

O projeto foi desenvolvido no contexto da disciplina de **Gerência de Projetos**, utilizando práticas de planejamento e acompanhamento baseadas no **PMBOK 7ª Edição** e uma abordagem ágil adaptada ao contexto acadêmico.

---

## 🎯 Objetivo

O MiniMall busca facilitar a divulgação e a descoberta de produtos comercializados localmente.

Entre os principais objetivos estão:

- aumentar a visibilidade dos estabelecimentos locais;
- organizar a divulgação de produtos;
- facilitar a pesquisa e comparação de itens;
- oferecer acesso às informações dos estabelecimentos;
- permitir contato direto com lojistas pelo WhatsApp;
- disponibilizar avaliações e comentários sobre estabelecimentos;
- permitir o acompanhamento de pontos e recompensas;
- permitir que consumidores salvem produtos como favoritos.

O MiniMall não realiza pagamentos ou entregas. As negociações permanecem sob responsabilidade do consumidor e do estabelecimento.

---

## 👥 Equipe

| Integrante | Papel |
|---|---|
| **Sthefany Moura Godinho** | Gerente de Projetos / apoio ao Front-end |
| **Caio Rubens Feitosa** | Desenvolvedor Front-end |
| **Rober Batista Sousa Sá** | Desenvolvedor Back-end |
| **Eurikelly Luiza Alves Delmondes** | Designer UX/UI / apoio ao Front-end |

Durante o desenvolvimento, algumas atividades de Front-end precisaram ser redistribuídas devido à indisponibilidade do integrante originalmente responsável. Parte dessas atividades foi assumida por **Sthefany** e **Eurikelly** para preservar as entregas previstas.

---

## 🚀 Funcionalidades

### Autenticação e perfis

O sistema possui três perfis:

- **Consumidor** e **Lojista** — escolhidos pela própria pessoa no cadastro público;
- **Administrador** — nunca pelo cadastro público; promoção manual e restrita no banco (ver `backend/database/README.md`).

O acesso é controlado no Front-end (rotas por perfil) **e** no Back-end (`require_consumer`, `require_lojista`, `require_admin`).

---

### 🏪 Lojista

- cadastra e edita a loja (endereço, horário, WhatsApp, Instagram, Facebook, logo);
- acompanha o status: **Pendente → Aprovada / Rejeitada** (com motivo) e solicita nova análise;
- cadastra, edita, ativa/desativa e exclui produtos, com categoria, foto (URL) e **preço promocional**;
- **confirma ou rejeita as compras** informadas pelos consumidores;
- consulta as avaliações recebidas (média, distribuição de notas, comentários e fotos).

---

### 🛒 Vitrine pública (sem login)

- produtos de lojas aprovadas, busca por **título e descrição**, filtros (categoria, loja, preço) e ordenação;
- página da loja com descrição, endereço, horário, contatos, link para o mapa, **média e avaliações públicas**;
- contato pelo WhatsApp com mensagem contendo nome, preço e **link do produto**.

---

### 🧾 Confirmação de compra

Para avaliar uma loja, o consumidor precisa ter uma compra **confirmada pelo lojista**:

1. o consumidor usa **“Já comprei este produto”** (página do produto) ou **“Solicitar confirmação”** (página da loja) → solicitação **Pendente**;
2. o lojista, em **Confirmações de compra**, escolhe **Confirmar compra** ou **Não reconheço**;
3. confirmada → a avaliação é liberada. A regra é validada no Back-end: `POST /consumidor/avaliacoes` responde 403 sem compra confirmada.

---

### ⭐ Avaliações

- nota (1 a 5), comentário e até 3 fotos (JPEG, PNG ou WebP, 5 MB) com pré-visualização;
- uma avaliação por loja; o consumidor lista, edita, exclui e gerencia fotos em **Minhas avaliações**;
- avaliações públicas na página da loja (nome do consumidor abreviado) e visão completa para o lojista.

---

### 🪙 Pontos

- +10 pontos por avaliação publicada e +5 por foto; estorno ao excluir a avaliação/foto (pelo consumidor ou pela moderação);
- saldo total, saldo por loja e extrato com origem legível (“Avaliação publicada”, “Foto adicionada à avaliação”).

---

### ❤️ Favoritos

- favoritar/desfavoritar nos cards e no detalhe do produto, lista **Meus favoritos** e sinalização de produto indisponível;
- a API é a fonte de verdade (sem `localStorage` ou listas locais).

---

### 🛡️ Administração

- **Lojas**: lista por status, dados do lojista, aprovar e rejeitar com motivo;
- **Categorias**: cadastrar, editar e excluir (bloqueado quando há produtos vinculados);
- **Moderação**: avaliações com consumidor, loja, nota, comentário e fotos; remover avaliação ou foto (com estorno de pontos e remoção do arquivo no Storage).

---

## 🖥️ Interface

A versão atual do MiniMall foi validada para uso em **computadores e notebooks**.

Foram utilizadas as seguintes resoluções durante a auditoria final:

```text
1024 × 768
1280 × 720
1366 × 768
1440 × 900
1920 × 1080
```

A validação verificou:

- overflow horizontal;
- sobreposição de componentes;
- textos cortados;
- imagens deformadas;
- formulários;
- tabelas;
- modais;
- navegação por teclado;
- foco visível;
- estados de carregamento;
- estados de erro;
- estados vazios.

Ao final da auditoria foram identificados e corrigidos **8 problemas de interface e acessibilidade**.

---

## 🧪 Testes

Resultado da validação final:

```text
Front-end: 161 testes aprovados (npm test) · build aprovado · git diff --check aprovado
Back-end: 100 testes aprovados (unittest), incluindo jornadas completas em SQLite:
          cadastro com perfil, loja e aprovação, produtos e categorias,
          confirmação de compra, avaliações e fotos, pontos, moderação, favoritos e perfil
```

As jornadas de visitante, consumidor, lojista e administrador também foram validadas
de ponta a ponta no navegador (1024×768 a 1920×1080) contra o Back-end e o Supabase reais,
com dados temporários removidos ao final.

---

## 🛠️ Tecnologias

### Front-end

- React
- Vite
- JavaScript
- CSS
- integração com API REST
- autenticação integrada ao Supabase

### Back-end

- Python
- FastAPI
- API REST
- Supabase
- PostgreSQL

### Gerenciamento

- Git
- GitHub
- GitHub Projects
- GitHub Issues
- branches por funcionalidade
- Pull Requests / integração na branch principal

### Design

- Figma

---

## 📁 Estrutura geral

```text
MiniMall-GerenciaProjetos/
│
├── backend/
│   ├── controllers/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   └── main.py
│
├── frontend/
│   ├── components/
│   ├── services/
│   ├── styles/
│   ├── tests/
│   ├── views/
│   │   ├── consumer/
│   │   └── merchant/
│   └── App.jsx
│
└── README.md
```

A estrutura pode sofrer pequenas alterações conforme a evolução do projeto.

---

# ▶️ Como executar

## Pré-requisitos

Antes de iniciar, tenha instalado:

- Git
- Node.js
- npm
- Python
- ambiente virtual Python configurado
- acesso às configurações do Supabase utilizadas pelo projeto

---

## 1. Clonar o repositório

```bash
git clone https://github.com/sthfnyy/MiniMall-GerenciaProjetos.git
```

Entre no projeto:

```bash
cd MiniMall-GerenciaProjetos
```

---

# 🔧 Back-end

## 2. Ativar o ambiente virtual

No Windows PowerShell:

```powershell
.\backend\.venv\Scripts\Activate.ps1
```

---

## 3. Configurar as variáveis de ambiente

Copie `backend/.env.example` para `backend/.env` e `frontend/.env.example` para `frontend/.env`.

| Variável | Onde | Obrigatória |
|---|---|---|
| `DATABASE_URL` | Back-end | Sim |
| `SUPABASE_URL` | Back-end | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Back-end (cadastro e Storage) | Sim — **nunca** no Front-end |
| `SUPABASE_ANON_KEY` | Back-end (apenas `POST /auth/login`) | Não |
| `CORS_ORIGINS` | Back-end | Não (padrão: Vite local) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Front-end | Sim |
| `VITE_API_URL` | Front-end | Não (padrão `http://127.0.0.1:8000`) |

`SUPABASE_JWT_SECRET`, `VITE_DEMO_WHATSAPP` e `VITE_DEMO_INSTAGRAM` são obsoletas.
As credenciais não devem ser adicionadas ao repositório.

---

## 4. Iniciar o servidor

Na raiz do projeto:

```powershell
python -m uvicorn backend.main:app --reload
```

Por padrão, o servidor ficará disponível em:

```text
http://127.0.0.1:8000
```

---

# 🎨 Front-end

Abra um segundo terminal.

Entre na pasta:

```powershell
cd frontend
```

Instale as dependências, caso ainda não estejam instaladas:

```powershell
npm install
```

Inicie o Vite:

```powershell
npm run dev
```

O terminal apresentará o endereço da aplicação, normalmente:

```text
http://localhost:5173
```

Abra esse endereço no navegador.

---

# 🧪 Executando os testes

Na pasta `frontend`:

```powershell
npm test
npm run build
```

Na raiz do projeto (Back-end, com o ambiente virtual ativo):

```powershell
python -m unittest discover -s backend/tests -t .
```

Verificação de espaços/finais de linha:

```powershell
git diff --check
```

---

## 🔐 Perfis da aplicação

As rotas privadas são protegidas no Front-end e no Back-end.

### Consumidor

```text
#consumidor
#consumidor/compras
#consumidor/favoritos
#consumidor/pontos
#consumidor/avaliacoes
#consumidor/avaliar/{loja}
```

### Lojista

```text
#lojista
#lojista/produtos
#lojista/compras
#lojista/avaliacoes
```

### Administrador

```text
#admin   (abas: Lojas, Gestão de Categorias, Moderação)
```

---

# 📋 Organização do projeto

O desenvolvimento foi dividido em três iterações.

## Iteração 1

Foco na estrutura principal:

- autenticação;
- perfis;
- estabelecimento;
- gerenciamento de produtos.

## Iteração 2

Foco na experiência pública e administrativa:

- vitrine;
- pesquisa;
- filtros;
- página das lojas;
- contato via WhatsApp;
- administração.

## Iteração 3

Foco nas interações do consumidor:

- avaliações;
- fotos;
- pontos;
- favoritos;
- integração final;
- testes e validação desktop.

---

# 📊 Gerenciamento

O acompanhamento das atividades foi realizado utilizando o **GitHub Projects**.

O quadro foi organizado utilizando os estados:

```text
A Fazer
Em Andamento
Em Revisão
Concluído
```

As funcionalidades foram divididas em issues e associadas aos responsáveis e às respectivas iterações.

### GitHub Projects

https://github.com/users/sthfnyy/projects/5

---

# ⚠️ Estado atual e dependências

Todos os fluxos principais estão integrados ao Back-end e ao Supabase reais.

Dependências de ambiente:

- o banco deve conter o esquema do MiniMall (tabelas, triggers e o bucket `fotos-avaliacoes`) descrito em `backend/database/README.md`;
- contas de administrador são promovidas manualmente no banco;
- existem créditos de pontos órfãos gerados antes da correção da moderação; o relatório (somente leitura) e a correção comentada estão em `backend/database/relatorio_pontos_orfaos.sql`.

Não são utilizados como substitutos da API:

- `localStorage`;
- dados seed para simular persistência;
- listas locais de favoritos;
- pontos calculados artificialmente;
- avaliações falsas.

---

# 📌 Escopo não contemplado

Nesta versão não fazem parte do escopo:

- pagamentos dentro da plataforma;
- PIX ou cartão;
- carrinho envolvendo diferentes estabelecimentos;
- cálculo automático de frete;
- integração com transportadoras;
- controle rígido de estoque em tempo real;
- transferência de pontos entre estabelecimentos;
- aplicativo móvel nativo.

O objetivo do MiniMall é atuar principalmente como uma plataforma de **divulgação, descoberta e aproximação entre consumidores e comerciantes locais**.

---

# 📚 Contexto acadêmico

Projeto desenvolvido para a disciplina de **Gerência de Projetos**, da Universidade Federal do Piauí — UFPI.

O planejamento utilizou conceitos do **PMBOK 7ª Edição**, incluindo:

- gerenciamento de escopo;
- acompanhamento de entregas;
- gerenciamento de riscos;
- partes interessadas;
- priorização de requisitos;
- acompanhamento por indicadores;
- adaptação do processo de desenvolvimento;
- registro de lições aprendidas.

A abordagem de desenvolvimento utilizada foi baseada em um **Scrum adaptado ao contexto acadêmico**, com três iterações principais.

---

## 📍 Universidade Federal do Piauí — UFPI

**Curso:** Sistemas de Informação  
**Disciplina:** Gerência de Projetos  
**Projeto:** MiniMall — Shopping Local Online  
**Ano:** 2026
