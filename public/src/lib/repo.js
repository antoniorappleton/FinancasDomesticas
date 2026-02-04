// Camada de acesso a dados (Supabase) + regras de negócio
import { monthKeysBetween, ymd } from "./helpers.js";

const cache = {
  typeIds: {},
};

async function requireUser() {
  const sb = window.sb;
  if (!sb) throw new Error("Supabase client (window.sb) não inicializado.");

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Precisas de iniciar sessão.");
  return user;
}

export async function idByCode(table, code) {
  if (table === "transaction_types" && cache.typeIds[code])
    return cache.typeIds[code];
  const { data, error } = await window.sb
    .from(table)
    .select("id, code")
    .eq("code", code)
    .single();
  if (error) throw new Error(`Código inválido em ${table}: ${code}`);
  if (table === "transaction_types") cache.typeIds[code] = data.id;
  return data.id;
}

export async function accountCurrency(account_id) {
  const { data, error } = await window.sb
    .from("accounts")
    .select("currency")
    .eq("id", account_id)
    .single();
  if (error) throw error;
  return data?.currency || "EUR";
}

// ========= Referências =========
export const refs = {
  async regularities() {
    const { data, error } = await window.sb
      .from("regularities")
      .select("*")
      .order("name_pt");
    if (error) throw error;
    return data;
  },
  async paymentMethods() {
    const { data, error } = await window.sb
      .from("payment_methods")
      .select("*")
      .order("name_pt");
    if (error) throw error;
    return data;
  },
  async statuses() {
    const { data, error } = await window.sb
      .from("statuses")
      .select("*")
      .order("name_pt");
    if (error) throw error;
    return data;
  },
  async transactionTypes() {
    const { data, error } = await window.sb
      .from("transaction_types")
      .select("id,code,name_pt")
      .order("id");
    if (error) throw error;
    return data;
  },
  async categories(kind) {
    const u = await requireUser();
    let q = window.sb
      .from("categories")
      .select("id,name,parent_id,kind,user_id")
      .eq("kind", kind)
      .or(`user_id.is.null,user_id.eq.${u.id}`)
      .order("name", { ascending: true });

    const { data, error } = await q;
    if (error) throw error;

    const { data: parents } = await window.sb
      .from("categories")
      .select("id,name")
      .is("parent_id", null)
      .or(`user_id.is.null,user_id.eq.${u.id}`);

    const pmap = new Map((parents || []).map((p) => [p.id, p.name]));
    return (data || []).map((c) => ({
      ...c,
      label: c.parent_id
        ? `${pmap.get(c.parent_id) || ""} > ${c.name}`
        : c.name,
    }));
  },
  async allCategories() {
    let all = [];
    let page = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await window.sb
        .from("categories")
        .select("id,name,parent_id")
        .order("id") // Stable sort
        .range(page * size, (page + 1) * size - 1);

      if (error) throw error;
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < size) break;
      page++;
    }
    return all;
  },

  // --- NEW LOGIC (Refactor) ---
  async getTree({ kind = null } = {}) {
    const u = await requireUser();
    let q = window.sb
      .from("categories")
      .select("id,name,parent_id,kind,user_id")
      .or(`user_id.is.null,user_id.eq.${u.id}`)
      .order("name", { ascending: true });

    if (kind) q = q.eq("kind", kind);

    const { data, error } = await q;
    if (error) throw error;

    const parents = [];
    const childrenMap = new Map();

    data.forEach((c) => {
      c.isSystem = !c.user_id;
      if (!c.parent_id) {
        parents.push(c);
      } else {
        const arr = childrenMap.get(c.parent_id) || [];
        arr.push(c);
        childrenMap.set(c.parent_id, arr);
      }
    });

    // Bind children to parents
    return parents.map((p) => ({
      ...p,
      children: childrenMap.get(p.id) || [],
    }));
  },

  async getOptions(kind) {
    // Returns flat list sorted: Parent A, Child A1, Child A2, Parent B...
    const tree = await this.getTree({ kind });
    const options = [];

    for (const p of tree) {
      options.push({
        id: p.id,
        name: p.name,
        level: 0,
        isSystem: p.isSystem,
        label: p.name,
      });
      if (p.children?.length) {
        for (const c of p.children) {
          options.push({
            id: c.id,
            name: c.name,
            level: 1,
            isSystem: c.isSystem,
            label: `— ${c.name}`,
          });
        }
      }
    }
    return options;
  },
};

// ========= Contas =========
export const accounts = {
  async list() {
    const u = await requireUser();
    const { data, error } = await window.sb
      .from("accounts")
      .select("*")
      .eq("user_id", u.id)
      .order("name", { ascending: true });
    if (error) throw error;
    return data;
  },
  async create({ name, type = "bank", currency = "EUR" }) {
    const u = await requireUser();
    const { error } = await window.sb
      .from("accounts")
      .insert([{ user_id: u.id, name, type, currency }]);
    if (error) throw error;
  },
};

// ========= Transações / Relatórios =========
export const transactions = {
  async list({
    page = 0,
    pageSize = 30,
    search = "",
    type = "all",
    status = "all",
    month = null,
  }) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let q = window.sb
      .from("transactions")
      .select(
        `
        id, date, amount, signed_amount, description, location, created_at,
        account_id, category_id, status_id, type_id,
        accounts(name),
        transaction_types(code,name_pt),
        statuses(name_pt)
      `,
      )
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (month) {
      const [y, m] = month.split("-");
      const start = new Date(+y, +m - 1, 1).toISOString().slice(0, 10);
      const end = new Date(+y, +m, 1).toISOString().slice(0, 10);
      q = q.gte("date", start).lt("date", end);
    }

    const { data, error, count } = await q;
    if (error) throw error;
    return data || [];
  },

  async getById(id) {
    const { data, error } = await window.sb
      .from("transactions")
      .select("*, transaction_types(code), categories(kind)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async createIncome({
    account_id,
    category_id,
    dateISO,
    amount,
    payment_method_id = null,
    regularity_id = null,
    status_id = null,
    description = null,
    location = null,
    notes = null,
  }) {
    // Validar fora ou aqui? Aqui é seguro.
    const type_id = await idByCode("transaction_types", "INCOME");
    const currency = await accountCurrency(account_id);

    const { error } = await window.sb.from("transactions").insert([
      {
        user_id: (await requireUser()).id,
        type_id,
        regularity_id,
        account_id,
        category_id,
        payment_method_id,
        status_id,
        date: dateISO,
        amount,
        description,
        location,
        notes,
        currency,
      },
    ]);
    if (error) throw error;
  },

  async createExpense(params) {
    const type_id = await idByCode("transaction_types", "EXPENSE");
    const currency = await accountCurrency(params.account_id);

    const { error } = await window.sb.from("transactions").insert([
      {
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
        currency,
      },
    ]);
    if (error) throw error;
  },

  async createTransfer({
    from_account_id,
    to_account_id,
    dateISO,
    amount,
    description = null,
    notes = null,
  }) {
    const { error } = await window.sb.rpc("create_transfer", {
      p_from_account: from_account_id,
      p_to_account: to_account_id,
      p_amount: amount,
      p_date: dateISO,
      p_description: description,
      p_notes: notes,
    });
    if (error) throw error;
  },

  async update(id, tableUpdates) {
    // Generic update for transactions
    const { error } = await window.sb
      .from("transactions")
      .update(tableUpdates)
      .eq("id", id);
    if (error) throw error;
  },

  async ledger({
    type_code = "",
    account_id = "",
    fromISO = "",
    toISO = "",
    limit = 200,
  } = {}) {
    let q = window.sb
      .from("v_ledger")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (type_code) q = q.eq("type_code", type_code);
    if (account_id) q = q.eq("account_id", account_id);
    if (fromISO) q = q.gte("date", fromISO);
    if (toISO) q = q.lte("date", toISO);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async delete(id) {
    const { error } = await window.sb
      .from("transactions")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async deleteByRange(fromISO, toISO) {
    // Safety check
    if (!fromISO || !toISO)
      throw new Error("Datas inválidas para eliminação em massa.");

    const { error } = await window.sb
      .from("transactions")
      .delete()
      .gte("date", fromISO)
      .lte("date", toISO);

    if (error) throw error;
  },

  async getFixedExpensesByYear(year) {
    const type_id = await idByCode("transaction_types", "EXPENSE");
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const { data, error } = await window.sb
      .from("transactions")
      .select(
        `
        id, date, amount, category_id, description, expense_nature, regularity_id,
        categories(name),
        regularities(code)
      `,
      )
      .eq("type_id", type_id)
      .gte("date", start)
      .lte("date", end);

    if (error) throw error;

    return (data || []).filter((t) => {
      const isFixed = t.expense_nature === "fixed";
      const isRecurring =
        t.regularity_id &&
        t.regularities?.code &&
        t.regularities.code !== "ONCE";
      return isFixed || isRecurring;
    });
  },
};

export const dashboard = {
  async accountBalances() {
    const { data, error } = await window.sb
      .from("v_account_balances")
      .select("*")
      .order("account_name", { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async monthlySummary(limit = 12) {
    const { data, error } = await window.sb
      .from("v_monthly_summary")
      .select("*")
      .order("month", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },
};

// ========= Portfolios =========
export const portfolios = {
  async aggregate() {
    const sb = window.sb;
    const uid = (await sb.auth.getUser()).data?.user?.id;
    const { data: pf } = await sb
      .from("portfolios")
      .select("*")
      .eq("user_id", uid);
    if (!pf?.length) return { kinds: [], byKind: new Map(), raw: [] };

    const { data: ttype } = await sb
      .from("transaction_types")
      .select("id,code");
    const SAV = ttype?.find((t) => t.code === "SAVINGS")?.id;

    function buildSeries(
      {
        aprPct,
        compounding = "monthly",
        initial_amount = 0,
        start_date = null,
      },
      txs,
      fromISO,
      toISO,
    ) {
      const r = Number(aprPct || 0) / 100;
      const months = monthKeysBetween(fromISO.slice(0, 7), toISO.slice(0, 7));
      const byMonth = new Map(
        months.map((k) => [k, { contrib: 0, interest: 0, balance: 0 }]),
      );
      for (const t of txs) {
        const k = String(t.date).slice(0, 7);
        if (!byMonth.has(k))
          byMonth.set(k, { contrib: 0, interest: 0, balance: 0 });
        byMonth.get(k).contrib += Number(t.amount || 0);
      }
      let balance = Number(initial_amount || 0);
      const annivMonth = start_date
        ? Number(String(start_date).slice(5, 7))
        : Number(fromISO.slice(5, 7));
      const out = [];
      for (const k of months) {
        const row = byMonth.get(k) || { contrib: 0, interest: 0, balance: 0 };
        balance += row.contrib;
        let i = 0;
        if (compounding === "monthly") i = balance > 0 ? balance * (r / 12) : 0;
        else {
          const m = Number(k.slice(5, 7));
          if (balance > 0 && m === annivMonth) i = balance * r;
        }
        balance += i;
        row.interest = i;
        row.balance = balance;
        out.push({ key: k, ...row });
      }
      return out;
    }

    const today = new Date();
    const toISO = ymd(today);
    const out = [];

    for (const p of pf) {
      const fromISO = (p.start_date || p.created_at || "1970-01-01").slice(
        0,
        10,
      );
      const { data: tx } = await sb
        .from("transactions")
        .select("date,amount")
        .eq("type_id", SAV)
        .eq("portfolio_id", p.id)
        .gte("date", fromISO)
        .lte("date", toISO)
        .order("date", { ascending: true });

      const series = buildSeries(
        {
          aprPct: p.apr,
          compounding: p.compounding,
          initial_amount: Number(p.initial_amount || 0),
          start_date: p.start_date,
        },
        tx || [],
        fromISO,
        toISO,
      );
      const aportes = (tx || []).reduce(
        (s, r) => s + (Number(r.amount) || 0),
        0,
      );
      const invested = Number(p.initial_amount || 0) + aportes;
      const current = series.length ? series.at(-1).balance : invested;

      // projeção
      const projTo = new Date(today);
      projTo.setMonth(projTo.getMonth() + 12);
      const projSeries = buildSeries(
        {
          aprPct: p.apr,
          compounding: p.compounding,
          initial_amount: current,
          start_date: p.start_date,
        },
        [],
        ymd(today),
        ymd(projTo),
      );
      const projected = projSeries.length ? projSeries.at(-1).balance : current;

      out.push({ ...p, invested, current, projected });
    }

    const byKind = new Map();
    for (const p of out) {
      const k = p.kind || "Outro";
      if (!byKind.has(k))
        byKind.set(k, {
          invested: 0,
          current: 0,
          projected: 0,
          color: p.color || null,
        });
      const b = byKind.get(k);
      b.invested += p.invested;
      b.current += p.current;
      b.projected += p.projected;
      if (!b.color && p.color) b.color = p.color;
    }
    return { kinds: Array.from(byKind.keys()), byKind, raw: out };
  },
};

export const repo = {
  refs,
  accounts,
  transactions,
  dashboard,
  portfolios,
  idByCode,
  accountCurrency,
};

// Globals for legacy compatibility
window.repo = repo;
