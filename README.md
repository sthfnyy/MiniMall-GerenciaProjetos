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

O sistema possui três perfis principais:

- **Consumidor**
- **Lojista**
- **Administrador**

O acesso às funcionalidades é controlado de acordo com o perfil autenticado.

---

### 🏪 Lojista

O lojista pode:

- cadastrar e editar informações do estabelecimento;
- informar endereço e dados de contato;
- configurar WhatsApp;
- cadastrar produtos;
- editar produtos;
- remover produtos;
- visualizar seus produtos;
- acessar as avaliações relacionadas ao estabelecimento.

---

### 🛒 Vitrine pública

Visitantes e consumidores podem:

- visualizar produtos;
- pesquisar produtos;
- utilizar filtros;
- acessar páginas de estabelecimentos;
- visualizar detalhes dos produtos;
- consultar informações da loja;
- iniciar contato com o lojista pelo WhatsApp.

---

### ⭐ Avaliações

O Front-end permite:

- atribuir nota ao estabelecimento;
- adicionar comentário;
- selecionar imagens;
- visualizar preview das imagens antes do envio;
- consultar avaliações realizadas;
- visualizar avaliações na página do estabelecimento.

> A persistência completa das avaliações e fotos depende dos respectivos endpoints de Back-end.

---

### 🪙 Pontos

O consumidor possui uma interface para:

- visualizar saldo total;
- consultar saldo por estabelecimento;
- acompanhar histórico de movimentações;
- visualizar créditos e resgates.

> A interface está concluída, porém a consulta e atribuição real dos pontos depende da API correspondente no Back-end.

---

### ❤️ Favoritos

O consumidor pode utilizar a interface de favoritos para:

- marcar produtos como favoritos;
- remover produtos dos favoritos;
- acessar a tela **Meus favoritos**;
- visualizar o estado do favorito nos cards e detalhes dos produtos.

O Front-end utiliza a API como fonte de verdade e não utiliza `localStorage` ou listas locais para simular persistência.

> A persistência real depende dos endpoints de favoritos no Back-end.

---

### 🛡️ Administração

O perfil administrador possui funcionalidades relacionadas a:

- gerenciamento de categorias;
- moderação;
- controle de conteúdos da plataforma;
- acesso às funcionalidades administrativas previstas no projeto.

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

O Front-end possui testes automatizados para as funcionalidades implementadas.

Resultado da validação final:

```text
133 testes aprovados
Build aprovado
git diff --check aprovado
```

Também foram realizadas auditorias automatizadas da interface nas diferentes resoluções desktop utilizadas pelo projeto.

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

Configure o arquivo de ambiente utilizado pelo Back-end com as credenciais necessárias para acesso ao banco de dados e aos serviços do Supabase.

As credenciais não devem ser adicionadas ao repositório público.

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
```

Para validar o build:

```powershell
npm run build
```

Também pode ser utilizada a verificação:

```powershell
git diff --check
```

---

## 🔐 Perfis da aplicação

As principais rotas privadas são protegidas de acordo com o perfil do usuário.

### Consumidor

Exemplos:

```text
#consumidor
#consumidor/favoritos
#consumidor/pontos
#consumidor/avaliacoes
```

### Lojista

Exemplos:

```text
#lojista
#lojista/avaliacoes
```

### Administrador

```text
#admin
```

Usuários não autorizados não devem acessar funcionalidades destinadas a outros perfis.

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

A aplicação possui grande parte dos fluxos principais implementados, porém algumas funcionalidades da Iteração 3 ainda dependem da conclusão das respectivas APIs.

Entre as dependências identificadas estão:

```text
/consumidor/avaliacoes*
/lojista/avaliacoes
/consumidor/pontos
/consumidor/favoritos*
```

Também foi identificada uma dependência relacionada à leitura de categorias no fluxo de cadastro de produtos do lojista.

Enquanto uma API necessária não estiver disponível, o Front-end apresenta mensagens de indisponibilidade em vez de criar dados fictícios.

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
