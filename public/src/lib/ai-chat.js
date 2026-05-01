// public/src/lib/ai-chat.js
import { repo } from "./repo.js";
import { Toast } from "./ui.js";

class AIInstance {
  constructor() {
    this.isOpen = false;
    this.isTyping = false;
    this.messages = [];
    this.chatKey = "wb:gemini-api-key";
    
    // UI Elements
    this.fab = null;
    this.panel = null;
    this.messagesEl = null;
    this.inputEl = null;
    this.formEl = null;
    this.closeBtn = null;
    this.overlay = null;
  }

  init() {
    this.fab = document.getElementById("wisechat-fab");
    this.panel = document.getElementById("wisechat-panel");
    this.messagesEl = document.getElementById("wisechat-messages");
    this.inputEl = document.getElementById("wisechat-input");
    this.formEl = document.getElementById("wisechat-form");
    this.closeBtn = document.getElementById("wisechat-close");
    this.overlay = document.getElementById("wisechat-overlay");

    if (!this.fab) return;

    // Events
    this.fab.addEventListener("click", () => this.toggle());
    this.closeBtn.addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", () => this.close());
    
    this.inputEl.addEventListener("input", () => this.handleTyping());

    this.formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSend();
    });

    // Suggestions
    document.querySelectorAll(".suggestion-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const q = chip.dataset.q;
        this.inputEl.value = q;
        this.handleSend();
      });
    });

    // Show FAB if user is logged in
    this.checkVisibility();
  }

  async checkVisibility() {
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      if (session) {
        this.fab.classList.remove("hidden");
      } else {
        this.fab.classList.add("hidden");
        this.close();
      }
    } catch (e) {
      this.fab.classList.add("hidden");
    }
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    this.panel.classList.add("active");
    document.body.classList.add("wisechat-open");
    setTimeout(() => this.inputEl.focus(), 300);
  }

  close() {
    this.isOpen = false;
    this.panel.classList.remove("active");
    document.body.classList.remove("wisechat-open");
  }

  addMessage(text, role = "bot") {
    const div = document.createElement("div");
    div.className = `msg msg--${role}`;
    
    // Simple markdown-ish formatting
    const formatted = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
      
    div.innerHTML = formatted;
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    
    this.messages.push({ role, text });
  }

  showTyping(show = true) {
    this.isTyping = show;
    if (show) {
      const div = document.createElement("div");
      div.className = "typing";
      div.id = "wisechat-typing";
      div.innerHTML = "<span></span><span></span><span></span>";
      this.messagesEl.appendChild(div);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    } else {
      document.getElementById("wisechat-typing")?.remove();
    }
  }

  handleTyping() {
    // Hide suggestions when typing on small screens to save space
    if (window.innerWidth < 600) {
      document.getElementById("wisechat-suggestions").style.display = 
        this.inputEl.value.length > 0 ? "none" : "flex";
    }
  }

  async handleSend() {
    const text = this.inputEl.value.trim();
    if (!text || this.isTyping) return;

    const apiKey = localStorage.getItem(this.chatKey) || (await this.getCloudKey());
    if (!apiKey) {
      this.addMessage("⚠️ Por favor, configure a sua **Gemini API Key** nas **Definições** para poder usar o WiseChat.");
      this.inputEl.value = "";
      return;
    }

    this.addMessage(text, "user");
    this.inputEl.value = "";
    this.showTyping(true);

    try {
      const context = await this.getFinancialContext();
      const response = await this.callGemini(text, context, apiKey);
      this.showTyping(false);
      this.addMessage(response);
    } catch (e) {
      console.error("WiseChat Error:", e);
      this.showTyping(false);
      this.addMessage("Desculpe, ocorreu um erro ao processar o seu pedido. Verifique a sua ligação ou a validade da API Key.");
    }
  }

  async getCloudKey() {
    try {
      const { data: { user } } = await window.sb.auth.getUser();
      return user?.user_metadata?.gemini_api_key || null;
    } catch {
      return null;
    }
  }

  async getFinancialContext() {
    // Build a compact summary of the user's finances
    try {
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM
      
      const [summary, cats, balances, catSummary] = await Promise.all([
        repo.dashboard.monthlySummary(6),
        repo.refs.allCategories(),
        repo.dashboard.accountBalances(),
        this.getRecentCategorySummary()
      ]);

      // Recent transactions (last 30)
      const { data: recentTxs } = await window.sb
        .from("transactions")
        .select(`
          date, amount, description, 
          transaction_types(name_pt),
          categories(name)
        `)
        .order("date", { ascending: false })
        .limit(30);
      
      const ctx = {
        date: now.toLocaleString('pt-PT'),
        currentMonth: currentMonth,
        summaries: summary.map(s => `${s.month}: Rec=${s.income}€, Desp=${s.expense}€, Saldo=${s.net}€`),
        categoryTotals: catSummary.map(c => `${c.month} - ${c.category}: ${c.total}€`),
        balances: balances.map(b => `${b.account_name}: ${b.balance}€`),
        recentTransactions: (recentTxs || []).map(t => `${t.date}: ${t.description} (${t.categories?.name || 'Sem cat'}) = ${t.amount}€`)
      };

      return JSON.stringify(ctx);
    } catch (e) {
      console.warn("Could not fetch full context:", e);
      return "Contexto financeiro parcial disponível.";
    }
  }

  async getRecentCategorySummary() {
    try {
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
      
      const { data: tExpData } = await window.sb
        .from("transaction_types")
        .select("id")
        .eq("code", "EXPENSE")
        .single();
      
      if (!tExpData) return [];

      const { data, error } = await window.sb
        .from("transactions")
        .select(`
          amount,
          date,
          categories(name)
        `)
        .eq("type_id", tExpData.id)
        .gte("date", threeMonthsAgo);

      if (error || !data) return [];

      // Group by month and category
      const groups = {};
      data.forEach(t => {
        const month = t.date.slice(0, 7);
        const cat = t.categories?.name || "Outros";
        const key = `${month}_${cat}`;
        if (!groups[key]) groups[key] = { month, category: cat, total: 0 };
        groups[key].total += Number(t.amount);
      });

      return Object.values(groups).sort((a, b) => b.month.localeCompare(a.month));
    } catch (e) {
      return [];
    }
  }

  async callGemini(query, context, key) {
    const prompt = `
És o WiseChat, um assistente financeiro de elite integrado na aplicação WiseBudget.
O teu objetivo é responder a perguntas do utilizador sobre as suas finanças de forma rigorosa, útil e profissional em Português de Portugal.

CONTEXTO ATUAL DO UTILIZADOR:
${context}

HISTÓRICO DA CONVERSA:
${this.messages.slice(-4).map(m => `${m.role === 'user' ? 'Utilizador' : 'WiseChat'}: ${m.text}`).join('\n')}

INSTRUÇÕES:
1. Usa os dados acima para responder. Se te perguntarem quanto gastaram este mês, soma os valores das transações de despesa no contexto ou usa o resumo mensal.
2. Sê direto. Não dês introduções longas.
3. Se não tiveres dados suficientes para responder a algo muito específico (ex: um dia exato que não esteja no resumo), diz que não tens acesso a esse detalhe histórico completo no momento, mas dá a informação que tiveres.
4. Usa negrito (**valor**) para destacar números importantes.
5. Se o utilizador perguntar "Quanto gastei em [categoria]?", procura nos dados de 'categoryTotals' pelo mês e categoria correspondentes.
6. Tens acesso aos totais mensais, totais por categoria (últimos 3 meses) e às últimas 30 transações.

PERGUNTA DO UTILIZADOR:
${query}
`.trim();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || response.statusText);
    }

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "Não consegui gerar uma resposta.";
  }
}

export const WiseChat = new AIInstance();
window.WiseChat = WiseChat; // Global access if needed
