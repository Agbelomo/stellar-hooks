/**
 * @file tokenAmount.ts
 * @description Conversions between raw SEP-41 token amounts (bigint base units)
 *   and human-readable decimal strings.
 * @package stellar-hooks
 * @license MIT
 */

/** Default decimals for Stellar assets and Stellar Asset Contracts. */
export const DEFAULT_TOKEN_DECIMALS = 7;

/**
 * Format a raw base-unit amount as a decimal string without losing precision.
 *
 * @example formatTokenAmount(12_345_678n, 7) // "1.2345678"
 * @example formatTokenAmount(10_000_000n, 7) // "1"
 */
export function formatTokenAmount(
  raw: bigint,
  decimals: number = DEFAULT_TOKEN_DECIMALS,
): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`decimals must be a non-negative integer, got ${decimals}`);
  }
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = decimals === 0 ? "" : (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Parse a decimal string into raw base units. Throws on malformed input or on
 * more fractional digits than the token supports (instead of rounding).
 *
 * @example parseTokenAmount("1.5", 7) // 15_000_000n
 */
export function parseTokenAmount(
  value: string,
  decimals: number = DEFAULT_TOKEN_DECIMALS,
): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`decimals must be a non-negative integer, got ${decimals}`);
  }
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new SyntaxError(`"${value}" is not a valid token amount`);
  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > decimals) {
    throw new RangeError(`"${value}" has more than ${decimals} fractional digits`);
  }
  const raw = BigInt(whole + fraction.padEnd(decimals, "0"));
  return sign ? -raw : raw;
}
