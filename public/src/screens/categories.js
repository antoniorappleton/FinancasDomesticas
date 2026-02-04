// src/screens/categories.js
import { Categories } from "../lib/categories-crud.js";
import { repo } from "../lib/repo.js";

const coll = new Intl.Collator("pt-PT", { sensitivity: "base" });

export async function init() {
  const root = document.getElementById("outlet");

  // Inject HTML structure dynamically for the Refactor
  root.innerHTML = `
    <section class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
             <h2 class="section-title" style="margin:0">Categorias</h2>
             <button id="btn-add-main" class="btn btn--primary">
                <svg width="18" height="18" style="margin-right:4px; vertical-align:middle"><use href="#i-plus"/></svg>
                Nova Categoria
             </button>
        </div>
        
        <div style="margin-bottom:16px">
            <input type="text" id="cat-search" placeholder="Pesquisar categoria..." style="width:100%; padding:8px; border:1px solid var(--border); border-radius:8px">
        </div>

        <div id="cat-tree" class="tree-view">Loading...</div>
    </section>

    <!-- UNIFIED MODAL -->
    <dialog id="cat-modal" class="modal">
        <form id="cat-modal-form" method="dialog">
            <h3 id="modal-title">Nova Categoria</h3>
            
            <input type="hidden" id="modal-id">
            <input type="hidden" id="modal-parent-id">
            
            <label>
              Nome
              <input type="text" id="modal-name" required placeholder="Ex: Alimentação">
            </label>

            <label>
              Tipo
              <select id="modal-kind" required>
                 <option value="expense">Despesa</option>
                 <option value="income">Receita</option>
                 <option value="savings">Poupança</option>
              </select>
            </label>
            
            <!-- Parent Info (Read Only when set) -->
            <div id="modal-parent-info" class="row-note hidden" style="margin-bottom:12px">
               Subcategoria de: <strong id="modal-parent-name"></strong>
            </div>

            <div class="actions" style="justify-content:flex-end">
                <button type="button" id="modal-cancel" class="btn">Cancelar</button>
                <button type="submit" id="modal-save" class="btn btn--primary">Guardar</button>
            </div>
        </form>
    </dialog>
    
    <style>
      .tree-view { display: flex; flex-direction: column; gap: 4px; }
      .tree-row { 
          display: flex; align-items: center; justify-content: space-between; 
          padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface);
      }
      .tree-row:hover { background: var(--bg); }
      .tree-left { display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; }
      .tree-right { display: flex; align-items: center; gap: 4px; }
      
      .tree-toggle { 
          cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
          transition: transform 0.2s; color: var(--muted);
      }
      .tree-toggle.collapsed { transform: rotate(-90deg); }
      .tree-toggle.hidden { visibility: hidden; }

      .tree-child-list { margin-left: 32px; display: flex; flex-direction: column; gap: 4px; border-left: 2px solid var(--border); padding-left: 8px; margin-top: 4px; margin-bottom: 8px;}
      .tree-child-list.hidden { display: none; }
      
      .tree-child-row { 
          display: flex; align-items: center; justify-content: space-between; 
          padding: 6px 8px; border-radius: 6px; 
      }
      .tree-child-row:hover { background: var(--bg); }

      .icon-btn { 
          background: none; border: none; cursor: pointer; padding: 4px; 
          color: var(--muted); border-radius: 4px; display: flex; align-items: center; justify-content: center;
      }
      .icon-btn:hover { background: #e2e8f0; color: var(--text); }
      .icon-btn.disabled { opacity: 0.3; pointer-events: none; }

      .badge-sys { font-size: 0.7rem; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
      .badge-kind { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 600; }
      .bk-expense { color: #ef4444; background: #fee2e2; }
      .bk-income { color: #16a34a; background: #dcfce7; }
      .bk-savings { color: #2563eb; background: #dbeafe; }
      
      .modal { border:none; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); width: min(400px, 90vw); }
      .modal::backdrop { background: rgba(0,0,0,0.5); }
    </style>
  `;

  // --- STATE ---
  let treeData = [];
  let filter = "";
  let expandedMap = new Set(); // store expanded parent IDs
  // usage cache
  let usageMap = new Map();

  // --- ELEMENTS ---
  const treeEl = document.getElementById("cat-tree");
  const modal = document.getElementById("cat-modal");
  const searchEl = document.getElementById("cat-search");

  // MODAL FORM
  const mForm = document.getElementById("cat-modal-form");
  const mTitle = document.getElementById("modal-title");
  const mId = document.getElementById("modal-id");
  const mParentId = document.getElementById("modal-parent-id");
  const mName = document.getElementById("modal-name");
  const mKind = document.getElementById("modal-kind");
  const mParentInfo = document.getElementById("modal-parent-info");
  const mParentName = document.getElementById("modal-parent-name");
  const mCancel = document.getElementById("modal-cancel");

  // --- LOAD ---
  async function loadUsage() {
    try {
      const { data } = await window.sb.from("v_category_usage").select("*");
      if (data)
        usageMap = new Map(data.map((r) => [r.category_id, r.tx_count]));
    } catch {}
  }

  async function reload() {
    await loadUsage();
    treeData = await repo.getTree(); // unified System + User logic
    render();
  }

  // --- RENDER ---
  function render() {
    const q = filter.toLowerCase();

    // Filter Logic: If child matches, show parent. If parent matches, show all children.
    // We rebuild a display tree
    const displayList = [];

    for (const p of treeData) {
      const pMatch = p.name.toLowerCase().includes(q);
      const childrenMatch = p.children.filter((c) =>
        c.name.toLowerCase().includes(q),
      );

      if (pMatch || childrenMatch.length > 0) {
        displayList.push({
          ...p,
          children: pMatch ? p.children : childrenMatch, // if parent matches show all, else only matching kids
        });
      }
    }

    if (!displayList.length) {
      treeEl.innerHTML = `<div class="muted" style="text-align:center; padding:20px">Nenhuma categoria encontrada.</div>`;
      return;
    }

    treeEl.innerHTML = displayList.map((p) => renderParent(p)).join("");

    // Bind Events
    treeEl.querySelectorAll(".tree-toggle").forEach((el) => {
      el.addEventListener("click", () => toggleExpand(el.dataset.id));
    });

    treeEl.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        handleAction(el.dataset.action, el.dataset.id, el.dataset.ctx);
      });
    });
  }

  function renderParent(p) {
    const isExpanded = expandedMap.has(p.id) || filter.length > 0;
    const hasChildren = p.children && p.children.length > 0;

    // Icons
    const toggleIcon = hasChildren
      ? `<div class="tree-toggle ${isExpanded ? "" : "collapsed"}" data-id="${p.id}"><svg width="20" height="20"><use href="#i-chevron-down"/></svg></div>`
      : `<div class="tree-toggle hidden"></div>`;

    const badge = `<span class="badge-kind bk-${p.kind}">${kindLabel(p.kind)}</span>`;
    const sysLock = p.isSystem
      ? `<svg width="14" height="14" style="margin-left:6px; color:var(--muted)"><use href="#i-eye-off"/></svg>`
      : "";

    // Actions: Add Child (Always allowed), Edit/Delete (Only if NOT system)
    // Exception: System categories CANNOT be edited/deleted, but CAN accept children.

    const btnAdd = `<button class="icon-btn" title="Adicionar Subcategoria" data-action="add-child" data-id="${p.id}" data-ctx="${p.name}|${p.kind}">
        <svg width="16" height="16"><use href="#i-plus"/></svg>
      </button>`;

    const btnEdit = p.isSystem
      ? ""
      : `<button class="icon-btn" title="Editar" data-action="edit" data-id="${p.id}"><svg width="16" height="16"><use href="#i-cog"/></svg></button>`;

    const used = usageMap.get(p.id) || 0;
    const btnDel =
      p.isSystem || used > 0
        ? `<button class="icon-btn disabled" title="${p.isSystem ? "Sistema" : "Em uso"}"><svg width="16" height="16"><use href="#i-trash"/></svg></button>`
        : `<button class="icon-btn" title="Apagar" data-action="delete" data-id="${p.id}"><svg width="16" height="16"><use href="#i-trash"/></svg></button>`;

    const childrenHTML =
      isExpanded && hasChildren
        ? `<div class="tree-child-list">${p.children.map((c) => renderChild(c, p)).join("")}</div>`
        : "";

    return `
        <div class="tree-item">
            <div class="tree-row">
                <div class="tree-left">
                    ${toggleIcon}
                    <strong>${p.name}</strong>
                    ${sysLock}
                    ${badge}
                </div>
                <div class="tree-right">
                    ${btnAdd}
                    ${btnEdit}
                    ${btnDel}
                </div>
            </div>
            ${childrenHTML}
        </div>
      `;
  }

  function renderChild(c, parent) {
    const sysLock = c.isSystem
      ? `<svg width="14" height="14" style="margin-left:6px; color:var(--muted)"><use href="#i-eye-off"/></svg>`
      : "";
    // Actions
    const btnEdit = c.isSystem
      ? ""
      : `<button class="icon-btn" title="Editar" data-action="edit" data-id="${c.id}"><svg width="16" height="16"><use href="#i-cog"/></svg></button>`;

    const used = usageMap.get(c.id) || 0;
    const btnDel =
      c.isSystem || used > 0
        ? `<button class="icon-btn disabled" title="${c.isSystem ? "Sistema" : "Em uso"}"><svg width="16" height="16"><use href="#i-trash"/></svg></button>`
        : `<button class="icon-btn" title="Apagar" data-action="delete" data-id="${c.id}"><svg width="16" height="16"><use href="#i-trash"/></svg></button>`;

    return `
        <div class="tree-child-row">
            <div class="tree-left">
                <span>${c.name}</span>
                ${sysLock}
            </div>
            <div class="tree-right">
                ${btnEdit}
                ${btnDel}
            </div>
        </div>
      `;
  }

  function kindLabel(k) {
    if (k === "expense") return "Despesa";
    if (k === "income") return "Receita";
    if (k === "savings") return "Poupança";
    return k;
  }

  function toggleExpand(id) {
    if (expandedMap.has(id)) expandedMap.delete(id);
    else expandedMap.add(id);
    render();
  }

  // --- ACTIONS ---
  async function handleAction(action, id, ctx) {
    if (action === "delete") {
      if (!confirm("Tem a certeza que deseja apagar esta categoria?")) return;
      try {
        await Categories.remove(id);
        await reload();
      } catch (e) {
        alert(e.message);
      }
    } else if (action === "add-child") {
      // ctx = "Parent Name|Kind"
      const [pName, pKind] = ctx.split("|");
      openModal({
        type: "child",
        parentId: id,
        parentName: pName,
        kind: pKind,
      });
    } else if (action === "edit") {
      // find in tree
      let target = null;
      for (const p of treeData) {
        if (p.id == id) {
          target = p;
          break;
        }
        const c = p.children.find((x) => x.id == id);
        if (c) {
          target = c;
          break;
        }
      }
      if (target) openModal({ type: "edit", row: target });
    }
  }

  document.getElementById("btn-add-main").onclick = () => {
    openModal({ type: "parent" });
  };

  // --- MODAL LOGIC ---
  function openModal({ type, row, parentId, parentName, kind }) {
    mForm.reset();
    mId.value = "";
    mParentId.value = "";
    mParentInfo.classList.add("hidden");
    mKind.disabled = false;

    if (type === "parent") {
      mTitle.textContent = "Nova Categoria Principal";
      mKind.value = "expense";
    } else if (type === "child") {
      mTitle.textContent = "Nova Subcategoria";
      mParentId.value = parentId;
      mParentName.textContent = parentName;
      mParentInfo.classList.remove("hidden");
      mKind.value = kind;
      mKind.disabled = true; // Lock kind to parent
    } else if (type === "edit") {
      mTitle.textContent = "Editar Categoria";
      mId.value = row.id;
      mName.value = row.name;
      mKind.value = row.kind;
      mParentId.value = row.parent_id || "";

      // If editing a child, lock kind
      if (row.parent_id) {
        mParentInfo.classList.remove("hidden");
        // find parent name
        // We need to look it up from treeData (or cache)
        const p = treeData.find((x) => x.id == row.parent_id);
        mParentName.textContent = p ? p.name : "(Pai desconhecido)";
        mKind.disabled = true;
      } else {
        // Editing parent: Check if it has children? If yes, ideally warn/lock kind
        // For simplicity, we allow editing kind if user wants (repo might allow it or constraint)
        // But user requested "Lock". Let's lock if it has children.
        const hasKids = row.children && row.children.length > 0;
        if (hasKids) mKind.disabled = true;
      }
    }

    modal.showModal();
  }

  mCancel.onclick = () => modal.close();

  mForm.onsubmit = async (e) => {
    e.preventDefault();

    const payload = {
      name: mName.value,
      kind: mKind.value,
      parent_id: mParentId.value || null,
    };

    const id = mId.value;

    try {
      if (id) {
        await Categories.update(id, payload);
      } else {
        await Categories.create(payload);
      }
      modal.close();
      await reload();
    } catch (e) {
      alert("Erro: " + e.message);
    }
  };

  searchEl.addEventListener("input", (e) => {
    filter = e.target.value;
    render();
  });

  // Init
  await reload();
}
