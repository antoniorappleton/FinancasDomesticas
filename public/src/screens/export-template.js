// src/screens/export-template.js
// Tenta carregar SheetJS (XLSX) de vários CDNs. Se não conseguir, faz fallback p/ CSV.

async function loadScript(src) {
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = res;
    s.onerror = () => rej(new Error(`Falhou a carregar: ${src}`));
    document.head.appendChild(s);
  });
}

async function getXLSX() {
  if (window.XLSX) return window.XLSX;
  const cdns = [
    // cdnjs (muito estável)
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    // jsDelivr
    "https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js",
    // unpkg
    "https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js",
  ];
  let lastErr = null;
  for (const url of cdns) {
    try {
      await loadScript(url);
      return window.XLSX;
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn("XLSX não carregou de nenhum CDN:", lastErr);
  return null;
}

// ====== Fallback: gera CSV (compatível com Excel) ======
function downloadCSVTemplate() {
  const sep = ";"; // Excel PT costuma abrir bem com ';'
  const rows = [
    ["Tipo", "Área", "Categoria", "Regularidade", "Montante"],
    [
      "INCOME | EXPENSE | SAVINGS",
      "ex.: Alimentação, Casa, Carros…",
      'ex.: "Alimentação > Supermercado"',
      "none | weekly | biweekly | monthly | yearly",
      "usar ponto decimal (ex.: 1234.56)",
    ],
  ];
  const csv =
    "\uFEFF" +
    rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(sep)
      )
      .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "wisebudget-import-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  alert(
    "Não consegui carregar a biblioteca Excel.\nExportei um modelo CSV (abre no Excel)."
  );
}

export async function exportImportTemplate() {
  const sb = window.sb;
  const XLSX = await getXLSX();
  if (!XLSX) {
    downloadCSVTemplate();
    return;
  }

  // 1. Carregar dados reais para as folhas de apoio
  const [accRes, catRes, pmRes, stRes, regRes] = await Promise.all([
    sb.from("accounts").select("name").order("name"),
    sb.from("categories").select("name, parent_id, kind").order("name"),
    sb.from("payment_methods").select("name_pt").order("id"),
    sb.from("statuses").select("name_pt").order("id"),
    sb.from("regularities").select("name_pt").order("id"),
  ]);

  const wb = XLSX.utils.book_new();

  // == Folha 1: Registos (O que o utilizador preenche) ==
  const headers = [
    "Data",
    "Tipo",
    "Conta",
    "Categoria",
    "Regularidade",
    "Montante",
    "Descrição",
    "Método",
    "Estado",
    "Natureza",
    "Localização",
    "Notas",
  ];
  const hints = [
    "YYYY-MM-DD",
    "INCOME | EXPENSE | SAVINGS",
    "Nome da conta (ver Folha Contas)",
    "Pai > Filho (ver Folha Categorias)",
    "Mensal, Anual, etc.",
    "0.00",
    "Opcional",
    "Dinheiro, MB Way, etc.",
    "Liquidado, Agendado",
    "fixed | variable",
    "Opcional",
    "Opcional",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, hints]);
  ws["!cols"] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, "Registos");

  // == Folha 2: Contas ==
  const accounts = (accRes.data || []).map((a) => [a.name]);
  const wsAcc = XLSX.utils.aoa_to_sheet([["Nome da Conta"], ...accounts]);
  XLSX.utils.book_append_sheet(wb, wsAcc, "Contas");

  // == Folha 3: Categorias ==
  const catData = catRes.data || [];
  const parents = new Map(catData.filter((c) => !c.parent_id).map((c) => [c.id, c]));
  
  const catRows = catData.map((c) => {
    const parent = c.parent_id ? (catData.find(p => p.id === c.parent_id)?.name || "") : c.name;
    const name = c.parent_id ? `${parent} > ${c.name}` : c.name;
    return [name, c.kind.toUpperCase()];
  }).sort((a, b) => a[0].localeCompare(b[0]));

  const wsCat = XLSX.utils.aoa_to_sheet([["Nome (Pai > Filho)", "Tipo"], ...catRows]);
  XLSX.utils.book_append_sheet(wb, wsCat, "Categorias");

  // == Folha 4: Tabelas Apoio (Métodos, Estados, Reg) ==
  const apoioRows = [
    ["TIPOS TRANSACÇÃO", "MÉTODOS PAGAMENTO", "ESTADOS", "REGULARIDADES"],
    ["INCOME", "", "", ""],
    ["EXPENSE", "", "", ""],
    ["SAVINGS", "", "", ""],
  ];

  const maxLen = Math.max(
    (pmRes.data || []).length,
    (stRes.data || []).length,
    (regRes.data || []).length
  );

  for (let i = 0; i < maxLen; i++) {
    if (i + 4 > apoioRows.length) apoioRows.push(["", "", "", ""]);
    apoioRows[i + 1][1] = pmRes.data?.[i]?.name_pt || "";
    apoioRows[i + 1][2] = stRes.data?.[i]?.name_pt || "";
    apoioRows[i + 1][3] = regRes.data?.[i]?.name_pt || "";
  }

  const wsApoio = XLSX.utils.aoa_to_sheet(apoioRows);
  XLSX.utils.book_append_sheet(wb, wsApoio, "ListasValidas");

  XLSX.writeFile(wb, "wisebudget-template-premium.xlsx");
}
