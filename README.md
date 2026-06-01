# WiseBudget

WiseBudget e uma aplicacao web progressiva para gestao financeira domestica. O objetivo e dar a uma pessoa, casal ou familia uma visao clara de receitas, despesas, contas, categorias, objetivos, saude financeira e evolucao mensal, com autenticacao individual e possibilidade de partilhar a mesma estrutura financeira entre utilizadores distintos.

[Live Demo](https://wisebudget-financaspessoais.web.app)

## Visao

A aplicacao foi pensada como um centro de controlo financeiro pessoal e familiar. Cada utilizador tem o seu proprio login, mas pode trabalhar sozinho ou juntar-se a uma conta financeira partilhada atraves de codigo de convite.

O potencial do projeto esta em combinar registo financeiro, analise, educacao dentro da propria app e automacao: a app nao serve apenas para guardar movimentos, mas para ajudar a perceber padroes, antecipar riscos e criar habitos financeiros melhores.

## Funcionalidades Principais

### Gestao Financeira

- Dashboard com KPIs, saldo, receitas, despesas, poupancas e tendencias.
- Registo de receitas, despesas, poupancas e transferencias.
- Gestao de contas financeiras.
- Categorias hierarquicas por tipo de movimento.
- Movimentos com data, valor, conta, categoria, regularidade, estado, metodo de pagamento, localizacao e notas.
- Listagem, pesquisa, filtros e edicao de movimentos.
- Importacao de dados por ficheiro, com apoio a classificacao de movimentos.

### Conta Partilhada

- Logins independentes por utilizador.
- Estrutura financeira partilhavel atraves de codigo unico.
- Um utilizador gera um codigo; outro utilizador cola esse codigo em Settings.
- Apos adesao, ambos passam a ver e editar os mesmos dados financeiros.
- Separacao entre autenticacao (`auth.users`) e dados financeiros (`households`).
- Modelo preparado para multiplos membros por conta financeira.
- Permissoes por papel: `owner`, `admin`, `member`.
- Protecao contra auto-adesao com o proprio codigo.
- Convites com hash, expiracao e limite de utilizacoes.

### Objetivos, Metas e Portfolios

- Criacao e acompanhamento de objetivos financeiros.
- Metas de poupanca.
- Orcamentos por categoria.
- Portfolios/carteiras de investimento.
- Agregacao de valores e projecoes.

### Saude Financeira

- Indicadores de liquidez, esforco financeiro e poupanca.
- Analise de risco e alertas.
- Metricas calculadas a partir do historico real de movimentos.
- Visualizacoes com graficos e cartoes de diagnostico.

### Relatorios e Inteligencia

- Relatorios mensais, anuais e por periodo.
- Exportacao para PDF.
- Seccoes de insights e analise.
- Integracao com IA/Gemini para apoio a analise financeira.
- WiseChat, assistente dentro da app para perguntas e navegacao contextual.

### Tutoriais da App

- Area de tutoriais acessivel a todos os utilizadores em Settings.
- Links externos para videos, por exemplo YouTube.
- Imagens ilustrativas carregadas via Supabase Storage.
- Ecra administrativo reservado ao email `antonioappleton@gmail.com`.
- Admin pode criar, editar, publicar, ocultar e apagar tutoriais.

### Personalizacao e Experiencia

- PWA instalavel.
- Service Worker.
- Tema visual configuravel.
- Upload de imagem de fundo.
- Modo de privacidade.
- Onboarding e guia contextual.
- UI responsiva para desktop e mobile.
- Notificacoes push e relatorios recorrentes preparados no backend.

## Arquitetura

### Frontend

O frontend e uma SPA leve em HTML, CSS e JavaScript vanilla.

Estrutura principal:

```text
public/
  index.html
  main.js
  styles.css
  sw.js
  src/
    lib/
      auth.js
      repo.js
      theme.js
      notifications.js
      ai-chat.js
      guide.js
      helpers.js
      validators.js
    screens/
      dashboard.*
      Movimentos.*
      nova.*
      Metas.*
      health.*
      categories.*
      settings.*
      admin-tutorials.*
```

O router vive em `public/main.js` e carrega dinamicamente o HTML e o controlador JS de cada ecra com base no hash da URL.

Rotas principais:

```text
#/                 Dashboard
#/transactions     Movimentos
#/new              Novo movimento
#/objetivos        Objetivos / Metas
#/health           Saude financeira
#/categories       Categorias
#/settings         Definicoes
#/admin-tutorials  Administracao de tutoriais
```

### Backend

O backend principal e Supabase:

- Supabase Auth para autenticacao.
- PostgreSQL para dados financeiros.
- Row Level Security para isolamento e partilha segura.
- Supabase Storage para imagens de tema e imagens de tutoriais.
- RPCs SQL para operacoes sensiveis, como convites de conta partilhada.

Ha tambem Firebase Hosting para publicacao da PWA e Firebase Functions para tarefas de automacao/notificacoes.

## Modelo de Dados

### Utilizadores e Conta Partilhada

```text
auth.users
profiles
households
household_members
household_invites
```

Ideia central:

- `auth.users` representa o login.
- `profiles` guarda dados da sessao/app, incluindo `active_household_id`.
- `households` representa a estrutura financeira.
- `household_members` liga utilizadores a households.
- `household_invites` guarda convites por codigo com hash.

### Dados Financeiros

As tabelas financeiras usam `household_id` para partilha:

```text
accounts
categories
transactions
objectives
portfolios
```

O `user_id` continua util como autor/criador historico, mas o acesso principal e controlado por `household_id`.

### Tutoriais

```text
app_tutorials
storage bucket: tutorial-assets
```

`app_tutorials` guarda titulo, descricao, imagem, link de video, ordem e estado de publicacao.

## Seguranca

O projeto usa RLS no Supabase para garantir que cada utilizador so acede ao que deve.

Regras principais:

- Dados privados por defeito.
- Dados financeiros acessiveis apenas a membros da `household` ativa.
- Convites geridos por RPCs, nao por manipulacao direta no frontend.
- Codigo de convite guardado como hash.
- So `owner/admin` pode gerar convite.
- Admin global da area de tutoriais validado pelo email `antonioappleton@gmail.com`.

## Migracoes Relevantes

Os scripts SQL estao em `db/`.

Principais:

```text
db/schema.sql                    Schema base
db/shared_households.sql         Modelo completo de conta partilhada
db/shared_households_resume.sql  Continuacao segura apos execucao parcial
db/fix_household_owner_roles.sql Reparacao de roles owner/admin
db/tutorials.sql                 Sistema de tutoriais e storage
db/push_subscriptions.sql        Push notifications
db/theme_schema_v2.sql           Tema visual
db/visual_settings.sql           Definicoes visuais
```

## Desenvolvimento Local

Instalar dependencias:

```bash
npm install
```

Arrancar servidor local:

```bash
npm run dev
```

Abrir:

```text
http://127.0.0.1:5500
```

## Scripts

```json
{
  "dev": "live-server public --port=5500 --no-browser --open=index.html",
  "deploy": "node scripts/bump-version.js",
  "deploy:full": "node scripts/bump-version.js --full",
  "deploy:dry": "node scripts/bump-version.js --dry-run"
}
```

## Deploy

O projeto esta preparado para Firebase Hosting.

Arquivos relevantes:

```text
firebase.json
.firebaserc
public/
functions/
```

## Potencial de Evolucao

Ideias naturais para crescimento:

- Historico detalhado de alteracoes por utilizador.
- Permissoes mais granulares por household.
- Possibilidade de sair de uma conta partilhada.
- Convites multiuso ou com email obrigatorio.
- Area de aprendizagem mais rica, com trilhos guiados.
- Dashboard por household e por membro.
- Regras automaticas de categorizacao.
- Assistente financeiro mais contextual com base no historico.
- Alertas preditivos de saldo e despesas recorrentes.
- Exportacao contabilistica.
- Modo familia com tarefas e objetivos partilhados.

## Estado Atual

WiseBudget ja tem uma base solida:

- autenticacao
- dados financeiros
- dashboards
- relatorios
- objetivos
- saude financeira
- personalizacao
- conta partilhada
- tutoriais administraveis
- PWA
- integracao Supabase/Firebase

O projeto esta num ponto em que pode evoluir de aplicacao pessoal para uma plataforma domestica de literacia e gestao financeira.

## Autor

Desenvolvido por Antonio Appleton.

Contacto: [antonioappleton@gmail.com](mailto:antonioappleton@gmail.com)
