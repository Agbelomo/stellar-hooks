/**
 * @file StellarAddress.tsx
 * @description A component that displays a shortened Stellar public key,
 *   copies the full address to the clipboard on click, and announces the
 *   action to screen-readers via a live region.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useRef, useState } from "react";
import * as React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StellarAddressProps {
  /** The full Stellar public key (G…) to display. */
  address: string;
  /**
   * Number of leading characters shown before "…".
   * @default 4
   */
  leadingChars?: number;
  /**
   * Number of trailing characters shown after "…".
   * @default 4
   */
  trailingChars?: number;
  /**
   * Accessible label announced when the address is copied. "{address}" is
   * replaced with the truncated representation.
   * @default "Address copied to clipboard"
   */
  copiedLabel?: string;
  /**
   * Milliseconds to show the "copied" feedback before reverting.
   * @default 2000
   */
  feedbackDuration?: number;
  /** Optional class name for the outer `<button>` element. */
  className?: string;
  /** Inline styles for the outer `<button>` element. */
  style?: React.CSSProperties;
  /** Called after the address is successfully written to the clipboard. */
  onCopy?: (address: string) => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function truncateAddress(
  address: string,
  leading: number,
  trailing: number,
): string {
  if (address.length <= leading + trailing + 3) return address;
  return `${address.slice(0, leading)}…${address.slice(-trailing)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Displays a Stellar public key in truncated form. Clicking copies the full
 * address to the clipboard and announces the action to screen-readers.
 *
 * @example
 * ```tsx
 * <StellarAddress address={publicKey} leadingChars={6} trailingChars={6} />
 * ```
 */
export function StellarAddress({
  address,
  leadingChars = 4,
  trailingChars = 4,
  copiedLabel = "Address copied to clipboard",
  feedbackDuration = 2000,
  className,
  style,
  onCopy,
}: StellarAddressProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const truncated = truncateAddress(address, leadingChars, trailingChars);

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Fallback for environments without Clipboard API (e.g., older WebViews)
      const ta = document.createElement("textarea");
      ta.value = address;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }

    setCopied(true);
    onCopy?.(address);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, feedbackDuration);
  }, [address, feedbackDuration, onCopy]);

  return (
    <>
      <button
        type="button"
        title={address}
        aria-label={`Stellar address ${truncated} — click to copy`}
        onClick={() => void handleClick()}
        className={className}
        style={style}
      >
        <span aria-hidden="true">{truncated}</span>
      </button>
      {/* Screen-reader live region */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}
