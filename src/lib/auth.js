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
  const BASE_URL = new URL(".", location.href); // p.ex.: http://127.0.0.1:5501/
  const CONFIRM_URL = new URL("confirm.html", BASE_URL).href; // p.ex.: http://127.0.0.1:5501/confirm.html

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

        // Tentar login imediato (se o projeto não exigir confirmação)
        try {
          await sb.auth.signInWithPassword({ email, password: pass });
        } catch {}

        Toast.success("Conta criada! Verifica o teu email. 📧");
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
        redirectTo: CONFIRM_URL, // ou new URL('#/settings', BASE_URL).href
      });
      alert(
        error
          ? "❌ " + error.message
          : "📧 Enviámos um link para repor a palavra-passe.",
      );
    });

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
}
