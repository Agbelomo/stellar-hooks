/**
 * @file parseStellarToml.ts
 * @description Minimal TOML parser covering the subset of TOML used by SEP-1 stellar.toml files.
 * @package stellar-hooks
 * @license MIT
 */

type TomlValue = string | number | boolean | TomlValue[] | { [key: string]: TomlValue };
type TomlTable = { [key: string]: TomlValue };

/**
 * Parse a SEP-1 `stellar.toml` document.
 *
 * Supports comments, `key = value` pairs, `[TABLE]` and `[[ARRAY_OF_TABLES]]`
 * headers, basic / literal / multi-line strings, integers, floats, booleans,
 * and (multi-line) arrays — everything SEP-1 files use in practice. Inline
 * tables and dotted keys are not supported and throw.
 *
 * @throws Error with the offending line number on malformed input
 */
export function parseStellarToml(source: string): TomlTable {
  const root: TomlTable = {};
  let current: TomlTable = root;
  let pos = 0;
  let line = 1;

  const fail = (message: string): never => {
    throw new Error(`Invalid stellar.toml (line ${line}): ${message}`);
  };

  const peek = (offset = 0) => source[pos + offset];

  const skipWhitespace = (newlines: boolean) => {
    while (pos < source.length) {
      const ch = peek();
      if (ch === " " || ch === "\t" || ch === "\r") pos++;
      else if (ch === "\n" && newlines) {
        line++;
        pos++;
      } else if (ch === "#") {
        while (pos < source.length && peek() !== "\n") pos++;
      } else break;
    }
  };

  const expectLineEnd = () => {
    skipWhitespace(false);
    if (pos < source.length && peek() !== "\n") fail(`unexpected "${peek()}"`);
  };

  const parseKey = (): string => {
    if (peek() === '"' || peek() === "'") return parseString();
    const start = pos;
    while (pos < source.length && /[A-Za-z0-9_-]/.test(peek())) pos++;
    if (start === pos) fail("expected a key");
    return source.slice(start, pos);
  };

  const parseEscape = (): string => {
    const ch = source[pos++];
    switch (ch) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case '"': return '"';
      case "\\": return "\\";
      case "u":
      case "U": {
        const len = ch === "u" ? 4 : 8;
        const hex = source.slice(pos, pos + len);
        if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length !== len) fail("invalid unicode escape");
        pos += len;
        return String.fromCodePoint(parseInt(hex, 16));
      }
      default:
        return fail(`invalid escape "\\${ch}"`);
    }
  };

  const parseString = (): string => {
    const quote = peek();
    const multiline = source.startsWith(quote.repeat(3), pos);
    pos += multiline ? 3 : 1;
    if (multiline && peek() === "\r") pos++;
    if (multiline && peek() === "\n") {
      line++;
      pos++;
    }

    let out = "";
    while (pos < source.length) {
      if (multiline ? source.startsWith(quote.repeat(3), pos) : peek() === quote) {
        pos += multiline ? 3 : 1;
        return out;
      }
      const ch = source[pos++];
      if (ch === "\n") {
        if (!multiline) fail("unterminated string");
        line++;
      }
      if (ch === "\\" && quote === '"') {
        if (multiline && /[ \t\r\n]/.test(peek())) {
          // Line-ending backslash: trim the newline and following whitespace.
          while (/[ \t\r\n]/.test(peek())) {
            if (peek() === "\n") line++;
            pos++;
          }
          continue;
        }
        out += parseEscape();
      } else {
        out += ch;
      }
    }
    return fail("unterminated string");
  };

  const parseValue = (): TomlValue => {
    const ch = peek();
    if (ch === '"' || ch === "'") return parseString();
    if (ch === "[") {
      pos++;
      const items: TomlValue[] = [];
      for (;;) {
        skipWhitespace(true);
        if (peek() === "]") {
          pos++;
          return items;
        }
        items.push(parseValue());
        skipWhitespace(true);
        if (peek() === ",") pos++;
        else if (peek() !== "]") fail("expected , or ] in array");
      }
    }
    if (ch === "{") fail("inline tables are not supported");

    const start = pos;
    while (pos < source.length && !/[\s,\]#]/.test(peek())) pos++;
    const raw = source.slice(start, pos);
    if (raw === "true") return true;
    if (raw === "false") return false;
    const numeric = raw.replace(/_/g, "");
    if (/^[+-]?\d+$/.test(numeric)) return parseInt(numeric, 10);
    if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(numeric)) return parseFloat(numeric);
    return fail(`unsupported value "${raw}"`);
  };

  while (pos < source.length) {
    skipWhitespace(true);
    if (pos >= source.length) break;

    if (peek() === "[") {
      const isArray = peek(1) === "[";
      pos += isArray ? 2 : 1;
      skipWhitespace(false);
      const name = parseKey();
      skipWhitespace(false);
      if (!source.startsWith(isArray ? "]]" : "]", pos)) fail("unterminated table header");
      pos += isArray ? 2 : 1;
      expectLineEnd();

      if (isArray) {
        const list = (root[name] ??= []) as TomlValue[];
        if (!Array.isArray(list)) fail(`"${name}" is not an array of tables`);
        current = {};
        list.push(current);
      } else {
        if (name in root) fail(`duplicate table "${name}"`);
        current = {};
        root[name] = current;
      }
      continue;
    }

    const key = parseKey();
    skipWhitespace(false);
    if (peek() === ".") fail("dotted keys are not supported");
    if (peek() !== "=") fail(`expected = after "${key}"`);
    pos++;
    skipWhitespace(false);
    if (key in current) fail(`duplicate key "${key}"`);
    current[key] = parseValue();
    expectLineEnd();
  }

  return root;
}
