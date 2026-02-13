import { Categories } from "../lib/categories-crud.js";
import { repo } from "../lib/repo.js";
import { loadTheme } from "../lib/theme.js";

export async function init() {
  const sb = window.sb;
  if (sb) await loadTheme(sb);
  console.log("🚀 Categories Screen Native CSS Loaded");

  // DOM Elements
  const container = document.getElementById("cat-list-container");
  const searchEl = document.getElementById("cat-search");
  const modalOverlay = document.getElementById("cat-modal-overlay");

  // Modal Inputs
  const mForm = document.getElementById("cat-modal-form");
  const mId = document.getElementById("modal-id");
  const mParentId = document.getElementById("modal-parent-id");
  const mName = document.getElementById("modal-name");
  const mKind = document.getElementById("modal-kind");
  const mParentSection = document.getElementById("modal-parent-section");
  const mParentName = document.getElementById("modal-parent-name");
  const mTitle = document.getElementById("modal-title");

  if (!container) return; // Guard clause

  // State
  let treeData = [];
  let currentKind = "expense"; // Default view
  let filter = "";
  let expanded = new Set(); // Track expanded parent IDs

  // Event: Toggle Kind
  window.addEventListener("cat:filter", (e) => {
    currentKind = e.detail;
    render();
  });

  // --- REPO LOAD ---
  async function reload() {
    try {
      container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted)">A carregar...</div>`;
      treeData = await repo.getTree();
      render();
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--red-500)">Erro: ${e.message}</div>`;
    }
  }

  // --- RENDER ---
  function render() {
    const q = filter.toLowerCase();

    // Filter
    let visibleParents = treeData.filter((p) => p.kind === currentKind);
    if (filter) {
      visibleParents = visibleParents.filter((p) => {
        const pMatch = p.name.toLowerCase().includes(q);
        const cMatch = p.children.some((c) => c.name.toLowerCase().includes(q));
        return pMatch || cMatch;
      });
    }

    if (visibleParents.length === 0) {
      container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted)">Nenhuma categoria encontrada.</div>`;
      return;
    }

    let html = `<div>`;

    visibleParents.forEach((p) => {
      const pMatch = p.name.toLowerCase().includes(q);
      const visibleChildren = filter
        ? p.children.filter((c) => c.name.toLowerCase().includes(q) || pMatch)
        : p.children;

      const isExpanded = expanded.has(String(p.id)) || !!filter; // Auto-expand on search

      // Parent
      html += renderItem(p, true, visibleChildren.length, isExpanded);

      // Children (only if expanded)
      if (visibleChildren.length > 0 && isExpanded) {
        html += `<div style="padding-left: 24px; position:relative;">
                        <!-- Connector line -->
                        <div style="position:absolute; left:20px; top:0; bottom:20px; width:2px; background:var(--border);"></div>
                        ${visibleChildren.map((c) => renderItem(c, false)).join("")}
                     </div>`;
      }
    });

    html += `</div>`;
    container.innerHTML = html;

    // Attach Click Events (Native)
    // 1. Toggle Expand (Parent)
    container.querySelectorAll(".cat-item-parent").forEach((el) => {
      el.onclick = () => toggleExpand(el.dataset.id);
    });

    // 2. Actions
    container.querySelectorAll(".btn-edit").forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        openEdit(el.dataset.id);
      };
    });
    container.querySelectorAll(".btn-sub").forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        openCreate(el.dataset.id, el.dataset.name);
      };
    });
  }

  function toggleExpand(id) {
    if (expanded.has(String(id))) expanded.delete(String(id));
    else expanded.add(String(id));
    render();
  }

  function renderItem(item, isParent, childCount = 0, isExpanded = false) {
    const icon = getIconFor(item.name);
    // Fallback: check user_id if isSystem is missing
    const isSystem = item.isSystem || item.user_id === null;
    const locked = isSystem;

    // Determine colors based on kind
    let colorVar = "var(--muted)";
    if (item.kind === "expense") colorVar = "var(--red-500)";
    if (item.kind === "income") colorVar = "var(--green-500)";
    if (item.kind === "savings") colorVar = "var(--blue-500)";

    const nameStyle = isParent
      ? "font-weight:700; color:var(--text);"
      : "font-size:14px; color:var(--text); opacity:0.9;";
    const iconSize = isParent ? "20px" : "18px";
    const boxSize = isParent ? "40px" : "32px";

    // Explicit visible lock icon
    const lockedIcon = locked
      ? `<span class="material-symbols-outlined" title="Categoria de Sistema (Não editável)" style="font-size:16px; color:var(--muted); margin-left:8px; opacity:0.6;">lock</span>`
      : "";

    // Chevron logic
    const chevronStyle = `transition: transform 0.2s; transform: rotate(${isExpanded ? "180deg" : "0deg"}); color:var(--muted); font-size:20px;`;
    const chevron =
      isParent && childCount > 0
        ? `<span class="material-symbols-outlined" style="${chevronStyle}">expand_more</span>`
        : "";

    // Class for click handler
    const parentClass = isParent ? "cat-item-parent" : "";

    return `
    <div class="cat-item ${parentClass}" data-id="${item.id}" style="cursor: pointer; position:relative; user-select:none;">
        <div class="icon-box" style="width:${boxSize}; height:${boxSize}; background: ${isParent ? "rgba(0,0,0,0.04)" : "transparent"};">
            <span class="material-symbols-outlined" style="font-size:${iconSize}; color:${colorVar};">${icon}</span>
        </div>
        
        <div style="flex:1;">
            <div style="display:flex; align-items:center;">
                <span style="${nameStyle}">${item.name}</span>
                ${lockedIcon}
            </div>
            ${isParent && childCount > 0 ? `<div style="font-size:11px; color:var(--muted);">${childCount} subcategorias</div>` : ""}
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
            <div class="actions-reveal" style="display:flex; gap:4px;">
                ${
                  isParent
                    ? `
                <button class="btn-sub btn" style="width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:50%; border:none; background:transparent;" title="Nova Subcategoria" data-id="${item.id}" data-name="${item.name}">
                    <span class="material-symbols-outlined" style="font-size:18px; color:var(--muted);">add</span>
                </button>`
                    : ""
                }
                
                ${
                  !locked
                    ? `
                <button class="btn-edit btn" style="width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:50%; border:none; background:transparent;" title="Editar" data-id="${item.id}">
                    <span class="material-symbols-outlined" style="font-size:18px; color:var(--muted);">edit</span>
                </button>`
                    : ""
                }
            </div>
            ${chevron}
        </div>
    </div>`;
  }

  function getIconFor(name) {
    const n = name.toLowerCase();
    if (n.includes("casa") || n.includes("jardim") || n.includes("moradia"))
      return "home";
    if (n.includes("carro") || n.includes("transporte") || n.includes("auto"))
      return "directions_car";
    if (
      n.includes("aliment") ||
      n.includes("jantar") ||
      n.includes("supermercado")
    )
      return "restaurant";
    if (n.includes("saude") || n.includes("medic") || n.includes("farmácia"))
      return "medical_services";
    if (n.includes("lazer") || n.includes("cinema") || n.includes("férias"))
      return "theater_comedy";
    if (n.includes("shop") || n.includes("compra") || n.includes("roupa"))
      return "shopping_bag";
    if (n.includes("salário") || n.includes("rendimento")) return "payments";
    return "category";
  }

  // --- ACTIONS ---
  const btnGlobalAdd = document.getElementById("btn-add-global");
  if (btnGlobalAdd) btnGlobalAdd.onclick = () => openCreate();

  function openCreate(parentId = null, parentName = null) {
    mForm.reset();
    mId.value = "";
    mParentId.value = parentId || "";

    if (parentId) {
      document.getElementById("modal-title").innerText = "Nova Subcategoria";
      mParentSection.classList.remove("hidden");
      mParentName.innerText = parentName;
      mKind.disabled = true;
      mKind.value = currentKind;
    } else {
      document.getElementById("modal-title").innerText = "Nova Categoria";
      mParentSection.classList.add("hidden");
      mKind.disabled = false;
      mKind.value = currentKind;
    }

    modalOverlay.classList.remove("hidden");
    setTimeout(() => mName.focus(), 100);
  }

  function openEdit(id) {
    let target = null;
    // Search in current Tree
    for (const p of treeData) {
      if (String(p.id) === String(id)) {
        target = p;
        break;
      }
      const c = p.children.find((child) => String(child.id) === String(id));
      if (c) {
        target = c;
        break;
      }
    }

    if (!target) return;

    mId.value = target.id;
    mName.value = target.name;
    mKind.value = target.kind;
    mParentId.value = target.parent_id || "";

    if (target.isSystem) {
      alert("Categorias de sistema não podem ser editadas.");
      return;
    }

    if (target.parent_id) {
      document.getElementById("modal-title").innerText = "Editar Subcategoria";
      mParentSection.classList.remove("hidden");
      // Find parent name
      let pName = "...";
      for (const p of treeData) {
        if (p.id === target.parent_id) {
          pName = p.name;
          break;
        }
      }
      mParentName.innerText = pName;
      mKind.disabled = true;
    } else {
      document.getElementById("modal-title").innerText = "Editar Categoria";
      mParentSection.classList.add("hidden");
      mKind.disabled = false;
    }

    modalOverlay.classList.remove("hidden");
  }

  mForm.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: mName.value,
      kind: mKind.value,
      parent_id: mParentId.value || null,
    };

    const id = mId.value;
    const btn = document.getElementById("modal-save");

    try {
      btn.innerText = "A guardar...";
      btn.disabled = true;

      if (id) await Categories.update(id, payload);
      else await Categories.create(payload);

      modalOverlay.classList.add("hidden");
      await reload();
    } catch (err) {
      alert("Erro: " + err.message);
    } finally {
      btn.innerText = "Guardar";
      btn.disabled = false;
    }
  };

  if (searchEl) {
    searchEl.addEventListener("input", (e) => {
      filter = e.target.value;
      render();
    });
  }

  // Init
  await reload();
}
