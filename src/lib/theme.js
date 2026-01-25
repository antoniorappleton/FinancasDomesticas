export const DEFAULT_THEME = {
  bg_image_url: "",
  bg_overlay_color: "rgba(0,0,0,0.35)",
  bg_overlay_opacity: 0.35,
  bg_overlay_blur: 0,
  card_bg_color: "rgba(255,255,255,0.92)",
  card_border_color: "rgba(255,255,255,0.12)",
  card_backdrop_blur: 0,
};

/**
 * Applies theme settings to CSS variables.
 * @param {Object} settings - partial or full settings object
 */
export function applyTheme(settings) {
  const s = { ...DEFAULT_THEME, ...settings };
  const root = document.documentElement;

  if (s.bg_image_url && s.bg_image_url.trim()) {
    root.style.setProperty("--app-bg-image", `url('${s.bg_image_url}')`);
  } else {
    root.style.setProperty("--app-bg-image", "none");
  }

  root.style.setProperty("--app-overlay-bg", s.bg_overlay_color);
  root.style.setProperty("--app-overlay-opacity", s.bg_overlay_opacity);
  root.style.setProperty("--app-overlay-blur", `${s.bg_overlay_blur}px`);

  root.style.setProperty("--card-bg", s.card_bg_color);
  root.style.setProperty("--card-border", s.card_border_color);
  root.style.setProperty("--card-blur", `${s.card_backdrop_blur}px`);
}

/**
 * Loads theme from Supabase.
 * @param {Object} sb - Supabase client
 */
export async function loadTheme(sb) {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  let { data } = await sb
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!data) {
    // If no settings exist, apply defaults but don't force insert immediately
    // to avoid race conditions or unnecessary DB writes on every load.
    // Or we can insert default if we want consistency.
    // user asked: "Se não existir registo, criar automaticamente com valores default"
    try {
      const { data: newData, error } = await sb
        .from("user_settings")
        .insert({ user_id: user.id })
        .select()
        .single();
      if (!error) data = newData;
    } catch (e) {
      console.warn("Auto-create settings failed", e);
    }
  }

  if (data) {
    applyTheme(data);
    // Persist in localStorage for faster subsequent loads (optional but good)
    localStorage.setItem("wb:visuals", JSON.stringify(data));
  }
}

/**
 * Saves theme to Supabase.
 * @param {Object} sb - Supabase client
 * @param {Object} settings - settings object
 */
export async function saveTheme(sb, settings) {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Utilizador não autenticado");

  // 1. Optimistic Update: Apply and Save Locally immediately
  const payload = {
    user_id: user.id,
    bg_image_url: settings.bg_image_url || "",
    bg_overlay_color: settings.bg_overlay_color,
    bg_overlay_opacity: settings.bg_overlay_opacity,
    bg_overlay_blur: settings.bg_overlay_blur,
    card_bg_color: settings.card_bg_color,
    card_border_color: settings.card_border_color,
    card_backdrop_blur: settings.card_backdrop_blur,
    updated_at: new Date().toISOString(),
  };

  applyTheme(payload);
  localStorage.setItem("wb:visuals", JSON.stringify(payload));

  // 2. Persist to Supabase (Background)
  const { error } = await sb.from("user_settings").upsert(payload);
  if (error) {
    console.error("Failed to sync theme to DB:", error);
    // Optionally revert local storage if strict consistency needed,
    // but for themes, optimistic is better UX.
    throw error;
  }
}
