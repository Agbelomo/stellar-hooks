#!/usr/bin/env node
/**
 * Validates docs/hardware-wallet-matrix.json and keeps the table in
 * docs/HARDWARE_WALLET_COMPATIBILITY.md in sync with it.
 *
 *   node scripts/check-hardware-matrix.mjs           # check (CI)
 *   node scripts/check-hardware-matrix.mjs --write   # regenerate the table
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = process.env.MATRIX_JSON ?? join(root, "docs/hardware-wallet-matrix.json");
const docPath = process.env.MATRIX_DOC ?? join(root, "docs/HARDWARE_WALLET_COMPATIBILITY.md");
const adapterDir = join(root, "src/wallets");

const START = "<!-- matrix:start -->";
const END = "<!-- matrix:end -->";
const STATUSES = ["verified", "unverified", "known-issue", "no-adapter"];

export function validate(data, adapterExists = (id) => existsSync(join(adapterDir, `${id}.ts`))) {
  const errors = [];
  if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
    return ["`entries` must be a non-empty array"];
  }
  const seen = new Set();
  data.entries.forEach((e, i) => {
    const where = `entries[${i}] (${e?.wallet} ${e?.model})`;
    for (const key of ["wallet", "model", "status"]) {
      if (typeof e?.[key] !== "string" || !e[key]) errors.push(`${where}: "${key}" is required`);
    }
    const id = `${e?.wallet}/${e?.model}`;
    if (seen.has(id)) errors.push(`${where}: duplicate wallet/model`);
    seen.add(id);
    if (!STATUSES.includes(e?.status)) errors.push(`${where}: status must be one of ${STATUSES.join(", ")}`);
    if (e?.status === "verified") {
      for (const key of ["firmware", "stellarApp", "verifiedBy", "verifiedOn"]) {
        if (!e[key]) errors.push(`${where}: a verified entry needs "${key}"`);
      }
      if (e.verifiedOn && !/^\d{4}-\d{2}-\d{2}$/.test(e.verifiedOn)) errors.push(`${where}: verifiedOn must be YYYY-MM-DD`);
    }
    if (e?.status === "no-adapter" && e.adapter) errors.push(`${where}: "no-adapter" entries must not name an adapter`);
    if (e?.status !== "no-adapter") {
      if (!e?.adapter) errors.push(`${where}: "adapter" is required unless status is no-adapter`);
      else if (!adapterExists(e.adapter)) errors.push(`${where}: adapter "${e.adapter}" has no src/wallets/${e.adapter}.ts`);
    }
  });
  return errors;
}

const cell = (v) => (v == null || v === "" ? "–" : String(v).replace(/\|/g, "\\|"));

export function renderTable(data) {
  const rows = data.entries.map((e) =>
    `| ${cell(e.wallet)} | ${cell(e.model)} | ${cell(e.adapter)} | ${cell(e.firmware)} | ${cell(e.stellarApp)} | ${cell(e.status)} | ${cell(e.verifiedBy)} | ${cell(e.verifiedOn)} | ${cell(e.notes)} |`,
  );
  return [
    "| Wallet | Model | Adapter | Firmware | Stellar app | Status | Verified by | Verified on | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

export function syncDoc(doc, table) {
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error(`Doc must contain ${START} ... ${END}`);
  return `${doc.slice(0, start + START.length)}\n${table}\n${doc.slice(end)}`;
}

function main() {
  const write = process.argv.includes("--write");
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  const errors = validate(data);
  if (errors.length) {
    console.error(`Hardware wallet matrix is invalid:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  const doc = readFileSync(docPath, "utf8");
  const expected = syncDoc(doc, renderTable(data));
  if (doc === expected) {
    console.log(`Hardware wallet matrix OK (${data.entries.length} entries, table in sync).`);
    return;
  }
  if (write) {
    writeFileSync(docPath, expected);
    console.log("Regenerated the table in HARDWARE_WALLET_COMPATIBILITY.md.");
    return;
  }
  console.error("The table in HARDWARE_WALLET_COMPATIBILITY.md is out of date. Run: node scripts/check-hardware-matrix.mjs --write");
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
