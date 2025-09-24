export async function init() {
  const sb = window.sb;
  const wrap = document.getElementById("transactions-list");
  if (!wrap) return;

  const { data, error } = await sb
    .from("v_ledger")
    .select("*")
    .order("date", { ascending: false })
    .limit(50);

  if (error) {
    wrap.innerHTML = `<div class="card">Erro a carregar: ${error.message}</div>`;
    return;
  }
  wrap.innerHTML = (data||[]).map(r => `
    <div class="card" style="display:flex;justify-content:space-between;gap:8px">
      <div>
        <div><strong>${r.description || '(Sem descrição)'}</strong></div>
        <small>${new Date(r.date).toLocaleDateString('pt-PT')} • ${r.category_path || '(Sem categoria)'} • ${r.account_name}</small>
      </div>
      <div style="text-align:right;font-weight:700;color:${r.amount_signed>=0?'#16a34a':'#ef4444'}">
        € ${Math.abs(Number(r.amount_signed||0)).toFixed(2)}
      </div>
    </div>
  `).join("");
}
