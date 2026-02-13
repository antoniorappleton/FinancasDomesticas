/* global Notification, navigator, window */
/**
 * NotificationManager - Gestor de Notificações Web Push
 */
export const NotificationManager = {
  vapidPublicKey: "BIYQW2zMiKG96ZbDUNgHn3wXQxU6lk2-QYBDPhWkeBnP_tK4oE6-goKXPFBruQVSM6BL3uBOV6Q0CRpwUkdTecU",

  /**
   * Inicializa o gestor, verifica suporte e estado atual.
   */
  async init() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("Push notifications não são suportadas neste browser.");
      return { supported: false };
    }
    return {
      supported: true,
      permission: Notification.permission,
      pwa: window.matchMedia("(display-mode: standalone)").matches
    };
  },

  /**
   * Solicita permissão ao utilizador.
   */
  async requestPermission() {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  },

  /**
   * Subscreve o browser para push e guarda no Supabase com metadados premium.
   */
  async subscribe() {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });

      const json = subscription.toJSON();
      const sb = window.sb;
      const { data: { user } } = await sb.auth.getUser();

      if (!user) throw new Error("Utilizador não autenticado.");

      const payload = {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString()
      };

      const { error } = await sb.from("push_subscriptions").upsert(payload, { 
        onConflict: "user_id, endpoint" 
      });

      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Erro ao subscrever:", err);
      return false;
    }
  },

  /**
   * Atualiza as preferências (merge) no perfil.
   */
  async setPreferences(patch) {
    try {
      const sb = window.sb;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return false;

      // Buscar atuais para garantir merge limpo
      const current = await this.getPreferences() || {};
      const next = { ...current, ...patch };

      const { error } = await sb.from("profiles")
        .update({ notification_settings: next })
        .eq("id", user.id);
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Erro ao atualizar preferências:", err);
      return false;
    }
  },

  /**
   * Remove subscrição do browser e do Supabase.
   */
  async unsubscribe() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        const sb = window.sb;
        await sb.from("push_subscriptions")
          .delete()
          .eq("endpoint", endpoint);
      }
      return true;
    } catch (err) {
      console.error("Erro ao cancelar subscrição:", err);
      return false;
    }
  },

  /**
   * Obtém as preferências do utilizador do perfil no Supabase.
   */
  async getPreferences() {
    try {
      const sb = window.sb;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;

      const { data, error } = await sb.from("profiles")
        .select("notification_settings")
        .eq("id", user.id)
        .single();
      
      if (error) throw error;
      return data.notification_settings;
    } catch (err) {
      console.error("Erro ao obter preferências:", err);
      return null;
    }
  },

  /**
   * Atualiza as preferências no perfil no Supabase.
   */
  async updatePreferences(prefs) {
    try {
      const sb = window.sb;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return false;

      const { error } = await sb.from("profiles")
        .update({ notification_settings: prefs })
        .eq("id", user.id);
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Erro ao atualizar preferências:", err);
      return false;
    }
  },

  /**
   * Helper: Converte chave VAPID base64 para Uint8Array.
   */
  urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
};

window.NotificationManager = NotificationManager;
