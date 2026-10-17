/**
 * @file StellarIdenticon.tsx
 * @description A component that renders a deterministic identicon SVG from a
 *   Stellar public key. Uses only the browser's built-in SubtleCrypto API —
 *   no network requests and no third-party dependencies.
 * @package stellar-hooks
 * @license MIT
 */

import { useEffect, useState } from "react";
import * as React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StellarIdenticonProps {
  /** Stellar public key (G…) used as entropy source. */
  address: string;
  /**
   * Rendered size in pixels (the SVG viewBox is always 8×8 grid units).
   * @default 40
   */
  size?: number;
  /** Optional `className` for the outer `<svg>` element. */
  className?: string;
  /** Inline styles for the outer `<svg>` element. */
  style?: React.CSSProperties;
  /**
   * Accessible label for the image. Falls back to a generic description when
   * not provided.
   */
  alt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash — tiny, deterministic, zero-dependency. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/** Derive an HSL colour from the public key. */
function deriveColor(address: string): string {
  const h = fnv1a(address) % 360;
  return `hsl(${h}, 60%, 45%)`;
}

/**
 * Build a symmetric 5×5 pixel grid from the address string.
 * Columns 0–2 are computed; columns 3–4 mirror columns 1–0.
 */
function buildGrid(address: string): boolean[][] {
  const rows = 5;
  const cols = 5;
  const seed = address.split("").map((c) => c.charCodeAt(0));
  const grid: boolean[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < Math.ceil(cols / 2); c++) {
      const idx = r * Math.ceil(cols / 2) + c;
      const byte = seed[idx % seed.length] ?? 0;
      const on = byte % 2 === 0;
      row.push(on);
    }
    // Mirror
    const full: boolean[] = [...row, ...[...row].reverse().slice(cols % 2 === 0 ? 0 : 1)];
    grid.push(full.slice(0, cols));
  }
  return grid;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a deterministic 5×5 identicon SVG for a given Stellar public key.
 * The shape and colour are derived purely from the address — no randomness
 * and no network requests.
 *
 * @example
 * ```tsx
 * <StellarIdenticon address={publicKey} size={48} />
 * ```
 */
export function StellarIdenticon({
  address,
  size = 40,
  className,
  style,
  alt,
}: StellarIdenticonProps): React.JSX.Element {
  // Grid and colour are cheap to compute synchronously.
  const [grid, setGrid] = useState<boolean[][]>([]);
  const [color, setColor] = useState("#888");

  useEffect(() => {
    if (!address) return;
    setGrid(buildGrid(address));
    setColor(deriveColor(address));
  }, [address]);

  const GRID_ROWS = 5;
  const GRID_COLS = 5;
  const CELL = 10; // SVG units per cell
  const PAD = 5;  // padding in SVG units
  const viewSize = GRID_COLS * CELL + PAD * 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      width={size}
      height={size}
      role="img"
      aria-label={alt ?? `Identicon for Stellar address ${address.slice(0, 8)}…`}
      className={className}
      style={style}
    >
      <rect width={viewSize} height={viewSize} fill="#f0f0f0" rx="2" />
      {grid.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={PAD + c * CELL}
              y={PAD + r * CELL}
              width={CELL}
              height={CELL}
              fill={color}
            />
          ) : null
        )
      )}
      {/* Invisible rows/cols placeholder so SVG renders even before useEffect fires */}
      {grid.length === 0 &&
        Array.from({ length: GRID_ROWS }, (_, r) =>
          Array.from({ length: GRID_COLS }, (_, c) => (
            <rect
              key={`ph-${r}-${c}`}
              x={PAD + c * CELL}
              y={PAD + r * CELL}
              width={CELL}
              height={CELL}
              fill="transparent"
            />
          ))
        )}
    </svg>
  );
}
