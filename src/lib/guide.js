// src/lib/guide.js

function ensureModal() {
  if (document.getElementById("guide-modal")) return;

  const modal = document.createElement("div");
  modal.id = "guide-modal";
  modal.className = "guide-modal hidden";

  modal.innerHTML = `
    <div class="guide-card">
      <div class="guide-header">
        <h2>Guia da Aplicação</h2>
        <button id="guide-close" aria-label="Fechar">✕</button>
      </div>
      <div class="guide-content" id="guide-content"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#guide-close").addEventListener("click", closeGuide);
  modal.addEventListener("click", e => {
    if (e.target === modal) closeGuide();
  });
}

function renderContent() {
  const el = document.getElementById("guide-content");
  if (!el) return;

  el.innerHTML = `
    <section>
      <h3>
        <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-sect-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
        Dashboard Inteligente
      </h3>
      <p>A tua visão geral financeira.</p>
      <ul>
        <li><strong>Análise Detalhada:</strong> Carrega nos cartões de Receita, Despesa ou Poupança para ver gráficos e evoluções.</li>
        <li><strong>Resumos Mensais:</strong> Acompanha o saldo e o desempenho de cada categoria.</li>
      </ul>
    </section>

    <section>
      <h3>
        <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-sect-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Nova Transação & Despesas Fixas
      </h3>
      <p>Registo rápido e automatizado.</p>
      <ul>
        <li><strong>Despesas Rápidas:</strong> Adiciona "em massa" despesas fixas recorrentes com base no teu histórico (ex: Renda, Gym).</li>
        <li><strong>QR Code:</strong> Digitaliza faturas para preenchimento automático.</li>
        <li><strong>Manual:</strong> Regista qualquer movimento pontual.</li>
      </ul>
    </section>

    <section>
      <h3>
        <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-sect-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.43.811 1.035.811 1.73 0 .695-.316 1.3-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
        </svg>
        Definições Avançadas
      </h3>
      <p>Personalização e Relatórios.</p>
      <ul>
        <li><strong>Relatórios:</strong> Exporta dados detalhados para Excel ou PDF.</li>
        <li><strong>Orçamentos:</strong> Cria e gere orçamentos mensais para controlar gastos.</li>
        <li><strong>Dados:</strong> Importa backups ou gere a tua sessão.</li>
      </ul>
    </section>
    
    <section>
      <h3>
        <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-sect-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m-15.686 0A8.959 8.959 0 013 12c0-.778.099-1.533.284-2.253m0 0A11.959 11.959 0 013 12c0-.778.099-1.533.284-2.253m15.686 0A11.959 11.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918" />
        </svg>
        Objetivos de Poupança
      </h3>
      <p>Define metas para o futuro.</p>
      <ul>
        <li>Cria objetivos para férias, carro ou fundo de emergência.</li>
        <li>Segue a barra de progresso visualmente.</li>
      </ul>
    </section>
  `;
}

export function openGuide() {
  ensureModal();
  renderContent();
  document.getElementById("guide-modal")?.classList.remove("hidden");
}

export function closeGuide() {
  document.getElementById("guide-modal")?.classList.add("hidden");
}

export function mountGuideButton() {
  const header = document.querySelector(".app-header__inner");
  if (!header || document.getElementById("guide-btn")) return;

  const btn = document.createElement("button");
  btn.id = "guide-btn";
  btn.className = "guide-btn";
  btn.title = "Guia da aplicação";
  // SVG Icon: Heroicons Question Mark Circle (roughly)
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon" style="width:20px;height:20px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 17.25h.007v.008H12v-.008z" />
    </svg>
  `;

  btn.addEventListener("click", openGuide);
  header.appendChild(btn);
}
