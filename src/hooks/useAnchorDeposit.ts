/**
 * @file useAnchorDeposit.ts
 * @description Hook for initiating SEP-24 interactive deposits.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useState } from "react";
import {
  postSep24Interactive,
  toSep24Body,
  type Sep24InteractiveParams,
  type Sep24InteractiveResponse,
} from "../utils/sep24";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnchorDepositParams extends Sep24InteractiveParams {
  /** Wallet supports receiving the deposit as a claimable balance */
  claimableBalanceSupported?: boolean;
  /** Memo the anchor should attach to the Stellar payment */
  memo?: string;
  /** Type of `memo`: `"text"`, `"id"`, or `"hash"` */
  memoType?: "text" | "id" | "hash";
}

export interface UseAnchorDepositOptions {
  /** Anchor's `TRANSFER_SERVER_SEP0024` URL (see `useAnchorInfo`) */
  anchorUrl: string | null | undefined;
  /** SEP-10 JWT (see `useWebAuth`) */
  jwt: string | null | undefined;
}

export interface UseAnchorDepositReturn {
  /** Start an interactive deposit; resolves with the anchor's response */
  deposit: (params: AnchorDepositParams) => Promise<Sep24InteractiveResponse>;
  /** Interactive flow URL from the last successful request */
  url: string | null;
  /** Anchor transaction ID from the last successful request */
  transactionId: string | null;
  /** True while the request is in flight */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Clear `url`, `transactionId`, and `error` */
  reset: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Initiates SEP-24 interactive deposits via
 * `POST /transactions/deposit/interactive` and exposes the interactive URL
 * and transaction ID returned by the anchor.
 *
 * Open `url` in a popup or iframe, then track progress with
 * `useAnchorTransactionStatus` using `transactionId`.
 *
 * @example
 * ```tsx
 * const { transferServer } = useAnchorInfo({ domain: "testanchor.stellar.org" });
 * const { deposit, url, transactionId } = useAnchorDeposit({ anchorUrl: transferServer, jwt });
 *
 * const { url } = await deposit({ assetCode: "USDC", claimableBalanceSupported: true });
 * window.open(url, "anchor", "width=500,height=800");
 * ```
 */
export function useAnchorDeposit({ anchorUrl, jwt }: UseAnchorDepositOptions): UseAnchorDepositReturn {
  const [url, setUrl] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deposit = useCallback(
    async (params: AnchorDepositParams): Promise<Sep24InteractiveResponse> => {
      setIsLoading(true);
      setError(null);
      try {
        if (!anchorUrl) throw new Error("anchorUrl is required");
        if (!jwt) throw new Error("jwt is required");

        const body = toSep24Body(params);
        if (params.claimableBalanceSupported !== undefined) {
          body.claimable_balance_supported = params.claimableBalanceSupported;
        }
        if (params.memo) body.memo = params.memo;
        if (params.memoType) body.memo_type = params.memoType;

        const response = await postSep24Interactive(anchorUrl, jwt, "deposit", body);
        setUrl(response.url);
        setTransactionId(response.id);
        return response;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [anchorUrl, jwt]
  );

  const reset = useCallback(() => {
    setUrl(null);
    setTransactionId(null);
    setError(null);
  }, []);

  return { deposit, url, transactionId, isLoading, error, reset };
}
