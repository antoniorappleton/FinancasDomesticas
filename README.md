# 💰 WiseBudget - Gestor de Finanças Domésticas

> **Aplicação Web Progressiva (PWA) moderna e inteligente para gestão completa das suas finanças pessoais**

[![Live Demo](https://img.shields.io/badge/demo-live-success?style=for-the-badge)](https://wisebudget-financaspessoais.web.app)
[![Firebase](https://img.shields.io/badge/Firebase-Hosting-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-green?style=for-the-badge&logo=supabase)](https://supabase.com/)

---

## 🎯 Visão Geral

**WiseBudget** é uma solução completa e intuitiva para quem deseja ter controlo total sobre as suas finanças pessoais. Desenvolvida como PWA, funciona offline, sincroniza entre dispositivos, e oferece insights inteligentes sobre a sua saúde financeira.

### ✨ Destaques

- 📊 **Dashboard Inteligente** com visualizações interativas
- 💳 **Gestão de Transações** com importação automática de extratos bancários
- 🏷️ **Categorias Personalizáveis** com hierarquia e ícones
- 🎯 **Metas Financeiras** com acompanhamento visual de progresso
- 📈 **Previsão Financeira** baseada em padrões históricos
- 💚 **Coach de Saúde Financeira** com 6 indicadores-chave
- 🌙 **Dark Mode** e temas personalizáveis
- 📱 **PWA Completa** - funciona offline e instala como app nativa
- 🔐 **Segurança** - autenticação robusta e backup automático

---

## 🚀 Funcionalidades Principais

### 1. 📊 Dashboard Principal

Visão centralizada da sua situação financeira com:

- **Resumo Mensal**: Rendimentos, Despesas, Saldo líquido
- **Previsão de Fim de Mês**: Projeção baseada em gastos atuais
- **Gráficos Interativos**:
  - Evolução mensal de rendimentos vs despesas
  - Distribuição por categorias (pizza interativa)
  - Tendências de longo prazo
- **Alertas Inteligentes**: Avisos automáticos sobre situações críticas
- **KPIs Configuráveis**: Esconda/mostre métricas conforme preferência

### 2. 💳 Gestão de Transações

Controlo total sobre o fluxo de dinheiro:

- **Adicionar Manualmente**: Interface rápida e intuitiva
- **Importação de Extratos Bancários**:
  - Suporte para formatos OFX, CSV
  - Mapeamento automático de categorias inteligente
  - Detecção de duplicados
  - Preview antes de importar
- **Edição e Eliminação** com confirmações
- **Filtros Avançados**: Por data, categoria, tipo, conta
- **Pesquisa Rápida**: Encontre transações instantaneamente
- **Notas e Anexos**: Adicione contexto extra às transações

### 3. 🏷️ Sistema de Categorias

Organização flexível e poderosa:

- **Hierarquia de 2 Níveis**: Categorias pai e subcategorias
- **Categorias do Sistema**: Pré-configuradas (Habitação, Alimentação, Transporte...)
- **Categorias Personalizadas**: Crie as suas próprias
- **Ícones SVG**: Biblioteca visual com 100+ ícones
- **Natureza Automática**: Despesas fixas vs. variáveis
- **Cores Personalizadas**: Identifique visualmente
- **Bloqueio de Edição**: Proteja categorias críticas
- **Colapsar/Expandir**: Interface limpa e organizada

### 4. 🎯 Metas Financeiras

Alcance os seus objetivos:

- **Metas de Poupança**: Defina objetivos com prazo
- **Progresso Visual**: Barras de progresso animadas
- **Percentagem de Conclusão**: Veja quanto falta
- **Múltiplas Metas**: Gerencie vários objetivos simultaneamente
- **Edição Flexível**: Ajuste valores e datas quando necessário
- **Histórico de Contribuições**: Veja o caminho percorrido

### 5. 📈 Previsão Financeira

Planeie o futuro com dados:

- **Algoritmo Inteligente**: Baseado em médias e tendências
- **Projeção de 3 Meses**: Veja para onde vai o seu dinheiro
- **Cenários**: "E se" eu poupar X por mês?
- **Alertas Precoces**: Avisos se tendência for negativa
- **Ajustes Manuais**: Corrija previsões com conhecimento extra

### 6. 💚 Coach de Saúde Financeira (Novo!)

Sistema completo de análise da sua saúde financeira:

#### 🔢 Score de Saúde (0-100)

- **Excelente** (80-100): Verde - Finanças em ótimo estado
- **Bom** (60-79): Azul - Situação estável
- **Preocupante** (40-59): Laranja - Atenção necessária
- **Crítica** (0-39): Vermelho - Ação urgente

#### 📊 6 Indicadores-Chave

1. **💰 Esforço Fixo** (Meta: < 40%)
   - % do rendimento em despesas fixas
   - Renda, seguros, subscrições

2. **📉 Esforço Total** (Meta: < 85%)
   - % total do rendimento gasto
   - Fixas + variáveis

3. **💵 Taxa de Poupança** (Meta: ≥ 10%)
   - % do rendimento poupado
   - Construção de património

4. **📊 Liquidez**
   - Dinheiro disponível acumulado
   - Tendência (subida/descida/estável)

5. **⚠️ Saldos Negativos** (Meta: 0)
   - Meses consecutivos no vermelho
   - Indicador de estabilidade

6. **📈 Regularidade**
   - Volatilidade de despesas
   - Previsibilidade financeira

#### 🎨 Gráfico Interativo Evolução (12 meses)

- **6 Camadas de Dados** (filtros toggle):
  - Saldo mensal
  - Liquidez acumulada
  - Esforço fixo %
  - Esforço total %
  - Taxa de poupança %
  - Projeção 3 meses
- **Resumo Dinâmico**: Valor atual vs. média 6 meses
- **Tendências**: Badges verde/laranja/vermelho

#### 🚨 Alertas Inteligentes

- **Alta Prioridade**: Situações críticas (vermelho)
- **Média Prioridade**: Avisos importantes (laranja)
- **Baixa Prioridade**: Sugestões (verde)

#### ❓ Modal de Ajuda

- Explicação detalhada de cada indicador
- Ícones SVG ilustrativos
- Botão X para fechar
- Metas e benchmarks

### 7. ⚙️ Definições e Ferramentas

Personalize a sua experiência:

- **Perfil do Utilizador**:
  - Nome, email, avatar
  - Preferências de notificações
- **Contas Bancárias**:
  - Múltiplas contas
  - Saldos iniciais
  - Ativar/desativar

- **Temas**:
  - Light/Dark mode
  - Paletas de cores
  - Persistência entre sessões

- **Importação/Exportação**:
  - Backup completo em JSON
  - Restaurar dados
  - Importação de extratos (OFX/CSV)

- **Gestão de Dados**:
  - Limpeza de cache
  - Reset de dados
  - Estatísticas de uso

### 8. 🔔 Notificações Inteligentes (Premium)
Sistema de alertas proativos para manter a saúde financeira sob controlo:

#### 🚀 Infraestrutura
- **Web Push API**: Notificações de sistema em background (Android/Desktop).
- **VAPID Security**: Autenticação segura das mensagens.
- **Service Worker v71**: Redirecionamento inteligente e foco automático em janelas abertas.

#### 💡 Gatilhos de Notificação
1. **Urgentes** (Ação imediata):
   - **Saldo em Risco**: Aviso se a projeção indica saldo < 0.
   - **Vencimento de Despesa**: Alerta D-3 e D-1 para despesas fixas não registadas.
   - **Falha Crítica**: Erros em automações ou sincronização.
2. **Inteligentes** (Insights):
   - **Alerta de Categoria**: Gastos > média histórica (+25%).
   - **Taxa de Esforço**: Aviso se despesas fixas ultrapassam 50% do rendimento.
   - **Metas**: Notificação se a projeção indica que o objetivo não será atingido.
3. **Rotina** (Digest):
   - **Resumo Semanal**: Gastos totais e top categoria (Domingo às 18:00).
   - **Fecho do Mês**: Relatório consolidado (Dia 1 às 09:00).

#### 🛡️ Regras Anti-Spam (UX Premium)
- **Período de Silêncio**: Configurável (padrão: 22h - 08h).
- **Deduplicação**: Evita alertas repetidos para a mesma categoria/evento no mesmo período.
- **Master Switch**: Ativação/desativação global e por tipo no Menu de Definições.

---

## 🛠️ Tecnologias Utilizadas

### Frontend

- **HTML5 / CSS3 / JavaScript** (Vanilla - sem frameworks pesados)
- **Chart.js** - Visualizações gráficas
- **Material Symbols** - Iconografia moderna
- **Service Workers** - PWA e funcionamento offline

### Backend & Infraestrutura

- **Supabase**:
  - PostgreSQL - Base de dados relacional
  - Auth - Autenticação de utilizadores
  - Storage - Armazenamento de ficheiros
  - Row Level Security (RLS)
- **Firebase Hosting**:
  - CDN global
  - HTTPS automático
  - Deploy contínuo

### Arquitetura

- **Progressive Web App (PWA)**:
  - Service Worker para cache
  - Manifesto para instalação
  - Offline-first
- **SPA (Single Page Application)**:
  - Routing hash-based
  - Carregamento dinâmico de módulos
- **Responsive Design**:
  - Mobile-first
  - Adaptativo (< 600px, < 768px, > 768px)

---

## 📱 Compatibilidade

- ✅ **Desktop**: Chrome, Firefox, Edge, Safari
- ✅ **Mobile**: iOS Safari, Chrome Android
- ✅ **Tablets**: iPad, Android tablets
- ✅ **PWA**: Instalável em Windows, macOS, Linux, Android, iOS

---

## 🔒 Segurança & Privacidade

- 🔐 **Autenticação Segura**: Email + Password com Supabase Auth
- 🛡️ **Row Level Security**: Cada utilizador só vê os seus dados
- 🔄 **Backup Automático**: Sincronização em cloud
- 📴 **Offline-Safe**: Dados locais encriptados no dispositivo
- 🚫 **Sem Tracking**: Zero analytics invasivos

---

## 🎨 Design & UX

### Princípios de Design

- **Minimalista**: Interface limpa e focada
- **Intuitivo**: Fluxos naturais e descobríveis
- **Responsivo**: Adaptado a qualquer ecrã
- **Acessível**: ARIA labels, contraste adequado
- **Consistente**: Design system coerente

### Paleta de Cores

- **Primária**: Verde (#10b981) - Sucesso, crescimento
- **Secundária**: Azul (#3b82f6) - Confiança, estabilidade
- **Alerta**: Laranja (#f59e0b) - Atenção
- **Erro**: Vermelho (#ef4444) - Perigo, urgência
- **Neutro**: Greys - Texto e backgrounds

---

## 🚦 Roadmap

### ✅ Fase 1: Core Features (Completo)

- Dashboard interativo
- Gestão de transações
- Categorias e metas
- Importação de extratos
- Coach de Saúde Financeira

### 🔄 Fase 2: Smart Insights (Em Planeamento)

- Deteção de padrões de gastos
- Recomendações personalizadas
- Análise comparativa (vs. mês anterior, vs. ano anterior)
- Identificação de gastos supérfluos

- [x] **Notificações Inteligentes**: Alertas de saldo, despesas fixas e insights
- [x] **Gestor de Preferências**: Controlo granular e Período de Silêncio
- [x] **Infraestrutura Web Push**: Redirecionamento inteligente e system badges

### 🌟 Fase 4: Comunidade (Visão)

- Comparação anónima com utilizadores similares
- Desafios de poupança
- Badges e gamification

---

## 📊 Estatísticas do Projeto

- **Linhas de Código**: ~15,000+
- **Ficheiros**: ~50
- **Commits**: 200+
- **Tempo de Desenvolvimento**: 6 meses
- **Performance Score**: 95+ (Lighthouse)
- **PWA Score**: 100 (Lighthouse)

---

## 🤝 Contribuir

Interessado em contribuir? Eis como:

1. **Fork** o repositório
2. **Cria uma branch** para a tua feature (`git checkout -b feature/MinhaFeature`)
3. **Commit** as alterações (`git commit -m 'Add: nova feature incrível'`)
4. **Push** para a branch (`git push origin feature/MinhaFeature`)
5. **Abre um Pull Request**

---

## 📄 Licença

Este projeto está sob licença **MIT**. Vê o ficheiro [LICENSE](LICENSE) para mais detalhes.

---

## 👨‍💻 Autor

**António Rappleton**

- 📧 Email: [antonioappleton@gmail.com]
- 🌐 Website: [exemplo.com]
- 

---

## 🙏 Agradecimentos

- **Supabase** - Backend as a Service incrível
- **Firebase** - Hosting rápido e fiável
- **Chart.js** - Visualizações lindas
- **Material Symbols** - Ícones modernos
- **Toda a comunidade open-source**

---

<div align="center">
  
**⭐ Se gostaste do projeto, deixa uma estrela! ⭐**

Made with 💚 and lots of ☕

[🚀 Testar a App](https://wisebudget-financaspessoais.web.app)

</div>
