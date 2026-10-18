/**
 * @file useTokenAllowance.ts
 * @description Hook for reading the allowance a spender has over an owner's
 *   SEP-41 tokens, including the allowance's expiration ledger.
 * @package stellar-hooks
 * @license MIT
 */

import { useEffect, useMemo, useState } from "react";
import {
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk/minimal";
import * as rpc from "@stellar/stellar-sdk/rpc";
import { useStellarContext } from "../context";
import { useSorobanRead } from "./useSorobanRead";
import { DEFAULT_TOKEN_DECIMALS, formatTokenAmount } from "../utils/tokenAmount";

export interface UseTokenAllowanceOptions {
  /** SEP-41 token contract address (C...). */
  contractId: string | null | undefined;
  /** Account that granted the allowance. */
  owner: string | null | undefined;
  /** Account allowed to spend. */
  spender: string | null | undefined;
  /** Decimals used for `formatted`. Default: 7 */
  decimals?: number;
  /**
   * Also look up the expiration ledger from contract storage. Default: true.
   * SEP-41 `allowance()` only returns the amount, so this reads the
   * `Allowance` storage entry used by Stellar Asset Contracts and the Soroban
   * example token; other layouts yield `expirationLedger: null`.
   */
  includeExpiration?: boolean;
  enabled?: boolean;
  refetchInterval?: number;
  cacheTTL?: number;
}

export interface UseTokenAllowanceReturn {
  /** Remaining allowance in base units, or `null` until loaded. */
  allowance: bigint | null;
  /** Allowance as a decimal string, or `null` until loaded. */
  formatted: string | null;
  /** Ledger sequence after which the allowance is void, if it could be read. */
  expirationLedger: number | null;
  /** True when `expirationLedger` is known and already behind the latest ledger. */
  isExpired: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const parseAmount = (scVal: xdr.ScVal): bigint => {
  const native = scValToNative(scVal);
  if (typeof native === "bigint") return native;
  if (typeof native === "number" && Number.isInteger(native)) return BigInt(native);
  throw new Error("Token contract returned a non-integer allowance");
};

/** Storage key of an allowance entry: `Allowance({ from, spender })`. */
export function buildAllowanceKey(
  contractId: string,
  owner: string,
  spender: string,
): xdr.LedgerKey {
  const entry = (name: string, address: string) =>
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol(name),
      val: nativeToScVal(address, { type: "address" }),
    });
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol("Allowance"),
        xdr.ScVal.scvMap([entry("from", owner), entry("spender", spender)]),
      ]),
      durability: xdr.ContractDataDurability.temporary(),
    }),
  );
}

/**
 * Read how much of `owner`'s SEP-41 tokens `spender` may still spend and when
 * that allowance expires.
 *
 * @example
 * ```tsx
 * const { allowance, expirationLedger, isExpired } = useTokenAllowance({
 *   contractId: "CTOKEN...",
 *   owner: publicKey,
 *   spender: "CDEX...",
 * });
 * ```
 */
export function useTokenAllowance({
  contractId,
  owner,
  spender,
  decimals = DEFAULT_TOKEN_DECIMALS,
  includeExpiration = true,
  enabled = true,
  refetchInterval = 0,
  cacheTTL,
}: UseTokenAllowanceOptions): UseTokenAllowanceReturn {
  const { config } = useStellarContext();
  const ready = enabled && !!contractId && !!owner && !!spender;

  const args = useMemo(
    () =>
      owner && spender
        ? [
            nativeToScVal(owner, { type: "address" }),
            nativeToScVal(spender, { type: "address" }),
          ]
        : [],
    [owner, spender],
  );

  const read = useSorobanRead<bigint>(contractId, "allowance", args, {
    enabled: ready,
    refetchInterval,
    cacheTTL,
    parseResult: parseAmount,
  });

  const [expiration, setExpiration] = useState<{
    ledger: number | null;
    latest: number | null;
  }>({ ledger: null, latest: null });

  const amount = read.data;

  useEffect(() => {
    if (!ready || !includeExpiration || amount === null) {
      setExpiration({ ledger: null, latest: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const server = new rpc.Server(config.sorobanRpcUrl);
        const response = await server.getLedgerEntries(
          buildAllowanceKey(contractId as string, owner as string, spender as string),
        );
        const found = response.entries?.[0];
        let ledger: number | null = null;
        if (found) {
          const value = scValToNative(found.val.contractData().val()) as Record<string, unknown>;
          const raw = value?.live_until_ledger ?? value?.expiration_ledger;
          if (typeof raw === "number") ledger = raw;
        }
        if (!cancelled) setExpiration({ ledger, latest: response.latestLedger ?? null });
      } catch {
        // Expiration is best-effort; the amount above is still valid.
        if (!cancelled) setExpiration({ ledger: null, latest: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, includeExpiration, amount, contractId, owner, spender, config.sorobanRpcUrl]);

  return {
    allowance: amount,
    formatted: amount === null ? null : formatTokenAmount(amount, decimals),
    expirationLedger: expiration.ledger,
    isExpired:
      expiration.ledger !== null &&
      expiration.latest !== null &&
      expiration.ledger < expiration.latest,
    isLoading: read.isLoading,
    isRefetching: read.isRefetching,
    error: read.error,
    refetch: read.refetch,
  };
}
