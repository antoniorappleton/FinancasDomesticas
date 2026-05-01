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
    this.containerEl = null;
    this.closeBtn = null;
    this.overlay = null;
    this.voiceBtn = null;
    this.recognition = null;
    this.isVoiceMode = false;
    this.cache = new Map(); // Simple in-memory cache
  }

  init() {
    this.fab = document.getElementById("wisechat-fab");
    this.panel = document.getElementById("wisechat-panel");
    this.messagesEl = document.getElementById("wisechat-messages");
    this.inputEl = document.getElementById("wisechat-input");
    this.formEl = document.getElementById("wisechat-form");
    this.containerEl = document.querySelector(".wisechat-container");
    this.closeBtn = document.getElementById("wisechat-close");
    this.overlay = document.getElementById("wisechat-overlay");
    this.voiceBtn = document.getElementById("wisechat-voice");

    if (!this.fab) return;
    
    this.initVoice();
    this.initViewport();

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
    if (this.recognition) this.recognition.stop();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  initVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.voiceBtn.style.display = "none";
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = "pt-PT";
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.voiceBtn.classList.add("recording");
      this.inputEl.placeholder = "A ouvir...";
    };

    this.recognition.onend = () => {
      this.voiceBtn.classList.remove("recording");
      this.inputEl.placeholder = "Pergunte-me algo...";
    };

    this.recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      this.inputEl.value = text;
      this.isVoiceMode = true;
      this.handleSend();
    };

    this.recognition.onerror = (event) => {
      console.error("Speech Recognition Error", event.error);
      this.voiceBtn.classList.remove("recording");
    };

    this.voiceBtn.addEventListener("click", () => {
      try {
        this.recognition.start();
      } catch (e) {
        this.recognition.stop();
      }
    });
  }

  initViewport() {
    if (!window.visualViewport) return;
    window.visualViewport.addEventListener("resize", () => {
      if (this.isOpen && window.innerWidth < 600) {
        const hh = window.visualViewport.height;
        this.containerEl.style.height = `${hh}px`;
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      }
    });
  }

  speak(text) {
    if (!window.speechSynthesis) return;
    // Remove markdown for speaking
    const cleanText = text.replace(/\*\*/g, "").replace(/\n/g, " ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "pt-PT";
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  }

  addMessage(text, role = "bot") {
    const div = document.createElement("div");
    div.className = `msg msg--${role}`;
    
    // Check for navigation commands [GOTO:X]
    let cleanText = text;
    let navTarget = null;
    const navMatch = text.match(/\[GOTO:(\w+)\]/);
    if (navMatch) {
      navTarget = navMatch[1];
      cleanText = text.replace(/\[GOTO:\w+\]/g, "").trim();
    }

    div.innerHTML = cleanText.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    if (navTarget) {
      const btn = document.createElement("button");
      btn.className = "wisechat-nav-btn";
      btn.innerHTML = `Ir para ${this.formatNavName(navTarget)} ➔`;
      btn.onclick = () => {
        this.close();
        this.executeNav(navTarget);
      };
      div.appendChild(btn);
    }

    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    
    this.messages.push({ role, text });
  }

  formatNavName(target) {
    const names = {
      DASHBOARD: "Dashboard",
      MOVIMENTOS: "Movimentos",
      NOVA: "Nova Transação",
      CATEGORIAS: "Categorias",
      METAS: "Metas",
      SETTINGS: "Definições",
      REPORTS: "Relatórios"
    };
    return names[target] || target;
  }

  executeNav(target) {
    if (target === "REPORTS") {
      // Logic to open reports (usually a function in main.js or dashboard.js)
      if (window.openReport) window.openReport();
      else window.location.hash = "#dashboard"; 
      return;
    }
    const hashes = {
      DASHBOARD: "#dashboard",
      MOVIMENTOS: "#movimentos",
      NOVA: "#nova",
      CATEGORIAS: "#categories",
      METAS: "#metas",
      SETTINGS: "#settings"
    };
    if (hashes[target]) window.location.hash = hashes[target];
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
    
    // Check Cache first (simple key based on question)
    const cacheKey = text.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.time < 1000 * 60 * 30) { // 30 mins cache
        this.addMessage(cached.response);
        return;
      }
    }

    this.showTyping(true);

    try {
      const context = await this.getFinancialContext();
      const response = await this.callGemini(text, context, apiKey);
      
      // Save to cache
      this.cache.set(cacheKey, { response, time: Date.now() });

      this.showTyping(false);
      this.addMessage(response);
      
      if (this.isVoiceMode) {
        this.speak(response);
        this.isVoiceMode = false; // Reset
      }
    } catch (e) {
      console.error("WiseChat Error Detail:", e);
      this.showTyping(false);
      const errorMsg = e.message || "Erro desconhecido";
      this.addMessage(`❌ Ocorreu um erro: **${errorMsg}**. Verifique a sua ligação ou a validade da API Key.`);
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
      
      const { data: tExpData, error: tExpError } = await window.sb
        .from("transaction_types")
        .select("id")
        .eq("code", "EXPENSE")
        .maybeSingle();
      
      if (tExpError || !tExpData) {
        console.warn("WiseChat: Não foi possível obter ID de despesa.");
        return [];
      }

      const { data, error } = await window.sb
        .from("transactions")
        .select(`
          amount,
          date,
          categories(name)
        `)
        .eq("type_id", tExpData.id)
        .gte("date", threeMonthsAgo);

      if (error) {
        console.warn("WiseChat: Erro ao obter transações para resumo:", error);
        return [];
      }
      
      if (!data || data.length === 0) return [];

      // Group by month and category
      const groups = {};
      data.forEach(t => {
        const month = t.date.slice(0, 7);
        const cat = t.categories?.name || "Outros";
        const key = `${month}_${cat}`;
        if (!groups[key]) groups[key] = { month, category: cat, total: 0 };
        groups[key].total += Number(t.amount || 0);
      });

      return Object.values(groups).sort((a, b) => b.month.localeCompare(a.month));
    } catch (e) {
      console.error("WiseChat context error:", e);
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
1. Usa os dados financeiros para responder a perguntas sobre dinheiro.
2. Usa o MANUAL DE NAVEGAÇÃO abaixo para ajudar o utilizador a encontrar funcionalidades.
3. Se o utilizador quiser ir para um sítio ou perguntar "onde fica X", responde e inclui um comando de navegação no formato [GOTO:NOME_ECRÃ] no final da resposta.
4. Sê direto e profissional.

MANUAL DE NAVEGAÇÃO:
- Dashboard: Ecrã principal com resumo de saldos e gráficos. (Comando: [GOTO:DASHBOARD])
- Movimentos: Lista de todas as transações, onde se pode editar ou apagar. (Comando: [GOTO:MOVIMENTOS])
- Nova Transação: Onde se inserem novos gastos ou receitas. (Comando: [GOTO:NOVA])
- Categorias: Gestão de categorias e orçamentos. (Comando: [GOTO:CATEGORIAS])
- Metas: Definição de objetivos de poupança. (Comando: [GOTO:METAS])
- Definições: Configurações de IA (API Key), Temas e Exportação. (Comando: [GOTO:SETTINGS])
- Relatórios: Análise detalhada por mês/ano (Botão 'Relatórios' no Dashboard). (Comando: [GOTO:REPORTS])

PERGUNTA DO UTILIZADOR:
${query}
`.trim();

    const fetchGemini = async (modelName) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${key}`,
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

      return response.json();
    };

    let result;
    const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];
    
    for (const model of models) {
      try {
        result = await fetchGemini(model);
        break; // Success!
      } catch (err) {
        const msg = (err.message || "").toLowerCase();
        const isQuota = msg.includes("quota") || msg.includes("rate limit") || msg.includes("429");
        const isOverload = msg.includes("overloaded") || msg.includes("503");

        if (isQuota || isOverload) {
          console.warn(`WiseChat: Modelo ${model} falhou (${isQuota ? 'Quota' : 'Overload'}), a tentar próximo...`);
          if (model === models[models.length - 1]) throw err; // Last one failed
          continue;
        } else {
          throw err;
        }
      }
    }

    return result.candidates?.[0]?.content?.parts?.[0]?.text || "Não consegui gerar uma resposta.";
  }
}

export const WiseChat = new AIInstance();
window.WiseChat = WiseChat; // Global access if needed
