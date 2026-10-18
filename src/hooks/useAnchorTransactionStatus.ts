/**
 * @file useAnchorTransactionStatus.ts
 * @description Hook for polling a SEP-24 anchor transaction until it reaches a terminal status.
 * @package stellar-hooks
 * @license MIT
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { Sep24Transaction, Sep24TransactionStatus } from "./useSep24";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Every status an anchor may report for a SEP-24 transaction. Extends the
 * statuses known to `useSep24` with `no_market`, which SEP-24 also defines.
 */
export type AnchorTransactionStatus = Sep24TransactionStatus | "no_market";

/** A SEP-24 transaction record as returned by `GET /transaction`. */
export interface AnchorTransaction extends Omit<Sep24Transaction, "status"> {
  /** Current status of the transaction */
  status: AnchorTransactionStatus;
  /** Human-readable explanation of the current status, if provided */
  message?: string;
  /** Estimated seconds until the status changes, if provided */
  status_eta?: number;
}

export interface UseAnchorTransactionStatusOptions {
  /** Base URL of the anchor's SEP-24 `TRANSFER_SERVER_SEP0024` */
  anchorUrl: string | null | undefined;
  /** Anchor transaction ID to track. Polling is disabled while falsy. */
  transactionId: string | null | undefined;
  /** SEP-10 JWT used to authenticate with the anchor */
  jwt: string | null | undefined;
  /** Milliseconds between polls. Defaults to `5000`. */
  pollIntervalMs?: number;
}

export interface UseAnchorTransactionStatusReturn {
  /** Latest transaction record returned by the anchor */
  transaction: AnchorTransaction | null;
  /** Shortcut for `transaction.status` */
  status: AnchorTransactionStatus | null;
  /** True while the hook is actively polling (not yet in a terminal status) */
  isPolling: boolean;
  /** Last error encountered while fetching, if any */
  error: Error | null;
  /** Fetch the transaction immediately, resuming polling if it is not terminal */
  refetch: () => Promise<void>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Statuses after which the anchor will not update the transaction further. */
export const TERMINAL_ANCHOR_STATUSES: ReadonlySet<AnchorTransactionStatus> = new Set([
  "completed",
  "refunded",
  "expired",
  "no_market",
  "error",
]);

/** Returns `true` when `status` is a terminal SEP-24 transaction status. */
export function isTerminalAnchorStatus(
  status: AnchorTransactionStatus | null | undefined
): boolean {
  return status != null && TERMINAL_ANCHOR_STATUSES.has(status);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Polls a SEP-24 anchor's `/transaction` endpoint until the transaction reaches
 * a terminal status (`completed`, `refunded`, `expired`, `no_market`, `error`).
 *
 * Polling restarts whenever `anchorUrl`, `transactionId`, `jwt`, or
 * `pollIntervalMs` change, and all timers are cleared on unmount.
 *
 * @example
 * ```tsx
 * const { status, isPolling, transaction } = useAnchorTransactionStatus({
 *   anchorUrl: "https://testanchor.stellar.org/sep24",
 *   transactionId: txId,
 *   jwt,
 * });
 * ```
 */
export function useAnchorTransactionStatus({
  anchorUrl,
  transactionId,
  jwt,
  pollIntervalMs = 5000,
}: UseAnchorTransactionStatusOptions): UseAnchorTransactionStatusReturn {
  const [transaction, setTransaction] = useState<AnchorTransaction | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Incremented on every parameter change / unmount so stale responses are ignored.
  const generationRef = useRef(0);

  const enabled = Boolean(anchorUrl && transactionId && jwt);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    if (!anchorUrl || !transactionId || !jwt) return;

    const generation = generationRef.current;
    clearTimer();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsPolling(true);

    let nextStatus: AnchorTransactionStatus | null = null;
    try {
      const url = new URL(`${anchorUrl.replace(/\/+$/, "")}/transaction`);
      url.searchParams.set("id", transactionId);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Anchor responded with ${res.status}: ${res.statusText}`);
      }
      const body = (await res.json()) as { transaction?: AnchorTransaction };
      if (!body.transaction) {
        throw new Error("Anchor response did not include a transaction");
      }
      if (generation !== generationRef.current) return;

      nextStatus = body.transaction.status;
      setTransaction(body.transaction);
      setError(null);
    } catch (err) {
      if (generation !== generationRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err : new Error(String(err)));
    }

    // Network/HTTP errors are treated as transient: keep polling.
    if (isTerminalAnchorStatus(nextStatus)) {
      setIsPolling(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      void poll();
    }, pollIntervalMs);
  }, [anchorUrl, transactionId, jwt, pollIntervalMs, clearTimer]);

  useEffect(() => {
    generationRef.current += 1;
    setTransaction(null);
    setError(null);

    if (!enabled) {
      setIsPolling(false);
      return;
    }

    void poll();

    return () => {
      generationRef.current += 1;
      clearTimer();
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, poll, clearTimer]);

  return {
    transaction,
    status: transaction?.status ?? null,
    isPolling,
    error,
    refetch: poll,
  };
}
