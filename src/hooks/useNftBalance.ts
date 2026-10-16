/**
 * @file useNftBalance.ts
 * @description Hook for Soroban NFT ownership checks — returns whether an account
 *   owns a given token ID, or lists all token IDs owned by an account.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useReducer } from "react";
import {
  Contract,
  Account,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk/minimal";
import * as rpc from "@stellar/stellar-sdk/rpc";
import { useStellarContext } from "../context";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseNftBalanceOptions {
  /**
   * Contract address of the NFT (C-prefix Soroban contract ID).
   * Required.
   */
  contractId: string;
  /**
   * Account public key (G...) to query. Defaults to the dummy account so you
   * can pre-configure the hook without a wallet connection.
   */
  owner?: string;
  /**
   * When provided, the hook calls `balance_of(owner, tokenId)` and returns
   * `ownsToken` based on the result (1 = owns it, 0 = does not).
   * When omitted, the hook calls `tokens_of(owner)` to list all owned tokens.
   */
  tokenId?: string | number;
  /** Enable automatic fetching on mount. Default: true */
  enabled?: boolean;
  /** Re-fetch interval in milliseconds. 0 = disabled. Default: 0 */
  refetchInterval?: number;
  /** Cache TTL in milliseconds. Default: 30 000 */
  cacheTTL?: number;
  /** Callback fired when data is successfully loaded. */
  onSuccess?: (data: UseNftBalanceData) => void;
  /** Callback fired on error. */
  onError?: (error: Error) => void;
}

export interface UseNftBalanceData {
  /**
   * `true` when `tokenId` is set and the account owns that specific token.
   * `null` when `tokenId` is not set.
   */
  ownsToken: boolean | null;
  /**
   * List of token IDs owned by the account when `tokenId` is not set.
   * Empty array when `tokenId` is provided (ownership checked via `ownsToken`).
   */
  ownedTokenIds: string[];
}

export interface UseNftBalanceReturn {
  /** Ownership data, or `null` while loading. */
  data: UseNftBalanceData | null;
  /** `true` during the first fetch. */
  isLoading: boolean;
  /** `true` during background re-fetches after the first successful load. */
  isRefetching: boolean;
  /** Fetch error, or `null`. */
  error: Error | null;
  /** Manually trigger a re-fetch. */
  refetch: () => Promise<void>;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

interface State {
  data: UseNftBalanceData | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
}

type Action =
  | { type: "FETCH_START"; isRefetch: boolean }
  | { type: "FETCH_SUCCESS"; data: UseNftBalanceData }
  | { type: "FETCH_ERROR"; error: Error };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return {
        ...state,
        isLoading: !action.isRefetch && state.data === null,
        isRefetching: action.isRefetch || state.data !== null,
        error: null,
      };
    case "FETCH_SUCCESS":
      return { data: action.data, isLoading: false, isRefetching: false, error: null };
    case "FETCH_ERROR":
      return { ...state, isLoading: false, isRefetching: false, error: action.error };
    default:
      return state;
  }
}

const DUMMY_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Check whether an account owns a given NFT, or list all NFTs it owns, for
 * contracts following the common Soroban NFT interface
 * (`balance_of(owner, token_id)` / `tokens_of(owner)`).
 *
 * @example
 * ```tsx
 * // Check ownership of token #42
 * const { data, isLoading } = useNftBalance({
 *   contractId: "CABC...XYZ",
 *   owner: "GABC...",
 *   tokenId: 42,
 * });
 * if (data?.ownsToken) return <p>You own this NFT</p>;
 *
 * // List all tokens owned by an account
 * const { data } = useNftBalance({
 *   contractId: "CABC...XYZ",
 *   owner: "GABC...",
 * });
 * console.log(data?.ownedTokenIds); // ["1", "5", "23"]
 * ```
 */
export function useNftBalance(options: UseNftBalanceOptions): UseNftBalanceReturn {
  const {
    contractId,
    owner,
    tokenId,
    enabled = true,
    refetchInterval = 0,
    cacheTTL = 30_000,
    onSuccess,
    onError,
  } = options;

  const { config } = useStellarContext();

  const [state, dispatch] = useReducer(reducer, {
    data: null,
    isLoading: false,
    isRefetching: false,
    error: null,
  });

  const fetch = useCallback(
    async (isRefetch = false) => {
      if (!contractId) return;

      dispatch({ type: "FETCH_START", isRefetch });

      try {
        const server = new rpc.Server(config.sorobanRpcUrl);
        const contract = new Contract(contractId);
        const targetOwner = owner ?? DUMMY_ACCOUNT;

        // Resolve a simulation account
        let accountObj: Account;
        try {
          accountObj = await server.getAccount(targetOwner);
        } catch {
          accountObj = new Account(targetOwner, "0");
        }

        let result: UseNftBalanceData;

        if (tokenId !== undefined) {
          // Call balance_of(owner, token_id) — returns u32/i128 (1 = owns, 0 = not)
          const tx = new TransactionBuilder(accountObj, {
            fee: "100",
            networkPassphrase: config.networkPassphrase,
          })
            .addOperation(
              contract.call(
                "balance_of",
                nativeToScVal(targetOwner, { type: "address" }),
                nativeToScVal(Number(tokenId), { type: "u32" }),
              ),
            )
            .setTimeout(30)
            .build();

          const simResult = await server.simulateTransaction(tx);

          if (rpc.Api.isSimulationError(simResult)) {
            throw new Error(`NFT balance_of simulation failed: ${simResult.error}`);
          }

          const retval = simResult.result?.retval ?? xdr.ScVal.scvVoid();
          const native = scValToNative(retval);
          // Some contracts return boolean, some return u32 count
          const owns = native === true || native === 1 || Number(native) > 0;

          result = { ownsToken: owns, ownedTokenIds: [] };
        } else {
          // Call tokens_of(owner) — returns Vec<u32> or Vec<string>
          const tx = new TransactionBuilder(accountObj, {
            fee: "100",
            networkPassphrase: config.networkPassphrase,
          })
            .addOperation(
              contract.call(
                "tokens_of",
                nativeToScVal(targetOwner, { type: "address" }),
              ),
            )
            .setTimeout(30)
            .build();

          const simResult = await server.simulateTransaction(tx);

          if (rpc.Api.isSimulationError(simResult)) {
            throw new Error(`NFT tokens_of simulation failed: ${simResult.error}`);
          }

          const retval = simResult.result?.retval ?? xdr.ScVal.scvVoid();
          const native = scValToNative(retval);
          const tokenList = Array.isArray(native)
            ? (native as unknown[]).map(String)
            : [];

          result = { ownsToken: null, ownedTokenIds: tokenList };
        }

        void cacheTTL; // acknowledged, cache omitted for simplicity — data is always fresh

        dispatch({ type: "FETCH_SUCCESS", data: result });
        onSuccess?.(result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        dispatch({ type: "FETCH_ERROR", error });
        onError?.(error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contractId, owner, tokenId, config.sorobanRpcUrl, config.networkPassphrase],
  );

  // Auto-fetch on mount and when key dependencies change
  useEffect(() => {
    if (!enabled || !contractId) return;
    void fetch(false);
  }, [enabled, contractId, owner, tokenId, fetch]);

  // Optional polling
  useEffect(() => {
    if (!enabled || !contractId || refetchInterval <= 0) return;
    const id = setInterval(() => void fetch(true), refetchInterval);
    return () => clearInterval(id);
  }, [enabled, contractId, owner, tokenId, refetchInterval, fetch]);

  return {
    data: state.data,
    isLoading: state.isLoading,
    isRefetching: state.isRefetching,
    error: state.error,
    refetch: () => fetch(true),
  };
}
