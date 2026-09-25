/**
 * @file formatAmount.ts
 * @description Locale-aware asset amount formatting helper for Stellar balances and amounts.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback } from "react";
import type { StellarBalance } from "../types";

export interface FormatAssetAmountOptions {
  /**
   * BCP 47 language tag or array of language tags (e.g. "en-US", "de-DE", "fr-FR").
   * Defaults to system / runtime locale.
   */
  locale?: string | string[];

  /**
   * Minimum number of decimal places to include (default: 0).
   */
  minimumFractionDigits?: number;

  /**
   * Maximum number of decimal places to include (default: 7, Stellar's standard precision).
   */
  maximumFractionDigits?: number;

  /**
   * Whether to display thousands/grouping separators. Default: true.
   */
  useGrouping?: boolean;

  /**
   * Asset code to display alongside the amount (e.g. "XLM", "USDC").
   * If passing a StellarBalance object, this defaults to the balance's assetCode or "XLM" for native.
   */
  assetCode?: string;

  /**
   * Placement of the asset code relative to the formatted amount.
   * - "suffix": "1,234.56 XLM" (default)
   * - "prefix": "XLM 1,234.56"
   * - "none": "1,234.56"
   */
  assetPosition?: "prefix" | "suffix" | "none";

  /**
   * When true, strips redundant trailing zeros from the fractional part
   * up to minimumFractionDigits. Default: false.
   */
  trimTrailingZeros?: boolean;

  /**
   * Formatting notation style: "standard" | "compact" | "scientific" | "engineering".
   * Default: "standard".
   */
  notation?: "standard" | "compact" | "scientific" | "engineering";

  /**
   * Fallback string to display when amount is null, undefined, or not a valid number.
   * Default: "0".
   */
  fallback?: string;
}

/**
 * Checks whether an unknown input is a StellarBalance object.
 */
function isStellarBalance(value: unknown): value is StellarBalance {
  return (
    typeof value === "object" &&
    value !== null &&
    "balance" in value &&
    typeof (value as { balance: unknown }).balance === "string"
  );
}

/**
 * Formats a Stellar asset amount, balance string, or numeric value into a locale-formatted string.
 * Supports locale-specific decimal and thousands separators, grouping, custom precision,
 * trailing zero stripping, and asset code display.
 *
 * @param amount - The raw amount string (e.g. "100.5000000"), number, or StellarBalance object.
 * @param options - Configuration options for locale, precision, and asset placement.
 * @returns The locale-formatted amount string.
 *
 * @example
 * ```ts
 * formatAssetAmount("1234567.89", { locale: "en-US", assetCode: "XLM" });
 * // => "1,234,567.89 XLM"
 *
 * formatAssetAmount("1234567.89", { locale: "de-DE", assetCode: "USDC" });
 * // => "1.234.567,89 USDC"
 *
 * formatAssetAmount("100.5000000", { trimTrailingZeros: true });
 * // => "100.5"
 * ```
 */
export function formatAssetAmount(
  amount: string | number | StellarBalance | null | undefined,
  options: FormatAssetAmountOptions = {}
): string {
  const {
    locale,
    minimumFractionDigits = 0,
    maximumFractionDigits = 7,
    useGrouping = true,
    assetPosition = "suffix",
    trimTrailingZeros = false,
    notation = "standard",
    fallback = "0",
  } = options;

  let rawValue: string | number | null | undefined = amount as string | number | null | undefined;
  let inferredAssetCode = options.assetCode;

  if (isStellarBalance(amount)) {
    rawValue = amount.balance;
    if (!inferredAssetCode) {
      inferredAssetCode = amount.isNative ? "XLM" : amount.assetCode;
    }
  }

  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return appendAssetCode(fallback, inferredAssetCode, assetPosition);
  }

  const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);

  if (Number.isNaN(numericValue)) {
    return appendAssetCode(fallback, inferredAssetCode, assetPosition);
  }

  let formatted = "";

  try {
    const formatter = new Intl.NumberFormat(locale, {
      useGrouping,
      minimumFractionDigits,
      maximumFractionDigits,
      notation,
    });

    if (trimTrailingZeros && typeof formatter.formatToParts === "function") {
      const parts = formatter.formatToParts(numericValue);
      const decimalIndex = parts.findIndex((p) => p.type === "decimal");
      const fractionIndex = parts.findIndex((p) => p.type === "fraction");

      if (decimalIndex !== -1 && fractionIndex !== -1) {
        let fractionStr = parts[fractionIndex].value;
        const minDigits = minimumFractionDigits;

        while (fractionStr.length > minDigits && fractionStr.endsWith("0")) {
          fractionStr = fractionStr.slice(0, -1);
        }

        if (fractionStr.length === 0) {
          // Remove fraction and decimal separator
          parts.splice(decimalIndex, 2);
        } else {
          parts[fractionIndex].value = fractionStr;
        }

        formatted = parts.map((p) => p.value).join("");
      } else {
        formatted = formatter.format(numericValue);
      }
    } else {
      formatted = formatter.format(numericValue);
    }
  } catch {
    // Fallback if Intl.NumberFormat fails
    formatted = String(numericValue);
  }

  return appendAssetCode(formatted, inferredAssetCode, assetPosition);
}

function appendAssetCode(
  formattedAmount: string,
  assetCode?: string,
  position: "prefix" | "suffix" | "none" = "suffix"
): string {
  if (!assetCode || position === "none") {
    return formattedAmount;
  }

  if (position === "prefix") {
    return `${assetCode} ${formattedAmount}`;
  }

  return `${formattedAmount} ${assetCode}`;
}

/**
 * React hook that returns a reusable formatting helper function with pre-configured options.
 *
 * @param defaultOptions - Default formatting options bound to the helper.
 * @returns A memoized amount formatting function.
 *
 * @example
 * ```tsx
 * const formatAmount = useFormatAmount({ locale: "en-US", assetCode: "XLM", trimTrailingZeros: true });
 * return <div>Balance: {formatAmount(balance.balance)}</div>;
 * ```
 */
export function useFormatAmount(defaultOptions?: FormatAssetAmountOptions) {
  return useCallback(
    (
      amount: string | number | StellarBalance | null | undefined,
      overrideOptions?: FormatAssetAmountOptions
    ) => {
      return formatAssetAmount(amount, { ...defaultOptions, ...overrideOptions });
    },
    [defaultOptions]
  );
}
