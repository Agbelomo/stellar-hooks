/**
 * @file theme.ts
 * @description CSS custom-property theming for stellar-hooks UI components.
 *
 * All colours, radii, and spacing values used by stellar-hooks components
 * (`TransactionStatusBadge`, `FormattedBalance`, `HookActivityOverlay`,
 * `DevToolsPanel`, etc.) are expressed as CSS variables so consumers can
 * restyle components without overriding class names (#996).
 *
 * ## Usage
 *
 * ### Declarative (recommended)
 * Wrap your app with `<StellarThemeProvider>` and pass a `theme` object:
 *
 * ```tsx
 * import { StellarThemeProvider } from "stellar-hooks";
 *
 * <StellarThemeProvider theme={{ colors: { success: "#10b981" } }}>
 *   <App />
 * </StellarThemeProvider>
 * ```
 *
 * ### Manual CSS
 * Add a `:root` block (or any ancestor selector) with overrides:
 *
 * ```css
 * :root {
 *   --sh-badge-success-text: #10b981;
 *   --sh-badge-radius: 4px;
 *   --sh-font-family: "Inter", sans-serif;
 * }
 * ```
 *
 * ### Programmatic
 * Call `applyStellarTheme(element, tokens)` to inject variables directly:
 *
 * ```ts
 * import { applyStellarTheme } from "stellar-hooks";
 * applyStellarTheme(document.documentElement, { colors: { error: "#e11d48" } });
 * ```
 *
 * @package stellar-hooks
 * @license MIT
 */

import React from "react";

// ─── Token definitions ────────────────────────────────────────────────────────

export interface StellarThemeColors {
  /** Primary accent (links, highlights). Default: #0ea5e9 */
  accent?: string;
  /** Success state text colour. Default: #16a34a */
  success?: string;
  /** Error state text colour. Default: #dc2626 */
  error?: string;
  /** Pending/loading state text colour. Default: #0ea5e9 */
  pending?: string;
  /** Muted / idle text colour. Default: #64748b */
  muted?: string;
}

export interface StellarThemeTokens {
  /** Colour overrides for semantic states. */
  colors?: StellarThemeColors;

  /**
   * Badge/pill border-radius.
   * - "pill" (default) – fully rounded corners (9999px)
   * - "rounded"        – 6px corners
   * - "square"         – 2px corners
   * - any CSS <length> – e.g. "4px"
   */
  badgeRadius?: "pill" | "rounded" | "square" | string;

  /**
   * Base font-family applied to all stellar-hooks components.
   * Default: `ui-sans-serif, system-ui, sans-serif`
   */
  fontFamily?: string;

  /**
   * Base font-size for badge labels. Default: "0.8125rem" (13 px).
   */
  badgeFontSize?: string;

  /**
   * Internal gap between the status dot and the label text. Default: "6px".
   */
  badgeIconGap?: string;

  /**
   * Padding inside the badge pill. Default: "4px 10px".
   */
  badgePadding?: string;

  /**
   * Diameter of the status indicator dot. Default: "7px".
   */
  badgeDotSize?: string;
}

// ─── Resolved radius helper ───────────────────────────────────────────────────

const RADIUS_PRESETS: Record<string, string> = {
  pill: "9999px",
  rounded: "6px",
  square: "2px",
};

function resolveRadius(value: string): string {
  return RADIUS_PRESETS[value] ?? value;
}

// ─── Token → CSS variable map ─────────────────────────────────────────────────

function buildCssVars(tokens: StellarThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {};

  if (tokens.fontFamily) vars["--sh-font-family"] = tokens.fontFamily;
  if (tokens.badgeFontSize) vars["--sh-badge-font-size"] = tokens.badgeFontSize;
  if (tokens.badgeIconGap) vars["--sh-badge-icon-gap"] = tokens.badgeIconGap;
  if (tokens.badgePadding) vars["--sh-badge-padding"] = tokens.badgePadding;
  if (tokens.badgeDotSize) vars["--sh-badge-dot-size"] = tokens.badgeDotSize;

  if (tokens.badgeRadius) {
    const r = resolveRadius(tokens.badgeRadius);
    vars["--sh-badge-radius"] = r;
  }

  const { colors } = tokens;
  if (colors) {
    if (colors.success) {
      vars["--sh-badge-success-text"] = colors.success;
      vars["--sh-badge-success-dot"] = colors.success;
      vars["--sh-badge-success-border"] = `${colors.success}59`; // ~35% alpha
    }
    if (colors.error) {
      vars["--sh-badge-error-text"] = colors.error;
      vars["--sh-badge-error-dot"] = colors.error;
      vars["--sh-badge-error-border"] = `${colors.error}59`;
    }
    if (colors.pending) {
      vars["--sh-badge-pending-text"] = colors.pending;
      vars["--sh-badge-pending-dot"] = colors.pending;
      vars["--sh-badge-pending-border"] = `${colors.pending}59`;
    }
    if (colors.muted) {
      vars["--sh-badge-idle-text"] = colors.muted;
      vars["--sh-badge-idle-dot"] = colors.muted;
      vars["--sh-badge-idle-border"] = `${colors.muted}59`;
    }
    if (colors.accent) {
      vars["--sh-badge-link-color"] = colors.accent;
    }
  }

  return vars;
}

// ─── Programmatic apply ───────────────────────────────────────────────────────

/**
 * Injects stellar-hooks CSS custom properties onto the given DOM element.
 * Call with `document.documentElement` to apply globally.
 *
 * @example
 * ```ts
 * applyStellarTheme(document.documentElement, {
 *   colors: { success: "#10b981", error: "#e11d48" },
 *   badgeRadius: "rounded",
 *   fontFamily: "'Inter', sans-serif",
 * });
 * ```
 */
export function applyStellarTheme(
  element: HTMLElement,
  tokens: StellarThemeTokens,
): void {
  const vars = buildCssVars(tokens);
  for (const [key, value] of Object.entries(vars)) {
    element.style.setProperty(key, value);
  }
}

// ─── React provider ───────────────────────────────────────────────────────────

export interface StellarThemeProviderProps {
  /** Theme tokens to apply as CSS custom properties on the wrapper element. */
  theme?: StellarThemeTokens;
  /**
   * When true, the wrapper `<div>` is replaced with a React Fragment and
   * variables are applied to `document.documentElement` on mount.
   * Useful when you don't want an extra DOM node at the root.
   * Default: false.
   */
  injectGlobal?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps children with a `<div>` that carries stellar-hooks CSS custom
 * properties. All nested components (`TransactionStatusBadge`, etc.) inherit
 * the variables, enabling scoped per-section theming.
 *
 * @example
 * ```tsx
 * <StellarThemeProvider
 *   theme={{
 *     colors: { success: "#10b981", error: "#e11d48" },
 *     badgeRadius: "rounded",
 *     fontFamily: "'Inter', sans-serif",
 *   }}
 * >
 *   <App />
 * </StellarThemeProvider>
 * ```
 */
export function StellarThemeProvider({
  theme,
  injectGlobal = false,
  children,
}: StellarThemeProviderProps): React.JSX.Element {
  const vars = theme ? buildCssVars(theme) : {};

  // Convert record to React-compatible style object
  const styleObj = vars as React.CSSProperties;

  React.useEffect(() => {
    if (!injectGlobal || !theme) return;
    applyStellarTheme(document.documentElement, theme);
  }, [injectGlobal, theme]);

  if (injectGlobal) {
    return <>{children}</>;
  }

  return (
    <div style={styleObj}>
      {children}
    </div>
  );
}

/**
 * Complete reference of every CSS custom property exposed by stellar-hooks UI
 * components. Consumers can set any of these in their own CSS:
 *
 * ```css
 * :root {
 *   --sh-font-family: "Inter", sans-serif;
 *
 *   --sh-badge-radius: 6px;
 *   --sh-badge-padding: 4px 10px;
 *   --sh-badge-font-size: 0.8125rem;
 *   --sh-badge-icon-gap: 6px;
 *   --sh-badge-dot-size: 7px;
 *   --sh-badge-gap: 6px;
 *
 *   --sh-badge-idle-bg: rgba(100,116,139,0.15);
 *   --sh-badge-idle-text: #64748b;
 *   --sh-badge-idle-border: rgba(100,116,139,0.35);
 *   --sh-badge-idle-dot: #94a3b8;
 *
 *   --sh-badge-pending-bg: rgba(14,165,233,0.12);
 *   --sh-badge-pending-text: #0ea5e9;
 *   --sh-badge-pending-border: rgba(14,165,233,0.35);
 *   --sh-badge-pending-dot: #38bdf8;
 *
 *   --sh-badge-success-bg: rgba(34,197,94,0.12);
 *   --sh-badge-success-text: #16a34a;
 *   --sh-badge-success-border: rgba(34,197,94,0.35);
 *   --sh-badge-success-dot: #22c55e;
 *
 *   --sh-badge-error-bg: rgba(239,68,68,0.12);
 *   --sh-badge-error-text: #dc2626;
 *   --sh-badge-error-border: rgba(239,68,68,0.35);
 *   --sh-badge-error-dot: #ef4444;
 *
 *   --sh-badge-link-color: #0ea5e9;
 *   --sh-badge-link-size: 0.75rem;
 *   --sh-badge-error-msg-size: 0.75rem;
 *   --sh-badge-error-max-width: 320px;
 * }
 * ```
 */
export const CSS_VARIABLE_REFERENCE = {} as const;
