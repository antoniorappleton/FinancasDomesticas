# Wisebudget365 — Gestão Doméstica

**Wisebudget365** é uma Aplicação Web Progressiva (PWA) de gestão financeira pessoal e familiar, desenhada para proporcionar controlo total sobre o orçamento doméstico. Combinando simplicidade de utilização com funcionalidades avançadas de análise, a aplicação ajuda a tomar decisões financeiras mais informadas.

## 🚀 Funcionalidades Principais

### 📊 Visão e Análise

- **Dashboard Holístico**: Visão geral imediata com saldo atual, gráficos de despesas vs receitas e evolução patrimonial.
- **Projeção de Fluxo de Caixa**: Algoritmo inteligente que projeta o saldo futuro com base no histórico e nas despesas recorrentes, permitindo antecipar meses difíceis.
- **Relatórios Visuais**: Gráficos interativos (via Chart.js) para analisar onde gasta o seu dinheiro.

### 💰 Gestão Financeira Completa

- **Gestão de Transações**:
  - Registo rápido de **Despesas**, **Receitas**, **Transferências** e **Poupanças**.
  - Distinção clara entre despesas Variáveis e Fixas.
- **Importação Bancária**: Assistente para importar extratos bancários (CSV/Excel) com inferência automática de categorias e natureza da despesa.
- **Multi-Conta**: Gestão centralizada de múltiplas contas (Conta à Ordem, Dinheiro, Cartão de Refeição, etc.).
- **Categorização Hierárquica**: Sistema flexível de categorias e subcategorias (ex: Casa > Eletricidade) para organização detalhada.

### 🎯 Metas e Investimentos

- **Portfólio de Investimentos**: Acompanhamento de carteiras de investimento com atualização de valorização.
- **Gestão de Objetivos**: Definição de metas financeiras (ex: "Fundo de Férias") com barra de progresso.

### ⚙️ Experiência de Utilizador

- **PWA (Progressive Web App)**: Instale a app no seu telemóvel ou computador. Funciona offline com sincronização automática quando recupera a ligação.
- **Personalização Visual**: Temas customizáveis (alteração de fundo, cores, nível de desfoque/glassmorphism) sincronizados entre dispositivos.
- **Onboarding Intuitivo**: Guia passo-a-passo para novos utilizadores configurarem a conta rapidamente.
- **Notificações Inteligentes**: Alertas e lembretes via Firebase Cloud Messaging (FCM).

## 🛠️ Estrutura Técnica

A aplicação segue uma arquitetura **Single Page Application (SPA)** leve e moderna.

### Tecnologias

- **Frontend**:
  - HTML5, CSS3 (Variáveis, Glassmorphism) & JavaScript (ES Modules).
  - Arquitetura sem frameworks pesados, focada em performance.
- **Backend & Base de Dados**:
  - [Supabase](https://supabase.com/): PostgreSQL, Autenticação e Realtime.
  - **RLS (Row Level Security)**: Segurança robusta onde cada utilizador acede apenas aos seus dados.
- **Infraestrutura**:
  - Service Workers para suporte Offline-First.

### Organização do Projeto

```
/
├── index.html          # Shell da aplicação
├── src/
│   ├── lib/            # Lógica Core (Autenticação, Repositório, Analytics)
│   └── screens/        # Controladores de Ecrã (Dashboard, Metas, Settings)
├── sw.js               # Service Worker
└── ...
```

## ⚙️ Como Correr o Projeto

1.  **Pré-requisitos**: Node.js instalado (para servidor local).
2.  **Instalação**:
    ```bash
    npm install
    ```
3.  **Execução**:
    ```bash
    npm run dev
    ```
    A app ficará disponível em `http://127.0.0.1:5500` (ou porta similar).

---

_Desenvolvido para simplificar a sua vida financeira._
