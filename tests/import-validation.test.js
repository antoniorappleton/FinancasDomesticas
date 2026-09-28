import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { MAX_IMPORT_BYTES, MAX_PDF_PAGES, validateImportFile,
  validateImportContent, validatePdfPageCount } from '../public/src/lib/import-validation.js';
import { getXLSX } from '../public/src/screens/export-template.js';

function fixture(name, content, type = '') {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : Uint8Array.from(content);
  return [{ name, size: bytes.length, type }, bytes.buffer];
}

test('accepts supported files with empty/generic mobile MIME and CSV BOM', () => {
  for (const type of ['', 'application/octet-stream', 'application/pdf']) {
    assert.equal(validateImportContent(...fixture('EXTRATO.PDF', '%PDF-1.7\n', type)), 'pdf');
  }
  assert.equal(validateImportContent(...fixture('extrato.csv', '\uFEFFData;Descrição;Valor\n2026-01-01;Café;-2,50', 'text/csv;charset=utf-8')), 'csv');
  assert.equal(validateImportContent(...fixture('modelo.xlsx', [80, 75, 3, 4], 'application/zip')), 'xlsx');
});

test('rejects oversized/empty/unsupported files before reading content', () => {
  for (const size of [0, -1, NaN, MAX_IMPORT_BYTES + 1]) {
    assert.throws(() => validateImportFile({ name: 'extrato.pdf', size }));
  }
  assert.equal(validateImportFile({ name: 'extrato.pdf', size: MAX_IMPORT_BYTES }), 'pdf');
  assert.throws(() => validateImportFile({ name: 'extrato.exe', size: 10 }), /Formato/);
  assert.throws(() => validateImportFile({ name: 'extrato.pdf', size: 10, type: 'image/png' }), /tipo/);
});

test('rejects disguised, truncated or binary files', () => {
  for (const args of [fixture('extrato.pdf', 'not a PDF'),
    fixture('extrato.xlsx', 'not a workbook'), fixture('extrato.csv', '%PDF-1.7'),
    fixture('extrato.csv', [80, 75, 3, 4]), fixture('extrato.csv', [65, 0, 66]),
    fixture('extrato.csv', '<!DOCTYPE html><html>error</html>')]) {
    assert.throws(() => validateImportContent(...args));
  }
  const [file, bytes] = fixture('extrato.csv', 'Data;Valor');
  assert.throws(() => validateImportContent({ ...file, size: file.size + 1 }, bytes), /completo/);
});

test('PDF page limits include the boundary and reject invalid counts', () => {
  validatePdfPageCount(1);
  validatePdfPageCount(MAX_PDF_PAGES);
  for (const count of [0, -1, 1.5, NaN, MAX_PDF_PAGES + 1]) {
    assert.throws(() => validatePdfPageCount(count), /páginas/);
  }
});

test('import and template export can share an already loaded spreadsheet library', async () => {
  const previous = globalThis.window;
  const library = {};
  globalThis.window = { XLSX: library };
  try { assert.equal(await getXLSX(), library); }
  finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

// Exercise the real parser lifecycle without a DOM, CDN or financial data.
const settings = readFileSync(new URL('../public/src/screens/settings.js', import.meta.url), 'utf8');
const parserSource = settings.slice(settings.indexOf('  async function parsePDF(input) {'),
  settings.indexOf('  // === UI & INTERACTION ==='));

test('PDF worker is released on page-limit rejection and corrupt-document failure', async () => {
  for (const corrupt of [false, true]) {
    let destroyed = false;
    let pageRead = false;
    const pdfjsLib = {
      GlobalWorkerOptions: { workerSrc: 'local-worker.js' },
      getDocument: () => ({
        promise: corrupt ? Promise.reject(new Error('corrupt PDF')) : Promise.resolve({
          numPages: MAX_PDF_PAGES + 1,
          getPage: () => { pageRead = true; },
        }),
        destroy: async () => { destroyed = true; },
      }),
    };
    const parse = runInNewContext(`${parserSource}\nparsePDF`, {
      window: { pdfjsLib }, pdfjsLib, ArrayBuffer, validatePdfPageCount,
      setImpInfo: () => {}, console,
    });
    await assert.rejects(parse(new ArrayBuffer(8)), corrupt ? /corrupt/ : /páginas/);
    assert.equal(destroyed, true);
    assert.equal(pageRead, false);
  }
});
