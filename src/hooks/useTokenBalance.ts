/**
 * @file useTokenBalance.ts
 * @description Hook for reading the balance of a SEP-41 Soroban token.
 * @package stellar-hooks
 * @license MIT
 */

import { useMemo } from "react";
import { nativeToScVal, scValToNative, type xdr } from "@stellar/stellar-sdk/minimal";
import { useSorobanRead } from "./useSorobanRead";
import { DEFAULT_TOKEN_DECIMALS, formatTokenAmount } from "../utils/tokenAmount";

export interface UseTokenBalanceOptions {
  /** SEP-41 token contract address (C...). */
  contractId: string | null | undefined;
  /** Account to read the balance of (G... or C...). Fetching waits until set. */
  account: string | null | undefined;
  /** Decimals used for `formatted`. Default: 7 (Stellar standard). */
  decimals?: number;
  /** Set false to skip fetching. Default: true */
  enabled?: boolean;
  /** Re-fetch every N ms. 0 disables polling. Default: 0 */
  refetchInterval?: number;
  /** Cache TTL in milliseconds. Default: 30000 */
  cacheTTL?: number;
}

export interface UseTokenBalanceReturn {
  /** Raw balance in base units, or `null` until loaded. */
  balance: bigint | null;
  /** Balance as a decimal string using `decimals`, or `null` until loaded. */
  formatted: string | null;
  /** Decimals used for `formatted`. */
  decimals: number;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const parseBalance = (scVal: xdr.ScVal): bigint => {
  const native = scValToNative(scVal);
  if (typeof native === "bigint") return native;
  if (typeof native === "number" && Number.isInteger(native)) return BigInt(native);
  if (typeof native === "string" && /^-?\d+$/.test(native)) return BigInt(native);
  throw new Error("Token contract returned a non-integer balance");
};

/**
 * Read the balance of a SEP-41 compliant token (`balance(id) -> i128`) for one
 * account, with loading and error state.
 *
 * @example
 * ```tsx
 * const { balance, formatted, isLoading } = useTokenBalance({
 *   contractId: "CTOKEN...",
 *   account: publicKey,
 * });
 * ```
 */
export function useTokenBalance({
  contractId,
  account,
  decimals = DEFAULT_TOKEN_DECIMALS,
  enabled = true,
  refetchInterval = 0,
  cacheTTL,
}: UseTokenBalanceOptions): UseTokenBalanceReturn {
  const args = useMemo(
    () => (account ? [nativeToScVal(account, { type: "address" })] : []),
    [account],
  );

  const read = useSorobanRead<bigint>(contractId, "balance", args, {
    enabled: enabled && !!contractId && !!account,
    refetchInterval,
    cacheTTL,
    parseResult: parseBalance,
  });

  const balance = read.data;
  return {
    balance,
    formatted: balance === null ? null : formatTokenAmount(balance, decimals),
    decimals,
    isLoading: read.isLoading,
    isRefetching: read.isRefetching,
    error: read.error,
    refetch: read.refetch,
  };
}
