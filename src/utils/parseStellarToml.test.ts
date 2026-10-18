/**
 * @file parseStellarToml.test.ts
 * @description Unit tests for the SEP-1 stellar.toml parser.
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect } from "vitest";
import { parseStellarToml } from "./parseStellarToml";

describe("parseStellarToml", () => {
  it("parses top-level keys, tables, and arrays of tables", () => {
    const toml = `
# Global
VERSION = "2.0.0"
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
ACCOUNTS = [
  "GAAA",   # first
  "GBBB",
]

[DOCUMENTATION]
ORG_NAME = "Test Anchor"

[[CURRENCIES]]
code = "USDC"
display_decimals = 2
is_asset_anchored = true

[[CURRENCIES]]
code = 'SRT'
fixed_number = 1_000
`;
    expect(parseStellarToml(toml)).toEqual({
      VERSION: "2.0.0",
      NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      ACCOUNTS: ["GAAA", "GBBB"],
      DOCUMENTATION: { ORG_NAME: "Test Anchor" },
      CURRENCIES: [
        { code: "USDC", display_decimals: 2, is_asset_anchored: true },
        { code: "SRT", fixed_number: 1000 },
      ],
    });
  });

  it("handles escapes, multi-line strings, floats, and CRLF", () => {
    const toml = [
      'a = "tab\\there \\"quoted\\" \\u00e9"',
      'b = """',
      "line one",
      'line two"""',
      "c = '''raw \\n'''",
      "d = -1.5e2",
      "e = false",
    ].join("\r\n");
    expect(parseStellarToml(toml)).toEqual({
      a: 'tab\there "quoted" é',
      b: "line one\r\nline two",
      c: "raw \\n",
      d: -150,
      e: false,
    });
  });

  it("keeps # inside strings", () => {
    expect(parseStellarToml('url = "https://x.org/#anchor" # comment')).toEqual({
      url: "https://x.org/#anchor",
    });
  });

  it.each([
    ['A = "unterminated', /unterminated string/],
    ["A = 1\nA = 2", /duplicate key/],
    ["A = { b = 1 }", /inline tables/],
    ["a.b = 1", /dotted keys/],
    ["A = nope", /unsupported value/],
    ["[T\nA = 1", /unterminated table header/],
  ])("rejects %j", (toml, message) => {
    expect(() => parseStellarToml(toml)).toThrow(message);
  });

  it("reports the line number of errors", () => {
    expect(() => parseStellarToml('A = 1\n\nB = "x" junk')).toThrow(/line 3/);
  });
});
