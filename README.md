# Wisebudget365 — Gestão Doméstica

**Wisebudget365** é uma Aplicação Web Progressiva (PWA) de gestão financeira pessoal, desenhada para ajudar famílias e indivíduos a controlar o seu orçamento doméstico de forma simples e intuitiva. A aplicação permite o registo de despesas, receitas, poupanças e transferências, oferecendo visualizações gráficas e relatórios para uma melhor tomada de decisão.

## 🚀 Funcionalidades Principais

*   **Dashboard Financeiro**: Visão geral rápida do saldo atual, despesas recentes e gráficos de evolução.
*   **Gestão de Transações**:
    *   Registo de **Despesas** (com categorias e subcategorias).
    *   Registo de **Receitas**.
    *   Registo de **Poupanças**.
    *   **Transferências** entre contas.
    *   Suporte para despesas fixas/recorrentes.
*   **Multi-Conta**: Gestão de diferentes contas bancárias ou carteiras (ex: Orde, Dinheiro Vivo, Poupança).
*   **Categorização Avançada**: Sistema hierárquico de categorias (ex: Casa > Eletricidade).
*   **Gestão de Objetivos**: Definição e acompanhamento de metas financeiras.
*   **PWA (Progressive Web App)**: Funciona como uma aplicação nativa no telemóvel, com capacidade de instalação e funcionamento offline (via Service Worker).
*   **Modo Offline**: Permite consultar dados e navegar na app mesmo sem internet (cache via Service Worker).

## 🛠️ Estrutura Técnica

A aplicação segue uma arquitetura **Single Page Application (SPA)** moderna e leve, sem necessidade de *bundlers* complexos para o desenvolvimento base (utiliza módulos ES6 nativos).

### Tecnologias

*   **Frontend**:
    *   HTML5 & CSS3 (com Variáveis CSS e Utility Classes).
    *   JavaScript (ES Modules).
    *   [Chart.js](https://www.chartjs.org/) para visualização de dados.
*   **Backend & Base de Dados**:
    *   [Supabase](https://supabase.com/): Backend-as-a-Service (BaaS) que fornece base de dados PostgreSQL, Autenticação e API em tempo real.
*   **Infraestrutura**:
    *   Service Workers para capacidades PWA e cache offline.

### Organização do Código

```
/
├── index.html          # Ponto de entrada ("Shell" da aplicação)
├── styles.css          # Estilos globais e utilitários
├── main.js             # Lógica principal, router e inicialização
├── manifest.json       # Configuração PWA
├── sw.js               # Service Worker (Cache e Offline)
├── src/
│   ├── lib/            # Bibliotecas e utilitários partilhados
│   │   ├── repo.js     # Repositório de dados (camada de abstração)
│   │   ├── helpers.js  # Funções auxiliares (formatação moeda, datas, etc.)
│   │   └── ...
│   └── screens/        # Lógica de cada ecrã (View Controllers)
│       ├── dashboard.js
│       ├── nova.js     # Ecrã de novo registo
│       ├── settings.js
│       └── ...
```

## 🗄️ Base de Dados (Supabase / PostgreSQL)

A base de dados é relacional e está alojada no Supabase. As principais tabelas são:

### Tabelas Core
*   **`transactions`**: Tabela central onde ficam registados todos os movimentos.
    *   Colunas chave: `amount`, `date`, `description`, `type_id`, `account_id`, `category_id`.
*   **`accounts`**: Contas financeiras do utilizador (ex: Conta à Ordem, Cofre).
*   **`categories`**: Categorias de despesas/receitas. Suporta hierarquia (auto-relacionamento via `parent_id`).

### Tabelas Auxiliares (Domínios)
*   **`transaction_types`**: Define os tipos de movimento (`INCOME`, `EXPENSE`, `TRANSFER`, `SAVINGS`).
*   **`regularities`**: Define a recorrência (`MONTHLY`, `YEARLY`, etc.) para despesas fixas.
*   **`payment_methods`**: Métodos de pagamento (Dinheiro, Multibanco, Transferência).
*   **`statuses`**: Estados da transação (Pago, Pendente, Agendado).

### Autenticação & Segurança
*   Utiliza **Supabase Auth** para gestão de utilizadores.
*   Políticas **RLS (Row Level Security)** garantem que cada utilizador apenas acede aos seus próprios dados (`user_id`).

## ⚙️ Como Correr o Projeto

1.  **Pré-requisitos**:
    *   Instalar [Node.js](https://nodejs.org/) (apenas para utilizar o servidor de desenvolvimento local).

2.  **Instalar dependências**:
    ```bash
    npm install
    ```

3.  **Iniciar servidor local**:
    ```bash
    npm run dev
    ```
    Isto irá iniciar o `live-server` e abrir a aplicação no browser (normalmente em `http://127.0.0.1:5500`).

---

*Desenvolvido no âmbito do curso de programação.*
