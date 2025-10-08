// src/screens/categories.js
import { Categories } from "../lib/categories-crud.js";

const coll = new Intl.Collator("pt-PT", { sensitivity: "base" });

export async function init() {
  // form + filtros
  const form = document.getElementById("cat-form");
  const nameEl = document.getElementById("cat-name");
  const kindEl = document.getElementById("cat-kind");
  const parentEl = document.getElementById("cat-parent");
  const searchEl = document.getElementById("cat-search");
  const showSystemEl = document.getElementById("toggle-system");
  const parentsOnlyEl = document.getElementById("toggle-parents-only");

  // listas
  const mineWrap = document.getElementById("cat-cards");
  const sysWrap = document.getElementById("sys-cards");
  const sysCard = document.getElementById("sys-card");
  const noMine = document.getElementById("no-mine");
  const noSys = document.getElementById("no-sys");

  // modal
  const dlg = document.getElementById("cat-edit");
  const editForm = document.getElementById("edit-form");
  const editId = document.getElementById("edit-id");
  const editName = document.getElementById("edit-name");
  const editKind = document.getElementById("edit-kind");
  const editParent = document.getElementById("edit-parent");
  const editCancel = document.getElementById("edit-cancel");

  // cache
  let cache = { all: [], parents: [], usage: new Map() };
  let filter = "";
  let showSystem = false;
  let parentsOnly = false;

  async function loadUsage() {
    try {
      const { data, error } = await window.sb
        .from("v_category_usage")
        .select("*");
      if (!error && Array.isArray(data)) {
        cache.usage = new Map(data.map((r) => [r.category_id, r.tx_count]));
      }
    } catch {
      /* ignore se não existir */
    }
  }

  function normalize(s) {
    return String(s || "")
      .toLocaleLowerCase("pt-PT")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function renderParentsSelect(selectEl, list) {
    selectEl.innerHTML =
      `<option value="">(sem pai)</option>` +
      list
        .sort((a, b) => coll.compare(a.name, b.name))
        .map(
          (p) =>
            `<option value="${p.id}">${p.name}${
              p.isSystem ? " (sistema)" : ""
            }</option>`
        )
        .join("");
  }

  function badgeKind(kind) {
    const map = {
      expense: "Despesa",
      income: "Receita",
      savings: "Poupança",
      transfer: "Transferência",
    };
    const classMap = {
      expense: "pill pill--expense",
      income: "pill pill--income",
      savings: "pill pill--save",
      transfer: "pill",
    };
    return `<span class="${classMap[kind] || "pill"}">${
      map[kind] || kind
    }</span>`;
  }

  function cardHTML(parent, children, isMine) {
    // linha "Subcategorias: A, B, C"
    const subtitle = children.length
      ? `Subcategorias: ${children
          .map((c) => c.name)
          .sort((a, b) => coll.compare(a, b))
          .join(", ")}`
      : `<span class="muted">Sem subcategorias</span>`;

    const usage = cache.usage.get(parent.id) || 0;
    const actions = isMine
      ? `
        <div class="card-actions">
          <button class="icon-btn" title="Editar" data-edit="${parent.id}">✏️</button>
          <button class="icon-btn" title="Apagar" data-del="${parent.id}">🗑️</button>
        </div>`
      : "";

    const lockInfo =
      usage > 0 ? `<span class="muted">(${usage} registos)</span>` : "";

    return `
      <div class="cat-card" data-id="${parent.id}">
        <div class="cat-card__row">
          <div class="cat-card__title">
            <strong>${parent.name}</strong>
            ${badgeKind(parent.kind)}
            ${
              isMine
                ? `<span class="badge badge-user">Minha</span>`
                : `<span class="badge badge-system">Sistema</span>`
            }
          </div>
          ${actions}
        </div>
        <div class="cat-card__subtitle">${subtitle} ${lockInfo}</div>
      </div>
    `;
  }

  function render() {
    // filtrar por texto e por pais/filhos
    const matches = (c) =>
      (c.name && c.name.toLowerCase().includes(filter)) ||
      (c.path && c.path.toLowerCase().includes(filter));

    const parents = cache.all.filter((c) => !c.parent_id);
    const children = cache.all.filter((c) => c.parent_id);

    // dividir por origem
    const myParents = parents.filter((p) => !p.isSystem);
    const sysParents = parents.filter((p) => p.isSystem);

    // dropdowns (pais únicos)
    renderParentsSelect(parentEl, myParents.concat(sysParents));
    renderParentsSelect(editParent, myParents.concat(sysParents));

    // build map id->children
    const byParent = new Map();
    for (const ch of children) {
      if (parentsOnly && ch.parent_id) continue;
      const arr = byParent.get(ch.parent_id) || [];
      arr.push(ch);
      byParent.set(ch.parent_id, arr);
    }

    // cards MINHAS
    const myVisible = myParents
      .filter((p) => matches(p))
      .sort((a, b) => coll.compare(a.name, b.name));

    mineWrap.innerHTML = myVisible
      .map((p) => {
        const kids = (byParent.get(p.id) || []).filter(matches);
        return cardHTML(p, kids, true);
      })
      .join("");
    noMine.classList.toggle("hidden", myVisible.length > 0);

    // cards SISTEMA (só se toggle ativo)
    sysCard.classList.toggle("hidden", !showSystem);
    if (showSystem) {
      const sysVisible = sysParents
        .filter((p) => matches(p))
        .sort((a, b) => coll.compare(a.name, b.name));
      sysWrap.innerHTML = sysVisible
        .map((p) => {
          const kids = (byParent.get(p.id) || []).filter(matches);
          return cardHTML(p, kids, false);
        })
        .join("");
      noSys.classList.toggle("hidden", sysVisible.length > 0);
    } else {
      sysWrap.innerHTML = "";
    }

    // bind actions (editar/apagar) apenas nas minhas
    mineWrap
      .querySelectorAll("[data-edit]")
      .forEach((b) =>
        b.addEventListener("click", () => openEdit(b.dataset.edit))
      );
    mineWrap
      .querySelectorAll("[data-del]")
      .forEach((b) =>
        b.addEventListener("click", () => onDelete(b.dataset.del))
      );
  }

  async function reload() {
    const data = await Categories.listAll(); // {all, parents, children}
    // construir path (Pai > Filho)
    const pmap = new Map(data.parents.map((p) => [p.id, p.name]));
    const all = data.all.map((c) => ({
      ...c,
      path: c.parent_id
        ? `${pmap.get(c.parent_id) || "?"} > ${c.name}`
        : c.name,
    }));
    cache = { ...cache, all, parents: data.parents };
    await loadUsage();
    render();
    window.dispatchEvent(new CustomEvent("categories:changed"));
  }

  // eventos
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await Categories.create({
        name: nameEl.value,
        kind: kindEl.value,
        parent_id: parentEl.value || null,
      });
      nameEl.value = "";
      parentEl.value = "";
      await reload();
    } catch (err) {
      alert(err?.message || String(err));
    }
  });

  searchEl.addEventListener("input", () => {
    filter = (searchEl.value || "").toLowerCase();
    render();
  });
  showSystemEl.addEventListener("change", () => {
    showSystem = !!showSystemEl.checked;
    render();
  });
  parentsOnlyEl.addEventListener("change", () => {
    const v = !!parentsOnlyEl.checked;
    parentsOnly = v;
    render();
  });

  function openEdit(id) {
    const row = cache.all.find((r) => r.id === id);
    if (!row) return;
    editId.value = row.id;
    editName.value = row.name;
    editKind.value = row.kind;
    editParent.value = row.parent_id || "";
    dlg.showModal();
  }
  editCancel.addEventListener("click", () => dlg.close());

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await Categories.update(editId.value, {
        name: editName.value,
        kind: editKind.value,
        parent_id: editParent.value || null,
      });
      dlg.close();
      await reload();
    } catch (err) {
      alert(err?.message || String(err));
    }
  });

  async function onDelete(id) {
    const used = cache.usage.get(id) || 0;
    if (used > 0)
      return alert(
        `Não é possível apagar: existem ${used} registo(s) com esta categoria.`
      );
    if (!confirm("Apagar esta categoria?")) return;
    try {
      await Categories.remove(id);
      await reload();
    } catch (err) {
      alert(err?.message || String(err));
    }
  }

  // --- Ajuda do ecrã (Dashboard) ---
  (function mountHelpForDashboard() {
    // cria botão se não existir
    let btn = document.getElementById("help-fab");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "help-fab";
      btn.className = "help-fab";
      btn.title = "Ajuda deste ecrã";
      btn.innerHTML = `<svg aria-hidden="true"><use href="#i-info"></use></svg>`;
      document.body.appendChild(btn);
    }

    // cria popup se não existir
    let pop = document.getElementById("help-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "help-pop";
      pop.className = "help-pop hidden";
      document.body.appendChild(pop);
    }

    // conteúdo específico do Dashboard
    pop.innerHTML = `
    <h3>O que mostra este ecrã?</h3>
    <p>Pode criar as suas própria categorias, "Pai" e "filho" ou seja, categorias e subcategorias</p>
    <button class="close" type="button">Fechar</button>
  `;

    // liga eventos (uma vez)
    btn.onclick = () => pop.classList.toggle("hidden");
    pop
      .querySelector(".close")
      ?.addEventListener("click", () => pop.classList.add("hidden"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") pop.classList.add("hidden");
    });
  })();

  // boot
  await reload();
}
