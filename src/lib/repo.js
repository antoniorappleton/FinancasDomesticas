// Camada de acesso a dados (Supabase) + regras de negócio
(function () {
  const cache = {
    typeIds: {}, // ex.: { INCOME: 1, EXPENSE: 2, ... }
  };

  async function requireUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Precisas de iniciar sessão.");
    return user;
  }

  async function idByCode(table, code) {
    if (table === "transaction_types" && cache.typeIds[code]) return cache.typeIds[code];
    const { data, error } = await supabase
      .from(table).select("id, code").eq("code", code).single();
    if (error) throw new Error(`Código inválido em ${table}: ${code}`);
    if (table === "transaction_types") cache.typeIds[code] = data.id;
    return data.id;
  }

  async function accountCurrency(account_id) {
    const { data, error } = await supabase
      .from("accounts").select("currency").eq("id", account_id).single();
    if (error) throw error;
    return data?.currency || "EUR";
  }

  // ========= Referências =========
  const refs = {
    async regularities() {
      const { data, error } = await supabase.from("regularities").select("*").order("name_pt");
      if (error) throw error;
      return data;
    },
    async paymentMethods() {
      const { data, error } = await supabase.from("payment_methods").select("*").order("name_pt");
      if (error) throw error;
      return data;
    },
    async statuses() {
      const { data, error } = await supabase.from("statuses").select("*").order("name_pt");
      if (error) throw error;
      return data;
    },
    async categories(kind) {
      const u = await requireUser();
      let q = supabase.from("categories")
        .select("id,name,parent_id,kind,user_id")
        .eq("kind", kind)
        .or(`user_id.is.null,user_id.eq.${u.id}`)
        .order("name", { ascending: true });

      const { data, error } = await q;
      if (error) throw error;

      const { data: parents } = await supabase
        .from("categories")
        .select("id,name")
        .is("parent_id", null)
        .or(`user_id.is.null,user_id.eq.${u.id}`);

      const pmap = new Map((parents || []).map(p => [p.id, p.name]));
      return (data || []).map(c => ({
        ...c,
        label: c.parent_id ? `${pmap.get(c.parent_id) || ""} > ${c.name}` : c.name
      }));
    }
  };

  // ========= Contas =========
  const accounts = {
    async list() {
      const u = await requireUser();
      const { data, error } = await supabase
        .from("accounts").select("*").eq("user_id", u.id).order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
    async create({ name, type = "bank", currency = "EUR" }) {
      const u = await requireUser();
      const { error } = await supabase.from("accounts").insert([{ user_id: u.id, name, type, currency }]);
      if (error) throw error;
    }
  };

  // ========= Transações / Relatórios =========
  const transactions = {
    async createIncome({ account_id, category_id, dateISO, amount, payment_method_id = null, regularity_id = null, status_id = null, description = null, location = null, notes = null }) {
      validators.assert(validators.isISODate(dateISO), "Data inválida (usa dd/mm/aaaa no UI).");
      validators.assert(validators.positiveAmount(amount), "Valor inválido.");
      const type_id = await idByCode("transaction_types", "INCOME");
      const currency = await accountCurrency(account_id);

      const { error } = await supabase.from("transactions").insert([{
        user_id: (await requireUser()).id,
        type_id, regularity_id, account_id, category_id, payment_method_id, status_id,
        date: dateISO, amount, description, location, notes, currency
      }]);
      if (error) throw error;
    },

    async createExpense(params) {
      validators.assert(validators.isISODate(params.dateISO), "Data inválida.");
      validators.assert(validators.positiveAmount(params.amount), "Valor inválido.");
      const type_id = await idByCode("transaction_types", "EXPENSE");
      const currency = await accountCurrency(params.account_id);

      const { error } = await supabase.from("transactions").insert([{
        user_id: (await requireUser()).id,
        type_id,
        regularity_id: params.regularity_id ?? null,
        account_id: params.account_id,
        category_id: params.category_id ?? null,
        payment_method_id: params.payment_method_id ?? null,
        status_id: params.status_id ?? null,
        date: params.dateISO,
        amount: params.amount,
        description: params.description ?? null,
        location: params.location ?? null,
        notes: params.notes ?? null,
        currency
      }]);
      if (error) throw error;
    },

    async createTransfer({ from_account_id, to_account_id, dateISO, amount, description = null, notes = null }) {
      validators.assert(validators.isISODate(dateISO), "Data inválida.");
      validators.assert(validators.positiveAmount(amount), "Valor inválido.");
      validators.assert(from_account_id && to_account_id && from_account_id !== to_account_id, "Seleciona contas distintas.");

      const u = await requireUser();
      const { error } = await supabase.rpc("create_transfer", {
        p_user_id: u.id,
        p_from_account: from_account_id,
        p_to_account: to_account_id,
        p_amount: amount,
        p_date: dateISO,
        p_description: description,
        p_notes: notes
      });
      if (error) throw error;
    },

    async ledger({ type_code = "", account_id = "", fromISO = "", toISO = "", limit = 200 } = {}) {
      let q = supabase.from("v_ledger").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
      if (type_code) q = q.eq("type_code", type_code);
      if (account_id) q = q.eq("account_id", account_id);
      if (fromISO) q = q.gte("date", fromISO);
      if (toISO) q = q.lte("date", toISO);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    async delete(id) {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    }
  };

  const dashboard = {
    async accountBalances() {
      const { data, error } = await supabase.from("v_account_balances").select("*").order("account_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async monthlySummary(limit = 12) {
      const { data, error } = await supabase
        .from("v_monthly_summary").select("*")
        .order("month", { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    }
  };

  window.repo = { refs, accounts, transactions, dashboard, idByCode };
})();
