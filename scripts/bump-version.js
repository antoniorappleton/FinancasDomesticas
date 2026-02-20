#!/usr/bin/env node
// scripts/bump-version.js
// Incrementa a versão (patch), atualiza sw.js, index.html e package.json,
// depois faz deploy Firebase Hosting.
// Uso: node scripts/bump-version.js [--full] [--dry-run]

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FULL = args.includes("--full");

// ─── 1. Ler versão atual ───────────────────────────────────────────────────
const pkgPath = resolve(ROOT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const [maj, min, patch] = pkg.version.split(".").map(Number);
const newPatch = patch + 1;
const newSemver = `${maj}.${min}.${newPatch}`;
const newVTag = `v${maj * 100 + min}${newPatch > 9 ? newPatch : newPatch}`; // ex: v85 → v86
// Simples: extrair número da tag sw anterior e somar 1
const swPath = resolve(ROOT, "public/sw.js");
const swContent = readFileSync(swPath, "utf8");
const swMatch = swContent.match(/const VERSION = "v(\d+)"/);
const currentSwNum = swMatch ? parseInt(swMatch[1], 10) : 85;
const newSwNum = currentSwNum + 1;
const newV = `v${newSwNum}`;

console.log(`\n🔄  Versão atual : ${pkg.version}  (SW ${swMatch?.[0].match(/v\d+/)?.[0]})`);
console.log(`✅  Nova versão  : ${newSemver}  (SW ${newV})\n`);

if (DRY) {
  console.log("🟡  Dry-run — nenhum ficheiro será alterado.\n");
  process.exit(0);
}

// ─── 2. package.json ──────────────────────────────────────────────────────
pkg.version = newSemver;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`  ✔ package.json → ${newSemver}`);

// ─── 3. sw.js ─────────────────────────────────────────────────────────────
const newSw = swContent.replace(
  /const VERSION = "v\d+"/,
  `const VERSION = "${newV}"`
);
writeFileSync(swPath, newSw);
console.log(`  ✔ sw.js → ${newV}`);

// ─── 4. index.html ────────────────────────────────────────────────────────
const htmlPath = resolve(ROOT, "public/index.html");
let html = readFileSync(htmlPath, "utf8");

// APP_VERSION
html = html.replace(
  /window\.APP_VERSION = "v\d+"/,
  `window.APP_VERSION = "${newV}"`
);
// SW registration ?v=N
html = html.replace(
  /\.register\("\.\/sw\.js\?v=\d+"/,
  `.register("./sw.js?v=${newSwNum}"`
);
// Footer version tag
html = html.replace(
  /WiseBudget v\d+ —/,
  `WiseBudget ${newV} —`
);
// main.js?v=N
html = html.replace(
  /src="\.\/main\.js\?v=\d+"/,
  `src="./main.js?v=${newSwNum}"`
);

writeFileSync(htmlPath, html);
console.log(`  ✔ index.html → ${newV}`);

// ─── 5. Git commit ────────────────────────────────────────────────────────
try {
  execSync("git add package.json public/sw.js public/index.html", { cwd: ROOT, stdio: "inherit" });
  execSync(`git commit -m "chore: bump version to ${newSemver} (${newV})"`, { cwd: ROOT, stdio: "inherit" });
  execSync("git push", { cwd: ROOT, stdio: "inherit" });
  console.log("  ✔ Git commit + push\n");
} catch (e) {
  console.warn("  ⚠ Git step failed (pode não haver mudanças):", e.message);
}

// ─── 6. Firebase Deploy ───────────────────────────────────────────────────
const deployTarget = FULL ? "" : "--only hosting";
console.log(`🚀  A fazer deploy Firebase${FULL ? " (completo)" : " (hosting)"}...\n`);
execSync(`firebase deploy ${deployTarget}`, { cwd: ROOT, stdio: "inherit" });

console.log(`\n🎉  Deploy concluído! Versão: ${newSemver} (${newV})\n`);
