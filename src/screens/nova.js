export async function init() {
  const sb = window.sb;
  const $ = (id) => document.getElementById(id);
  const show = (el, on=true) => el.classList.toggle("hidden", !on);

  // ------------------------------------------------ helpers
  const todayISO = () => {
    const d = new Date(); d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  };
  const parseAmount = (s) => {
    if (typeof s === "number") return s;
    if (!s) return 0;
    return Number(String(s).replace(",", "."));
  };
  const toast = (msg, ok=true) => {
    const box = $("tx-msg");
    box.style.display = "block";
    box.style.borderLeft = ok ? "4px solid #16a34a" : "4px solid #ef4444";
    box.textContent = msg;
    setTimeout(()=> box.style.display="none", 3000);
  };

  // ------------------------------------------------ carregar referências
  $("tx-date").value = todayISO();

  const [
    accRes, regRes, pmRes, stRes, ttypeRes
  ] = await Promise.all([
    sb.from("accounts").select("id,name").order("name"),
    sb.from("regularities").select("id,name_pt").order("name_pt"),
    sb.from("payment_methods").select("id,name_pt").order("name_pt"),
    sb.from("statuses").select("id,code,name_pt").order("id"),
    sb.from("transaction_types").select("id,code")
  ]);

  if (accRes.error)  { console.error(accRes.error);  toast("Erro a carregar contas", false); return; }
  if (regRes.error)  { console.error(regRes.error);  toast("Erro a carregar regularidades", false); return; }
  if (pmRes.error)   { console.error(pmRes.error);   toast("Erro a carregar métodos", false); return; }
  if (stRes.error)   { console.error(stRes.error);   toast("Erro a carregar estados", false); return; }
  if (ttypeRes.error){ console.error(ttypeRes.error);toast("Erro a carregar tipos", false); return; }

  const TYPE_ID = Object.fromEntries((ttypeRes.data||[]).map(t => [t.code, t.id]));

  const fill = (el, rows, label, value="id") => {
    el.innerHTML = (rows||[]).map(r => `<option value="${r[value]}">${r[label]}</option>`).join("");
  };

  fill($("tx-account"),       accRes.data, "name");
  fill($("tx-account-from"),  accRes.data, "name");
  fill($("tx-account-to"),    accRes.data, "name");
  fill($("tx-regularity"),    regRes.data, "name_pt");
  fill($("tx-method"),        pmRes.data,  "name_pt");
  fill($("tx-status"),        stRes.data,  "name_pt");

  // categorias variam com o tipo
  async function loadCategories(kind) {
    // kind: 'income' | 'expense' | 'savings'
    const { data, error } = await sb
      .from("categories")
      .select("id,name,parent_id")
      .eq("kind", kind)
      .order("name");
    if (error) { console.error(error); toast("Erro a carregar categorias", false); return; }

    // montar label "Pai > Filho"
    const parents = new Map((data||[]).filter(c=>!c.parent_id).map(c=>[c.id,c.name]));
    const rows = (data||[]).map(c => ({
      id: c.id,
      label: c.parent_id ? `${parents.get(c.parent_id) || ""} > ${c.name}` : c.name
    }));
    fill($("tx-category"), rows, "label");
  }

  // estado inicial: Receita
  await loadCategories("income");

  // toggle tipo
  const rowAccSingle = $("row-account-single");
  const rowAccTransfer = $("row-account-transfer");
  const rowCategory = $("row-category");

  function currentType() {
    const el = document.querySelector('input[name="tx-type"]:checked');
    return el?.value || "INCOME";
  }

  async function applyTypeUI() {
    const t = currentType();
    if (t === "TRANSFER") {
      show(rowAccSingle, false);
      show(rowCategory, false);
      show(rowAccTransfer, true);
    } else {
      show(rowAccSingle, true);
      show(rowCategory, true);
      show(rowAccTransfer, false);
      const map = { INCOME: "income", EXPENSE: "expense", SAVINGS: "savings" };
      await loadCategories(map[t] || "expense");
    }
  }
  document.querySelectorAll('input[name="tx-type"]').forEach(r => {
    r.addEventListener("change", applyTypeUI);
  });

  // ------------------------------------------------ guardar
  $("tx-save").addEventListener("click", async () => {
    try {
      const type = currentType();
      const date = $("tx-date").value;
      const amount = parseAmount($("tx-amount").value);
      if (!date) throw new Error("Escolhe a data.");
      if (!(amount > 0)) throw new Error("Valor inválido.");

      const description = $("tx-desc").value || null;
      const location    = $("tx-loc").value || null;
      const notes       = $("tx-notes").value || null;

      if (type === "TRANSFER") {
        const from_account = $("tx-account-from").value;
        const to_account   = $("tx-account-to").value;
        if (!from_account || !to_account || from_account === to_account) {
          throw new Error("Seleciona contas distintas na transferência.");
        }
        const { error } = await sb.rpc("create_transfer", {
          p_from_account: from_account,
          p_to_account:   to_account,
          p_amount:       amount,
          p_date:         date,
          p_description:  description,
          p_notes:        notes,
          p_status_code:  "DONE"
        });
        if (error) throw error;
        toast("Transferência registada ✅");
      } else {
        const account_id       = $("tx-account").value;
        const category_id      = $("tx-category").value || null;
        const regularity_id    = Number($("tx-regularity").value) || null;
        const payment_method_id= Number($("tx-method").value) || null;
        const status_id        = Number($("tx-status").value) || null;

        const payload = {
          user_id:        (await sb.auth.getUser()).data.user.id, // RLS garante o mesmo
          type_id:        TYPE_ID[type],
          regularity_id,  account_id, category_id,
          payment_method_id, status_id,
          date, amount, description, location, notes, currency: "EUR"
        };
        const { error } = await sb.from("transactions").insert([payload]);
        if (error) throw error;
        toast("Transação registada ✅");
      }

      // reset rápido do formulário
      $("tx-amount").value = "";
      $("tx-desc").value = "";
      $("tx-notes").value = "";
    } catch (e) {
      console.error(e);
      toast("Erro: " + (e.message || e), false);
    }
  });

  $("tx-clear").addEventListener("click", () => {
    $("tx-amount").value = "";
    $("tx-desc").value = "";
    $("tx-loc").value  = "";
    $("tx-notes").value= "";
  });

  // aplica UI no arranque
  await applyTypeUI();
}
// depois de carregar accounts:
const accounts = accRes.data || [];
if (accounts.length === 0) {
  const box = document.getElementById("tx-msg");
  box.style.display = "block";
  box.style.borderLeft = "4px solid #ef4444";
  box.innerHTML = "Ainda não tens contas. <button id='mk-demo' class='btn'>Criar contas demo</button>";
  document.getElementById("mk-demo").onclick = async () => {
    const { data:{ user } } = await sb.auth.getUser();
    await sb.from('accounts').insert([
      { user_id: user.id, name:'CGD', type:'bank' },
      { user_id: user.id, name:'Carteira', type:'cash' }
    ]);
    location.reload();
  };
  // Preenche selects com placeholder desativado
  ["tx-account","tx-account-from","tx-account-to"].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = `<option>— Sem contas —</option>`; el.disabled = true;
  });
  return; // não prossegue até haver contas
}
