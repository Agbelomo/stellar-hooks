/**
 * @file FormattedBalance.tsx
 * @description Component that renders a Stellar amount with its asset code,
 *              correct decimal places, and optional compact notation for large values.
 * @package stellar-hooks
 * @license MIT
 */

import React from "react";
import type { StellarBalance } from "../types";
import { formatAssetAmount } from "../utils/formatAmount";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormattedBalanceProps {
  /**
   * The raw amount string (e.g. "1234567.8900000"), a numeric value,
   * or a full StellarBalance object from useStellarBalance / useStellarAccount.
   */
  amount: string | number | StellarBalance | null | undefined;

  /**
   * Asset code shown alongside the amount (e.g. "XLM", "USDC").
   * Inferred automatically when `amount` is a StellarBalance object.
   */
  assetCode?: string;

  /**
   * Placement of the asset code relative to the formatted number.
   * - "suffix": "1,234.56 XLM" (default)
   * - "prefix": "XLM 1,234.56"
   * - "none": no asset code rendered
   */
  assetPosition?: "prefix" | "suffix" | "none";

  /**
   * Minimum number of decimal places (default: 0).
   */
  minimumFractionDigits?: number;

  /**
   * Maximum number of decimal places (default: 7 — Stellar's native precision).
   */
  maximumFractionDigits?: number;

  /**
   * When true, strips trailing zeros from the fractional part down to
   * `minimumFractionDigits`. Default: true.
   */
  trimTrailingZeros?: boolean;

  /**
   * Use compact notation for large values, e.g. "1.2M XLM" instead of
   * "1,200,000 XLM". Default: false.
   */
  compact?: boolean;

  /**
   * BCP 47 locale string used for number formatting (e.g. "en-US", "de-DE").
   * Defaults to the runtime locale.
   */
  locale?: string | string[];

  /**
   * Fallback string displayed when the amount is null, undefined, or not a
   * valid number. Default: "0".
   */
  fallback?: string;

  /**
   * HTML element to render the formatted balance into. Default: "span".
   */
  as?: keyof React.JSX.IntrinsicElements;

  /** Additional CSS class name(s) applied to the root element. */
  className?: string;

  /** Inline styles applied to the root element. */
  style?: React.CSSProperties;

  /** aria-label for screen-reader accessibility. */
  "aria-label"?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a Stellar asset amount with locale-aware number formatting.
 *
 * Handles raw amount strings, plain numbers, and full StellarBalance objects.
 * When a StellarBalance is passed the asset code is inferred automatically.
 *
 * @example
 * ```tsx
 * // Basic XLM display
 * <FormattedBalance amount="1234567.89" assetCode="XLM" />
 * // → "1,234,567.89 XLM"
 *
 * // Compact notation for large numbers
 * <FormattedBalance amount={5_200_000} assetCode="XLM" compact />
 * // → "5.2M XLM"
 *
 * // From a balance object (asset code inferred)
 * const { xlmBalance } = useStellarBalance(publicKey);
 * <FormattedBalance amount={xlmBalance} trimTrailingZeros />
 * // → "100.5 XLM"
 * ```
 */
export function FormattedBalance({
  amount,
  assetCode,
  assetPosition = "suffix",
  minimumFractionDigits = 0,
  maximumFractionDigits = 7,
  trimTrailingZeros = true,
  compact = false,
  locale,
  fallback = "0",
  as: Tag = "span",
  className,
  style,
  "aria-label": ariaLabel,
}: FormattedBalanceProps): React.JSX.Element {
  const formatted = formatAssetAmount(amount, {
    assetCode,
    assetPosition,
    minimumFractionDigits,
    maximumFractionDigits,
    trimTrailingZeros,
    notation: compact ? "compact" : "standard",
    locale,
    fallback,
  });

  return (
    <Tag
      className={className}
      style={style}
      aria-label={ariaLabel ?? formatted}
    >
      {formatted}
    </Tag>
  );
}
