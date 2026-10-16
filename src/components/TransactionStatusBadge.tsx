/**
 * @file TransactionStatusBadge.tsx
 * @description Component that renders the state of a submitted Stellar transaction —
 *              pending, success, or error — with an optional link to a block explorer.
 * @package stellar-hooks
 * @license MIT
 */

import React from "react";
import type { TransactionStatus } from "../types";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Maps each TransactionStatus to a human-readable label. */
const DEFAULT_LABELS: Record<TransactionStatus, string> = {
  idle: "Idle",
  submitting: "Submitting…",
  polling: "Pending…",
  success: "Success",
  error: "Error",
};

/** CSS custom-property–based palette — see #996 theming support. */
const TOKEN = {
  idle: {
    bg: "var(--sh-badge-idle-bg, rgba(100,116,139,0.15))",
    text: "var(--sh-badge-idle-text, #64748b)",
    border: "var(--sh-badge-idle-border, rgba(100,116,139,0.35))",
    dot: "var(--sh-badge-idle-dot, #94a3b8)",
  },
  submitting: {
    bg: "var(--sh-badge-pending-bg, rgba(14,165,233,0.12))",
    text: "var(--sh-badge-pending-text, #0ea5e9)",
    border: "var(--sh-badge-pending-border, rgba(14,165,233,0.35))",
    dot: "var(--sh-badge-pending-dot, #38bdf8)",
  },
  polling: {
    bg: "var(--sh-badge-pending-bg, rgba(14,165,233,0.12))",
    text: "var(--sh-badge-pending-text, #0ea5e9)",
    border: "var(--sh-badge-pending-border, rgba(14,165,233,0.35))",
    dot: "var(--sh-badge-pending-dot, #38bdf8)",
  },
  success: {
    bg: "var(--sh-badge-success-bg, rgba(34,197,94,0.12))",
    text: "var(--sh-badge-success-text, #16a34a)",
    border: "var(--sh-badge-success-border, rgba(34,197,94,0.35))",
    dot: "var(--sh-badge-success-dot, #22c55e)",
  },
  error: {
    bg: "var(--sh-badge-error-bg, rgba(239,68,68,0.12))",
    text: "var(--sh-badge-error-text, #dc2626)",
    border: "var(--sh-badge-error-border, rgba(239,68,68,0.35))",
    dot: "var(--sh-badge-error-dot, #ef4444)",
  },
};

export interface TransactionStatusBadgeProps {
  /**
   * Current transaction status from a write hook (usePayment, useTransaction, etc.).
   */
  status: TransactionStatus;

  /**
   * Transaction hash. When provided together with `explorerUrl`, a clickable
   * "View on explorer" link is rendered below the badge.
   */
  hash?: string | null;

  /**
   * Base URL of a Stellar block explorer. The transaction hash is appended as a
   * path segment. Supports any explorer, e.g.:
   * - "https://stellar.expert/explorer/testnet/tx"
   * - "https://stellarchain.io/transactions"
   *
   * Default: "https://stellar.expert/explorer/testnet/tx"
   */
  explorerUrl?: string;

  /**
   * Error object from the transaction hook. Displayed when status is "error".
   */
  error?: Error | { message: string } | null;

  /**
   * Override the display label for a given status.
   * Partial — only the statuses you specify are overridden.
   */
  labels?: Partial<Record<TransactionStatus, string>>;

  /**
   * When true, a pulsing animation dot is shown for pending states (submitting / polling).
   * Default: true.
   */
  showPulse?: boolean;

  /** Additional CSS class name(s) applied to the root element. */
  className?: string;

  /** Inline styles applied to the root element. */
  style?: React.CSSProperties;
}

// ─── Pulse animation (injected once) ─────────────────────────────────────────

let pulseStyleInjected = false;

function injectPulseStyle() {
  if (pulseStyleInjected || typeof document === "undefined") return;
  pulseStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
@keyframes sh-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.85); }
}`;
  document.head.appendChild(style);
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Displays the state of a submitted Stellar transaction as a colour-coded badge.
 *
 * Supports the full `TransactionStatus` lifecycle (`idle → submitting → polling →
 * success | error`) and renders an optional "View on explorer" link when a hash
 * and explorer base URL are provided. All colours are driven by CSS custom
 * properties so consumers can restyle without overriding class names (#996).
 *
 * @example
 * ```tsx
 * const { status, hash, error } = usePayment({ ... });
 *
 * <TransactionStatusBadge
 *   status={status}
 *   hash={hash}
 *   error={error}
 *   explorerUrl="https://stellar.expert/explorer/testnet/tx"
 * />
 * ```
 */
export function TransactionStatusBadge({
  status,
  hash,
  explorerUrl = "https://stellar.expert/explorer/testnet/tx",
  error,
  labels,
  showPulse = true,
  className,
  style,
}: TransactionStatusBadgeProps): React.JSX.Element {
  injectPulseStyle();

  const palette = TOKEN[status] ?? TOKEN.idle;
  const isPending = status === "submitting" || status === "polling";
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels };
  const label = resolvedLabels[status];

  const explorerHref =
    hash && explorerUrl ? `${explorerUrl.replace(/\/$/, "")}/${hash}` : null;

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "var(--sh-badge-gap, 6px)",
        fontFamily: "var(--sh-font-family, ui-sans-serif, system-ui, sans-serif)",
        ...style,
      }}
    >
      {/* Badge pill */}
      <span
        role="status"
        aria-live="polite"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--sh-badge-icon-gap, 6px)",
          padding: "var(--sh-badge-padding, 4px 10px)",
          borderRadius: "var(--sh-badge-radius, 9999px)",
          border: `1px solid ${palette.border}`,
          background: palette.bg,
          color: palette.text,
          fontSize: "var(--sh-badge-font-size, 0.8125rem)",
          fontWeight: 500,
          lineHeight: 1.4,
          transition: "background 0.2s, color 0.2s, border-color 0.2s",
        }}
      >
        {/* Status dot */}
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: "var(--sh-badge-dot-size, 7px)",
            height: "var(--sh-badge-dot-size, 7px)",
            borderRadius: "50%",
            background: palette.dot,
            flexShrink: 0,
            animation:
              showPulse && isPending
                ? "sh-pulse 1.4s ease-in-out infinite"
                : "none",
          }}
        />
        {label}
      </span>

      {/* Error message */}
      {status === "error" && error && (
        <span
          role="alert"
          style={{
            fontSize: "var(--sh-badge-error-msg-size, 0.75rem)",
            color: "var(--sh-badge-error-text, #dc2626)",
            maxWidth: "var(--sh-badge-error-max-width, 320px)",
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </span>
      )}

      {/* Explorer link */}
      {explorerHref && status === "success" && (
        <a
          href={explorerHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "var(--sh-badge-link-size, 0.75rem)",
            color: "var(--sh-badge-link-color, #0ea5e9)",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          View on explorer ↗
        </a>
      )}
    </div>
  );
}
