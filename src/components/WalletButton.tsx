/**
 * @file WalletButton.tsx
 * @description A small unstyled connect/disconnect button built on useWallet.
 *   Shows the truncated connected address when a wallet is connected, or a
 *   configurable connect label when not connected.
 * @package stellar-hooks
 * @license MIT
 */

import * as React from "react";
import { useWallet } from "../hooks/useWallet";
import type { UseWalletOptions } from "../hooks/useWallet";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletButtonProps {
  /**
   * Options forwarded to the underlying `useWallet` hook.
   * Use this to pass `walletId`, `autoConnect`, etc.
   */
  walletOptions?: UseWalletOptions;
  /**
   * Number of leading characters to show when truncating the public key.
   * @default 4
   */
  leadingChars?: number;
  /**
   * Number of trailing characters to show when truncating the public key.
   * @default 4
   */
  trailingChars?: number;
  /** Label shown when no wallet is connected. @default "Connect Wallet" */
  connectLabel?: string;
  /** Label shown while connecting. @default "Connecting…" */
  connectingLabel?: string;
  /** Label shown while disconnecting (not applicable — disconnect is instant). */
  disconnectLabel?: string;
  /** Optional class name for the `<button>` element. */
  className?: string;
  /** Inline styles for the `<button>` element. */
  style?: React.CSSProperties;
  /**
   * Called after a successful connection with the connected public key.
   * Useful for triggering app-level state updates.
   */
  onConnect?: (publicKey: string) => void;
  /** Called after the wallet is disconnected. */
  onDisconnect?: () => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function truncate(address: string, leading: number, trailing: number): string {
  if (address.length <= leading + trailing + 3) return address;
  return `${address.slice(0, leading)}…${address.slice(-trailing)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * An unstyled-by-default connect/disconnect button that wraps `useWallet`.
 *
 * - When no wallet is connected it renders a connect button. Clicking it
 *   calls `connect()` on the first available wallet (or the wallet specified
 *   via `walletOptions.walletId`).
 * - When a wallet is connected it shows the truncated public key and clicking
 *   the button calls `disconnect()`.
 *
 * All styling is opt-in via `className` / `style` so the component works in
 * any design system without overrides.
 *
 * @example
 * ```tsx
 * // Basic usage — relies on auto-detected available wallets
 * <WalletButton />
 *
 * // With custom labels and connect/disconnect callbacks
 * <WalletButton
 *   connectLabel="Sign in with Stellar"
 *   onConnect={(pk) => console.log("Connected:", pk)}
 *   onDisconnect={() => console.log("Disconnected")}
 * />
 *
 * // Targeting a specific wallet
 * <WalletButton walletOptions={{ walletId: "freighter" }} />
 * ```
 */
export function WalletButton({
  walletOptions,
  leadingChars = 4,
  trailingChars = 4,
  connectLabel = "Connect Wallet",
  connectingLabel = "Connecting…",
  disconnectLabel,
  className,
  style,
  onConnect,
  onDisconnect,
}: WalletButtonProps): React.JSX.Element {
  const { publicKey, isConnected, isConnecting, connect, disconnect } =
    useWallet(walletOptions);

  const handleClick = React.useCallback(async () => {
    if (isConnected) {
      disconnect();
      onDisconnect?.();
    } else {
      const pk = await connect(walletOptions?.walletId);
      if (pk) onConnect?.(pk);
    }
  }, [
    isConnected,
    connect,
    disconnect,
    walletOptions?.walletId,
    onConnect,
    onDisconnect,
  ]);

  const label = React.useMemo(() => {
    if (isConnecting) return connectingLabel;
    if (isConnected && publicKey) {
      return disconnectLabel ?? truncate(publicKey, leadingChars, trailingChars);
    }
    return connectLabel;
  }, [
    isConnecting,
    isConnected,
    publicKey,
    connectingLabel,
    connectLabel,
    disconnectLabel,
    leadingChars,
    trailingChars,
  ]);

  return (
    <button
      type="button"
      disabled={isConnecting}
      aria-busy={isConnecting}
      aria-label={
        isConnected && publicKey
          ? `Connected as ${publicKey} — click to disconnect`
          : "Connect your Stellar wallet"
      }
      onClick={() => void handleClick()}
      className={className}
      style={style}
    >
      {label}
    </button>
  );
}
