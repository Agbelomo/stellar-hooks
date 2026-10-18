/**
 * @file hardwareMatrix.test.ts
 * @description Tests for scripts/check-hardware-matrix.mjs (#950).
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// @ts-ignore -- plain ESM script without type declarations
import { validate, renderTable, syncDoc } from "../../scripts/check-hardware-matrix.mjs";

const real = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../docs/hardware-wallet-matrix.json", import.meta.url)), "utf8"),
);
const doc = readFileSync(
  fileURLToPath(new URL("../../docs/HARDWARE_WALLET_COMPATIBILITY.md", import.meta.url)),
  "utf8",
);

const base = { wallet: "Ledger", model: "Nano X", adapter: "ledger", firmware: null, stellarApp: null, status: "unverified", verifiedBy: null, verifiedOn: null, notes: "" };
const exists = () => true;

describe("hardware wallet matrix", () => {
  it("the committed matrix is valid and the doc table is in sync", () => {
    expect(validate(real)).toEqual([]);
    expect(syncDoc(doc, renderTable(real))).toBe(doc);
  });

  it("accepts a fully recorded verification", () => {
    const entry = { ...base, status: "verified", firmware: "2.2.3", stellarApp: "5.0.2", verifiedBy: "octocat", verifiedOn: "2026-10-01" };
    expect(validate({ entries: [entry] }, exists)).toEqual([]);
  });

  it.each([
    [{ ...base, status: "verified" }, /verified entry needs "firmware"/],
    [{ ...base, status: "verified", firmware: "1", stellarApp: "1", verifiedBy: "a", verifiedOn: "yesterday" }, /YYYY-MM-DD/],
    [{ ...base, status: "great" }, /status must be one of/],
    [{ ...base, adapter: null }, /"adapter" is required/],
    [{ ...base, status: "no-adapter" }, /must not name an adapter/],
    [{ ...base, model: "" }, /"model" is required/],
  ])("rejects an invalid entry %#", (entry, message) => {
    expect(validate({ entries: [entry] }, exists).join("\n")).toMatch(message);
  });

  it("rejects unknown adapters, duplicates and empty data", () => {
    expect(validate({ entries: [base] }, () => false).join()).toMatch(/has no src\/wallets\/ledger\.ts/);
    expect(validate({ entries: [base, base] }, exists).join()).toMatch(/duplicate/);
    expect(validate({ entries: [] })).toHaveLength(1);
  });

  it("syncDoc replaces only the table and requires the markers", () => {
    const out = syncDoc("a\n<!-- matrix:start -->\nold\n<!-- matrix:end -->\nb", "NEW");
    expect(out).toBe("a\n<!-- matrix:start -->\nNEW\n<!-- matrix:end -->\nb");
    expect(() => syncDoc("no markers", "x")).toThrow(/matrix:start/);
  });

  it("escapes pipes in cells", () => {
    expect(renderTable({ entries: [{ ...base, notes: "a|b" }] })).toContain("a\\|b");
  });
});
