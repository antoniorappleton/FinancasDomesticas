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
  const XLSX = await getXLSX();
  if (!XLSX) {
    downloadCSVTemplate();
    return;
  }

  // == XLSX ok: gerar workbook com 2 folhas ==
  const wb = XLSX.utils.book_new();

  const headers = ["Tipo", "Área", "Categoria", "Regularidade", "Montante"];
  const hints = [
    "INCOME | EXPENSE | SAVINGS",
    "ex.: Alimentação, Casa, Carros…",
    'ex.: "Alimentação > Supermercado"',
    "none | weekly | biweekly | monthly | yearly",
    "usar ponto decimal (ex.: 1234.56)",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, hints]);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 18 },
    { wch: 30 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Transacoes");

  const apoio = XLSX.utils.aoa_to_sheet([
    ["LISTAS SUPORTADAS"],
    [],
    ["transaction_types", "INCOME", "EXPENSE", "SAVINGS"],
    ["regularities", "none", "weekly", "biweekly", "monthly", "yearly"],
    ["observações", "Datas e moeda são definidas no ecrã de importação (mês)."],
  ]);
  apoio["!cols"] = [
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, apoio, "TabelasApoio");

  XLSX.writeFile(wb, "wisebudget-import-template.xlsx");
}
