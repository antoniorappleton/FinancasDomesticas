export class Onboarding {
  static init() {
    const KEY = "wb:welcome_ts";
    if (localStorage.getItem(KEY)) return;

    // Mark as seen immediately (so it doesn't annoy if they refresh)
    localStorage.setItem(KEY, Date.now());

    this.showWizard();
  }

  static showWizard() {
    const el = document.createElement("div");
    el.className = "onboarding-wizard";
    el.innerHTML = `
      <div class="onboarding-card">
        <div class="onboarding-img">👋</div>
        <h2>Bem-vindo ao Wisebudget!</h2>
        <p>A tua gestão doméstica, simplificada.</p>
        
        <ul class="onboarding-steps">
          <li>
            <strong>📊 Dashboard:</strong> Visão geral das tuas finanças.
          </li>
          <li>
            <strong>💶 Nova:</strong> Regista despesas e receitas.
          </li>
          <li>
            <strong>⚙️ Definições:</strong> Configura categorias e contas.
          </li>
        </ul>

        <div class="onboarding-actions">
          <a href="#/new" class="btn btn--primary js-action">Adicionar primeira transação</a>
          <button class="btn btn--ghost js-close">Explorar primeiro</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);

    const close = () => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 300);
    };

    el.querySelector(".js-close").addEventListener("click", close);
    el.querySelector(".js-action").addEventListener("click", close);
  }
}
