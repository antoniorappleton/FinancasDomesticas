// auth.js
export function initAuth({ onSignedIn, onSignedOut } = {}) {
  const supabase = window.sb;
  if (!supabase) {
    console.error("Supabase não inicializado (window.sb).");
    return;
  }

  // --- elementos do overlay ---
  const overlay = document.getElementById("screen-login");
  const formPw = document.getElementById("auth-form");
  const emailEl = document.getElementById("auth-email");
  const passEl = document.getElementById("auth-password");
  const toggle = document.getElementById("auth-toggle");
  const title = document.getElementById("auth-title");
  const submit = document.getElementById("auth-submit");
  const helpTxt = document.getElementById("auth-help");

  // URL de confirmação (corrigido!)
  const BASE = new URL(".", location.href).href; // p.ex.: http://127.0.0.1:5501/
  const CONFIRM_URL = new URL("confirm.html", BASE).href; // http://127.0.0.1:5501/confirm.html

  const setOverlay = (visible) => {
    if (!overlay) return;
    overlay.classList.toggle("hidden", !visible);
    document.body.classList.toggle("has-login", visible);
  };
  const busy = (on) => {
    if (submit) submit.disabled = !!on;
  };

  let mode = "signin";
  const updateModeText = () => {
    if (!title || !submit || !helpTxt || !toggle) return;
    if (mode === "signin") {
      title.textContent = "Entrar";
      submit.textContent = "Entrar";
      helpTxt.textContent = "Ainda não tens conta?";
      toggle.textContent = "Criar conta";
    } else {
      title.textContent = "Criar conta";
      submit.textContent = "Registar";
      helpTxt.textContent = "Já tens conta?";
      toggle.textContent = "Entrar";
    }
  };
  toggle?.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    updateModeText();
  });
  updateModeText();

  const isEmail = (s) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

  formPw?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const email = emailEl?.value.trim();
      const pass = passEl?.value || "";
      if (!isEmail(email)) throw new Error("Email inválido.");
      if (pass.length < 6)
        throw new Error("A palavra-passe deve ter pelo menos 6 caracteres.");
      busy(true);

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: pass,
        });
        if (error) throw error;
      } else {
        const displayName = email.split("@")[0] || "Utilizador";
        const { error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            data: { name: displayName },
            emailRedirectTo: CONFIRM_URL, // ✅ nunca cola a "index.html"
          },
        });
        if (error) throw error;

        // opcional: tentar login imediato (se a confirmação não for obrigatória)
        try {
          await supabase.auth.signInWithPassword({ email, password: pass });
        } catch {}
        alert("✅ Conta criada. Verifica o e-mail para confirmar.");
      }
    } catch (err) {
      alert("Erro de autenticação: " + (err?.message || err));
    } finally {
      busy(false);
    }
  });

  // Esqueci-me da palavra-passe → também podes reusar a confirm.html se preferires
  document
    .getElementById("auth-forgot")
    ?.addEventListener("click", async () => {
      const email = emailEl?.value.trim();
      if (!isEmail(email)) return alert("Introduz um e-mail válido primeiro.");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: CONFIRM_URL, // ou, se preferires, '#/settings': new URL('#/settings', BASE).href
      });
      alert(
        error
          ? "❌ " + error.message
          : "📧 Enviámos um link para repor a palavra-passe."
      );
    });

  supabase.auth.onAuthStateChange((_evt, session) => {
    const logged = !!session;
    setOverlay(!logged);
    if (logged) onSignedIn?.();
    else onSignedOut?.();
  });

  (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setOverlay(!session);
    if (session) onSignedIn?.();
    else onSignedOut?.();
  })();
}
