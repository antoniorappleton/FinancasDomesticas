// src/screens/categories.js
import { Categories } from "../lib/categories-crud.js";

export async function init() {
  const listEl   = document.getElementById("cat-list");
  const form     = document.getElementById("cat-form");
  const nameEl   = document.getElementById("cat-name");
  const kindEl   = document.getElementById("cat-kind");
  const parentEl = document.getElementById("cat-parent");
  const searchEl = document.getElementById("cat-search");

  const dlg      = document.getElementById("cat-edit");
  const editForm = document.getElementById("edit-form");
  const editId   = document.getElementById("edit-id");
  const editName = document.getElementById("edit-name");
  const editKind = document.getElementById("edit-kind");
  const editParent = document.getElementById("edit-parent");
  const editCancel = document.getElementById("edit-cancel");

  let cache = { parents: [], children: [], all: [] };
  let filter = "";

  const coll = new Intl.Collator("pt-PT", { sensitivity:"base" });

  function renderParentsSelect(selectEl) {
    selectEl.innerHTML = `<option value="">(sem pai)</option>` +
      cache.parents
        .sort((a,b)=>coll.compare(a.name,b.name))
        .map(p => `<option value="${p.id}">${p.name}${p.isSystem ? " (sistema)" : ""}</option>`)
        .join("");
  }

  function renderList() {
    const rows = cache.all
      .filter(r => r.path.toLowerCase().includes(filter.toLowerCase()))
      .sort((a,b)=>coll.compare(a.path,b.path));

    if (!rows.length) {
      listEl.innerHTML = `<p class="muted">Sem categorias.</p>`;
      return;
    }

    listEl.innerHTML = `
      <div class="tbl">
        <div class="tr th">
          <div>Categoria</div><div>Tipo</div><div>Origem</div><div class="right">Ações</div>
        </div>
        ${rows.map(r => `
          <div class="tr">
            <div>${r.path}</div>
            <div>${r.kind}</div>
            <div>${r.isSystem ? "Sistema" : "Minha"}</div>
            <div class="right">
              ${r.isSystem ? "" : `
                <button class="btn btn--sm" data-edit="${r.id}">Editar</button>
                <button class="btn btn--sm btn--danger" data-del="${r.id}">Apagar</button>
              `}
            </div>
          </div>
        `).join("")}
      </div>`;

    listEl.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => openEdit(btn.dataset.edit)));
    listEl.querySelectorAll("[data-del]").forEach(btn =>
      btn.addEventListener("click", () => onDelete(btn.dataset.del)));
  }

  async function reload() {
    cache = await Categories.listAll();
    renderParentsSelect(parentEl);
    renderParentsSelect(editParent);
    renderList();

    // Notificar outros ecrãs (ex.: nova.js) que a árvore mudou
    window.dispatchEvent(new CustomEvent("categories:changed"));
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await Categories.create({
        name: nameEl.value,
        kind: kindEl.value,
        parent_id: parentEl.value || null
      });
      nameEl.value = ""; parentEl.value = "";
      await reload();
    } catch (err) { alert(err?.message || String(err)); }
  });

  searchEl?.addEventListener("input", () => {
    filter = searchEl.value || "";
    renderList();
  });

  function openEdit(id) {
    const row = cache.all.find(r => r.id === id);
    if (!row) return;
    editId.value = row.id;
    editName.value = row.name;
    editKind.value = row.kind;
    editParent.value = row.parent_id || "";
    dlg.showModal();
  }
  editCancel?.addEventListener("click", () => dlg.close());

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await Categories.update(editId.value, {
        name: editName.value,
        kind: editKind.value,
        parent_id: editParent.value || null
      });
      dlg.close();
      await reload();
    } catch (err) { alert(err?.message || String(err)); }
  });

  async function onDelete(id) {
    if (!confirm("Apagar esta categoria?")) return;
    try { await Categories.remove(id); await reload(); }
    catch (err) { alert(err?.message || String(err)); }
  }

  await reload();
}
