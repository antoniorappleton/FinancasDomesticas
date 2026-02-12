export const DEFAULT_THEME = {
  bg_image_url: "",
  bg_color: "#0b1220",
  bg_blur_px: 0,
  overlay_color: "rgba(0,0,0,0.35)",

  card_bg_rgba: "rgba(255,255,255,0.92)",
  card_border_rgba: "rgba(255,255,255,0.12)",
  card_blur_px: 0,

  header_bg_rgba: "rgba(15,23,42,0.85)",
  menu_bg_rgba: "rgba(15,23,42,0.90)",
  fab_bg: "#0ea5e9",

  text_main: "#0f172a",
  text_secondary: "#64748b",
};

/**
 * Applies theme settings to CSS variables.
 * @param {Object} settings - partial or full settings object
 */
export function applyTheme(settings) {
  const s = { ...DEFAULT_THEME, ...settings };
  const root = document.documentElement;

  // Fundo
  if (s.bg_image_url && s.bg_image_url.trim()) {
    root.style.setProperty("--app-bg-image", `url('${s.bg_image_url}')`);
  } else {
    root.style.setProperty("--app-bg-image", "none");
  }
  root.style.setProperty("--app-bg-color", s.bg_color);
  root.style.setProperty("--app-bg-blur", `${s.bg_blur_px}px`);

  // Overlay (Película)
  root.style.setProperty("--app-overlay-color", s.overlay_color);

  // Cards
  root.style.setProperty("--ui-card-bg", s.card_bg_rgba);
  root.style.setProperty("--ui-card-border", s.card_border_rgba);
  root.style.setProperty("--ui-card-blur", `${s.card_blur_px}px`);

  // Estrutura
  root.style.setProperty("--ui-header-bg", s.header_bg_rgba);
  root.style.setProperty("--ui-menu-bg", s.menu_bg_rgba);
  root.style.setProperty("--ui-fab-bg", s.fab_bg);

  // Backward compatibility & Extras
  root.style.setProperty("--primary", s.fab_bg);
  root.style.setProperty("--footer-grad", s.header_bg_rgba); 
  root.style.setProperty("--bg", s.bg_color);
  root.style.setProperty("--surface", s.card_bg_rgba);
  root.style.setProperty("--border", s.card_border_rgba);

  // Typography
  if (s.text_main) root.style.setProperty("--text", s.text_main);
  if (s.text_secondary) root.style.setProperty("--muted", s.text_secondary);
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
    // Tenta criar default se não existir
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
    // FALLBACK: If DB lacks text fields (schema mismatch), keep local values
    const local = JSON.parse(localStorage.getItem("wb:visuals") || "{}");
    if (!data.text_main && local.text_main) data.text_main = local.text_main;
    if (!data.text_secondary && local.text_secondary)
      data.text_secondary = local.text_secondary;

    applyTheme(data);
    localStorage.setItem("wb:visuals", JSON.stringify(data));
  }
}

/**
 * Saves theme to Supabase.
 * @param {Object} sb - Supabase client
 * @param {Object} settings - settings object (matching DB schema)
 */
export async function saveTheme(sb, settings) {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Utilizador não autenticado");

  // 1. Optimistic Update
  const payload = {
    user_id: user.id,
    ...settings,
    updated_at: new Date().toISOString(),
  };

  applyTheme(payload);
  localStorage.setItem("wb:visuals", JSON.stringify(payload));

  // 2. Persist to Supabase
  const { error } = await sb.from("user_settings").upsert(payload);
  if (error) {
    console.error("Failed to sync theme to DB:", error);
    throw error;
  }
}
