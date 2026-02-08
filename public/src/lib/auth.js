// auth.js
import { Toast } from "./ui.js";
// Overlay de autenticação + integração Supabase
// Requer window.sb criado no index.html

export function initAuth({ onSignedIn, onSignedOut } = {}) {
  const sb = window.sb;
  if (!sb) {
    console.error("Supabase não inicializado (window.sb).");
    return;
  }

  // --- elementos do overlay (existem no teu index.html) ---
  const overlay = document.getElementById("screen-login");
  const formPw = document.getElementById("auth-form");
  const emailEl = document.getElementById("auth-email");
  const passEl = document.getElementById("auth-password");
  const confirmEl = document.getElementById("auth-confirm-pw"); // Novo
  const rowConfirm = document.getElementById("row-confirm-pw"); // Container
  const toggle = document.getElementById("auth-toggle");
  const title = document.getElementById("auth-title");
  const submit = document.getElementById("auth-submit");
  const helpTxt = document.getElementById("auth-help");

  // URL base e página de confirmação (SEM colar a index.html!)
  // const BASE_URL = new URL(".", location.href);
  // const CONFIRM_URL = new URL("confirm.html", BASE_URL).href;

  // FIX: Gerar URL absoluta baseada no path atual (para evitar problemas com hash ou path sem slash)
  const getConfirmUrl = () => {
    // Ex: http://127.0.0.1:5500/app/index.html -> http://127.0.0.1:5500/app/confirm.html
    // Ex: http://192.168.1.5:5500/ -> http://192.168.1.5:5500/confirm.html
    const path = location.pathname; // /app/index.html ou /
    const dir = path.substring(0, path.lastIndexOf("/") + 1); // /app/ ou /
    return `${location.origin}${dir}confirm.html`;
  };
  const CONFIRM_URL = getConfirmUrl();
  console.log("Redirect URL definida para:", CONFIRM_URL);

  // helpers UI
  const setOverlay = (visible) => {
    if (!overlay) return;
    overlay.classList.toggle("hidden", !visible);
    document.body.classList.toggle("has-login", visible);
  };
  const busy = (on) => {
    if (submit) submit.disabled = !!on;
  };

  // erro traduzido
  const safeError = (err) => {
    const msg = err.message || err.toString();
    if (msg.includes("Invalid login credentials"))
      return "Email ou password errados.";
    if (msg.includes("User already registered"))
      return "Este email já está registado.";
    if (msg.includes("Password should be")) return "A password é muito fraca.";
    return msg;
  };

  // alternar modos
  let mode = "signin"; // 'signin' | 'signup'
  const updateModeText = () => {
    if (!title || !submit || !helpTxt || !toggle) return;
    if (mode === "signin") {
      title.textContent = "Entrar";
      submit.textContent = "Entrar";
      helpTxt.textContent = "Ainda não tens conta?";
      toggle.textContent = "Criar conta";
      if (rowConfirm) rowConfirm.classList.add("hidden");
    } else {
      title.textContent = "Criar conta";
      submit.textContent = "Registar";
      helpTxt.textContent = "Já tens conta?";
      toggle.textContent = "Entrar";
      if (rowConfirm) rowConfirm.classList.remove("hidden");
    }
  };
  toggle?.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    updateModeText();
  });
  updateModeText();

  // validação simples
  const isEmail = (s) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

  // submit do overlay
  formPw?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const email = emailEl?.value?.trim();
      const pass = passEl?.value ?? "";
      const confirmPass = confirmEl?.value ?? "";

      if (!isEmail(email)) throw new Error("Email inválido.");
      if (pass.length < 6)
        throw new Error("A palavra-passe deve ter pelo menos 6 caracteres.");

      // Validação Extra para Sign Up
      if (mode === "signup") {
        if (pass !== confirmPass)
          throw new Error("As passwords não coincidem.");
      }

      busy(true);

      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({
          email,
          password: pass,
        });
        if (error) throw error;
        // onAuthStateChange trata do rest
        Toast.success("Bem-vindo de volta! 👋");
      } else {
        const displayName = email.split("@")[0] || "Utilizador";
        const { error } = await sb.auth.signUp({
          email,
          password: pass,
          options: {
            data: { name: displayName },
            emailRedirectTo: CONFIRM_URL,
          },
        });
        if (error) throw error;

        // Novo fluxo: "Check your email"
        showEmailSentState(email);
        // Toast.success("Conta criada! Verifica o teu email. 📧");
      }
    } catch (err) {
      Toast.error(safeError(err));
    } finally {
      busy(false);
    }
  });

  // Esqueci-me da palavra-passe (podes trocar o redirect se quiseres)
  document
    .getElementById("auth-forgot")
    ?.addEventListener("click", async () => {
      const email = emailEl?.value?.trim();
      if (!isEmail(email)) return alert("Introduz um e-mail válido primeiro.");
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: CONFIRM_URL,
      });
      alert(
        error
          ? "❌ " + error.message
          : "📧 Enviámos um link para repor a palavra-passe.",
      );
    });

  // --- NOVAS FUNÇÕES UX ---

  function maskEmail(email) {
    const [name, domain] = email.split("@");
    if (!name || !domain) return email;
    return name.substring(0, 2) + "***@" + domain;
  }

  function showEmailSentState(email) {
    const card = document.querySelector(".auth-card");
    if (!card) return;

    card.innerHTML = `
      <div class="auth-success" style="text-align:center; padding:20px 0;">
        <div style="font-size:3rem; margin-bottom:10px;">📩</div>
        <h2 style="font-size:1.4rem; margin-bottom:10px">Confirma o teu email</h2>
        <p style="color:var(--muted); margin-bottom:20px">Enviámos um link de confirmação para <br><strong>${maskEmail(email)}</strong>.</p>
        <p style="font-size:0.9rem; margin-bottom:30px">Abre o email e clica no botão para ativar a conta.</p>

        <button id="resend-email" class="btn btn--primary" style="width:100%; margin-bottom:10px">Reenviar email</button>
        <button id="back-login" class="link" style="font-size:0.9rem">Voltar ao login</button>
      </div>
    `;

    document
      .getElementById("resend-email")
      ?.addEventListener("click", async () => {
        Toast.info("A reenviar... ⏱");
        await sb.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: CONFIRM_URL },
        });
        Toast.success("Email reenviado");
      });

    document.getElementById("back-login")?.addEventListener("click", () => {
      location.reload();
    });
  }

  function showConfirmedBanner() {
    const params = new URLSearchParams(location.hash.split("?")[1]);
    if (params.get("confirmed") !== "1") return;

    const card = document.querySelector(".auth-card");
    if (!card) return;

    // Evitar duplicados
    if (card.querySelector(".auth-banner")) return;

    const banner = document.createElement("div");
    banner.className = "auth-banner success";
    banner.textContent = "🟢 Conta ativada! Já podes iniciar sessão.";

    // Inject style inline or assume css class exists.
    // Since user provided CSS, let's inject it via style attr or ensure it's in CSS file.
    // For now inline styles for safety + class
    banner.style.cssText = `
      background: #dcfce7;
      border: 1px solid #16a34a;
      color: #166534;
      padding: 10px 12px;
      border-radius: 10px;
      margin-bottom: 14px;
      font-weight: 600;
      text-align: center;
    `;

    card.prepend(banner);
  }

  // Chamar banner no init
  showConfirmedBanner();

  // Reagir a alterações de sessão
  sb.auth.onAuthStateChange((_evt, session) => {
    const logged = !!session;
    setOverlay(!logged);
    if (logged) onSignedIn?.();
    else onSignedOut?.();
  });

  // Estado inicial
  (async () => {
    const {
      data: { session },
    } = await sb.auth.getSession();
    setOverlay(!session);
    if (session) onSignedIn?.();
    else onSignedOut?.();
  })();

  // === Helper opcional para testes (consola):
  // window.__wbResendConfirm('email@exemplo.com')
  window.__wbResendConfirm = async (email) => {
    if (!isEmail(email)) {
      console.warn("Email inválido");
      return;
    }
    return sb.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: CONFIRM_URL },
    });
  };

  return {
    handlePasswordReset: () => {
      const modal = document.getElementById("modal-reset-pw");
      const form = document.getElementById("form-reset-pw");
      if (!modal || !form) return;

      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      setOverlay(false); // Hide login overlay if open

      form.onsubmit = async (e) => {
        e.preventDefault();
        const p1 = document.getElementById("reset-new-pw").value;
        const p2 = document.getElementById("reset-conf-pw").value;

        if (p1 !== p2) return Toast.error("As passwords não coincidem.");
        if (p1.length < 6) return Toast.error("Mínimo 6 caracteres.");

        try {
          // Update password (user is logged in with recovery token)
          const { error } = await sb.auth.updateUser({ password: p1 });
          if (error) throw error;

          Toast.success("Palavra-passe alterada com sucesso! 🔒");
          modal.classList.add("hidden");
          modal.setAttribute("aria-hidden", "true");
          // Redirect to home/dashboard
          window.location.hash = "#/";
        } catch (err) {
          console.error(err);
          Toast.error(err.message || "Erro ao alterar palavra-passe.");
        }
      };
    },
  };
}
