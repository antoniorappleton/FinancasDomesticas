// auth.js
// Login/Registo com Supabase usando o overlay do teu index.html
// Requer window.sb criado no index.html

export function initAuth({ onSignedIn, onSignedOut } = {}) {
  const supabase = window.sb;
  if (!supabase) {
    console.error("Supabase não inicializado (window.sb).");
    return;
  }

  // --- elementos do overlay (já existem no teu index.html) ---
  const overlay = document.getElementById("screen-login");
  const formPw   = document.getElementById("auth-form");
  const emailEl  = document.getElementById("auth-email");
  const passEl   = document.getElementById("auth-password");
  const toggle   = document.getElementById("auth-toggle");
  const title    = document.getElementById("auth-title");
  const submit   = document.getElementById("auth-submit");
  const helpTxt  = document.getElementById("auth-help");

  // helpers UI
  const setOverlay = (visible) => {
    if (!overlay) return;
    overlay.classList.toggle("hidden", !visible);
    document.body.classList.toggle("has-login", visible); // aplica blur ao resto
  };
  const busy = (on) => { if (submit) submit.disabled = !!on; };

  // alternar modos
  let mode = "signin"; // 'signin' | 'signup'
  const updateModeText = () => {
    if (!title || !submit || !helpTxt || !toggle) return;
    if (mode === "signin") {
      title.textContent  = "Entrar";
      submit.textContent = "Entrar";
      helpTxt.textContent = "Ainda não tens conta?";
      toggle.textContent = "Criar conta";
    } else {
      title.textContent  = "Criar conta";
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

  // validações mínimas
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||"").trim());

  // submit do overlay
  formPw?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const email = emailEl?.value.trim();
      const pass  = passEl?.value || "";

      if (!isEmail(email)) throw new Error("Email inválido.");
      if (pass.length < 6) throw new Error("A palavra-passe deve ter pelo menos 6 caracteres.");

      busy(true);

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        // onAuthStateChange trata do resto
      } else {
        // Registo
        const displayName = (email.split("@")[0] || "Utilizador");
        const { error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            data: { name: displayName },
            // se tiveres "Email Confirmations" ativado, define a redirect URL:
            emailRedirectTo: `${location.origin}/#/`
          }
        });
        if (error) throw error;

        // Tenta iniciar sessão de imediato (se o projeto não exigir confirmação de email)
        try { await supabase.auth.signInWithPassword({ email, password: pass }); } catch {}
        alert("✅ Conta criada. Verifica o e-mail se a confirmação estiver ativa.");
      }
    } catch (err) {
      alert("Erro de autenticação: " + (err?.message || err));
    } finally {
      busy(false);
    }
  });

  // recuperar palavra-passe (se adicionares um botão com id="auth-forgot")
  document.getElementById("auth-forgot")?.addEventListener("click", async () => {
    const email = emailEl?.value.trim();
    if (!isEmail(email)) return alert("Introduz um e-mail válido primeiro.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/#/settings`
    });
    alert(error ? "❌ " + error.message : "📧 Enviámos um link para repor a palavra-passe.");
  });

  // reações a alterações de sessão
  supabase.auth.onAuthStateChange((_evt, session) => {
    const logged = !!session;
    setOverlay(!logged);
    if (logged) onSignedIn?.(); else onSignedOut?.();
  });

  // estado inicial
  (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setOverlay(!session);
    if (session) onSignedIn?.(); else onSignedOut?.();
  })();
}
