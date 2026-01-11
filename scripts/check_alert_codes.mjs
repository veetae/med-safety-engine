// scripts/check_alert_codes.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REG_PATH = path.join(ROOT, "constants", "alert_codes.json");
const FUNCTIONS_DIR = path.join(ROOT, "functions");
const ORCH_PATH = path.join(ROOT, "orchestrator.js");

const SCAN_PATHS = [FUNCTIONS_DIR, ORCH_PATH];
const IGNORE_PATHS = [
  path.join(ROOT, "constants", "alert_codes.ts"),
  path.join(ROOT, "constants", "alert_codes.js"),
];

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exitCode = 1;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function listFilesRecursively(p) {
  const files = [];
  if (!fs.existsSync(p)) return files;
  const stat = fs.statSync(p);
  if (stat.isFile()) return [p];
  for (const entry of fs.readdirSync(p)) {
    const full = path.join(p, entry);
    const st = fs.statSync(full);
    if (st.isDirectory()) files.push(...listFilesRecursively(full));
    else if (st.isFile()) files.push(full);
  }
  return files;
}

function isIgnored(filePath) {
  return IGNORE_PATHS.some(ign => path.normalize(ign) === path.normalize(filePath));
}

function main() {
  if (!fs.existsSync(REG_PATH)) {
    fail(`Missing registry: ${path.relative(ROOT, REG_PATH)}`);
    process.exit(1);
  }
  const reg = readJson(REG_PATH);
  const knownCodes = new Set(Object.keys(reg.codes || {}));
  if (knownCodes.size === 0) {
    fail(`Registry has no codes: ${path.relative(ROOT, REG_PATH)}`);
    process.exit(1);
  }

  const rawAlertCodeObjectLiteral = /alert_code\s*:\s*["'`][A-Z0-9_]+["'`]/g;
  const rawAlertCodeAssignment = /alert_code\s*=\s*["'`][A-Z0-9_]+["'`]/g;
  const anyAlertCodeField = /alert_code\s*:/g;
  const allowedAlertCodeField = /alert_code\s*:\s*ALERT_CODES\.[A-Z0-9_]+/g;
  const alertCodeConstRef = /ALERT_CODES\.([A-Z0-9_]+)/g;

  const scanFiles = SCAN_PATHS.flatMap(p => listFilesRecursively(p)).filter(f => !isIgnored(f));

  if (scanFiles.length === 0) {
    console.log("No files found to scan.");
    process.exit(0);
  }

  for (const file of scanFiles) {
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, "utf8");

    const m1 = text.match(rawAlertCodeObjectLiteral);
    if (m1 && m1.length) fail(`${rel}: raw string literal used for alert_code (object literal). Use ALERT_CODES.<CODE>.`);

    const m2 = text.match(rawAlertCodeAssignment);
    if (m2 && m2.length) fail(`${rel}: raw string literal used for alert_code (assignment). Use ALERT_CODES.<CODE>.`);

    const any = text.match(anyAlertCodeField) || [];
    const ok = text.match(allowedAlertCodeField) || [];
    if (any.length > ok.length) fail(`${rel}: found alert_code fields not using ALERT_CODES.<CODE>.`);

    let match;
    while ((match = alertCodeConstRef.exec(text)) !== null) {
      const code = match[1];
      if (!knownCodes.has(code)) fail(`${rel}: ALERT_CODES.${code} not present in registry`);
    }
  }

  if (process.exitCode) {
    console.error("\nAlert code checks failed.");
    process.exit(1);
  } else {
    console.log("Alert code checks passed.");
  }
}

main();
