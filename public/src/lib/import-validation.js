export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;

const mimeTypes = {
  pdf: ['application/pdf', 'application/x-pdf'],
  csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'application/x-zip-compressed', 'application/vnd.ms-excel'],
};

export function validateImportFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('O ficheiro está vazio. No Android, guarde-o em Transferências e selecione a cópia local.');
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('O ficheiro excede 20 MB. Exporte um período mais curto e tente novamente.');
  }
  const extension = (file.name || '').toLowerCase().split('.').pop();
  if (!Object.hasOwn(mimeTypes, extension)) {
    throw new Error('Formato não suportado. Selecione PDF, CSV ou XLSX.');
  }
  const mime = (file.type || '').toLowerCase().split(';')[0].trim();
  // Android file providers may omit the MIME or return a generic value.
  if (mime && mime !== 'application/octet-stream' && !mimeTypes[extension].includes(mime)) {
    throw new Error('O tipo do ficheiro não corresponde à extensão. Exporte novamente como PDF, CSV ou XLSX.');
  }
  return extension;
}

export function validateImportContent(file, buffer) {
  const extension = validateImportFile(file);
  const bytes = new Uint8Array(buffer);
  if (!bytes.length || bytes.length > MAX_IMPORT_BYTES || bytes.length !== file.size) {
    throw new Error('Não foi possível ler o ficheiro completo dentro do limite de 20 MB. Selecione uma cópia local.');
  }
  const startsWith = (signature) => signature.every((value, index) => bytes[index] === value);
  const pdf = startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const zip = startsWith([0x50, 0x4b, 0x03, 0x04]);
  if (extension === 'pdf' && !pdf) {
    throw new Error('O ficheiro não tem uma assinatura PDF válida. Exporte novamente o documento.');
  }
  // ZIP signature alone is not proof of a valid workbook: the parser still validates it.
  if (extension === 'xlsx' && !zip) {
    throw new Error('O ficheiro não tem uma assinatura XLSX válida. Exporte novamente como XLSX ou CSV.');
  }
  if (extension === 'csv') {
    if (pdf || zip || bytes.includes(0)) {
      throw new Error('O CSV contém dados binários ou uma codificação não suportada. Exporte como CSV UTF-8.');
    }
    const prefix = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart();
    if (/^<(?:!doctype\s+html|html|script|\?xml)\b/i.test(prefix)) {
      throw new Error('O ficheiro contém HTML/XML em vez de CSV. Exporte os movimentos como CSV.');
    }
  }
  return extension;
}

export function validatePdfPageCount(count) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PDF_PAGES) {
    throw new Error(`O PDF deve ter entre 1 e ${MAX_PDF_PAGES} páginas. Exporte um período mais curto.`);
  }
}
