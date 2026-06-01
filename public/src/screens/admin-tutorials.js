import { Toast } from "../lib/ui.js";
import { loadTheme } from "../lib/theme.js";

const ADMIN_EMAIL = "antonioappleton@gmail.com";
const BUCKET = "tutorial-assets";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function videoLabel(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "Video";
  }
}

export async function init({ sb, outlet } = {}) {
  sb ||= window.sb;
  if (sb) await loadTheme(sb);
  outlet ||= document.getElementById("outlet");
  const $ = (sel) => outlet.querySelector(sel);

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (String(user?.email || "").toLowerCase() !== ADMIN_EMAIL) {
    outlet.innerHTML = `
      <section class="card">
        <h2 class="section-title">Acesso reservado</h2>
        <p class="muted">Este ecrã é exclusivo do administrador do projeto.</p>
        <a class="btn btn--primary" href="#/settings">Voltar</a>
      </section>`;
    return;
  }

  const form = $("#tutorial-form");
  const list = $("#tutorial-admin-list");
  const fields = {
    id: $("#tutorial-id"),
    title: $("#tutorial-title"),
    description: $("#tutorial-description"),
    videoUrl: $("#tutorial-video-url"),
    imageFile: $("#tutorial-image-file"),
    imageUrl: $("#tutorial-image-url"),
    order: $("#tutorial-order"),
    published: $("#tutorial-published"),
    save: $("#tutorial-save"),
    reset: $("#tutorial-reset"),
  };

  function resetForm() {
    form.reset();
    fields.id.value = "";
    fields.imageUrl.value = "";
    fields.order.value = "0";
    fields.published.checked = true;
    fields.save.innerHTML = '<span class="material-symbols-outlined">save</span> Guardar';
  }

  async function uploadImage(file) {
    if (!file) return fields.imageUrl.value.trim();
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `tutorials/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
    if (error) throw error;

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function loadTutorials() {
    const { data, error } = await sb
      .from("app_tutorials")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!data?.length) {
      list.innerHTML = "<div class='muted'>Ainda não existem tutoriais.</div>";
      return;
    }

    list.innerHTML = data.map((item) => `
      <article class="tutorial-admin-item" data-id="${item.id}">
        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : "<div class='tutorial-admin-thumb'></div>"}
        <div class="tutorial-admin-item__body">
          <div class="tutorial-admin-item__title">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="badge">${item.is_published ? "Publicado" : "Oculto"}</span>
          </div>
          <p>${escapeHtml(item.description || "")}</p>
          ${item.video_url ? `<a href="${escapeHtml(item.video_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(videoLabel(item.video_url))}</a>` : ""}
        </div>
        <div class="tutorial-admin-item__actions">
          <button class="btn" type="button" data-action="edit">Editar</button>
          <button class="btn" type="button" data-action="delete">Apagar</button>
        </div>
      </article>
    `).join("");

    list.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest("[data-id]")?.dataset.id;
        const item = data.find((row) => row.id === id);
        if (!item) return;
        fields.id.value = item.id;
        fields.title.value = item.title || "";
        fields.description.value = item.description || "";
        fields.videoUrl.value = item.video_url || "";
        fields.imageUrl.value = item.image_url || "";
        fields.order.value = item.sort_order ?? 0;
        fields.published.checked = !!item.is_published;
        fields.imageFile.value = "";
        fields.save.innerHTML = '<span class="material-symbols-outlined">save</span> Atualizar';
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    list.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest("[data-id]")?.dataset.id;
        if (!id || !confirm("Apagar este tutorial?")) return;
        const { error } = await sb.from("app_tutorials").delete().eq("id", id);
        if (error) {
          Toast.error(error.message);
          return;
        }
        Toast.success("Tutorial apagado.");
        await loadTutorials();
      });
    });
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const old = fields.save.innerHTML;

    try {
      fields.save.disabled = true;
      fields.save.innerHTML = '<span class="material-symbols-outlined">sync</span> A guardar';

      const imageUrl = await uploadImage(fields.imageFile.files?.[0]);
      const payload = {
        title: fields.title.value.trim(),
        description: fields.description.value.trim() || null,
        video_url: fields.videoUrl.value.trim() || null,
        image_url: imageUrl || null,
        sort_order: Number(fields.order.value || 0),
        is_published: fields.published.checked,
      };

      if (!payload.title) throw new Error("O titulo é obrigatório.");

      const id = fields.id.value;
      const res = id
        ? await sb.from("app_tutorials").update(payload).eq("id", id)
        : await sb.from("app_tutorials").insert(payload);

      if (res.error) throw res.error;

      Toast.success(id ? "Tutorial atualizado." : "Tutorial criado.");
      resetForm();
      await loadTutorials();
    } catch (e) {
      Toast.error(e?.message || "Não foi possível guardar.");
    } finally {
      fields.save.disabled = false;
      fields.save.innerHTML = old;
    }
  });

  fields.reset.addEventListener("click", resetForm);
  await loadTutorials();
}
