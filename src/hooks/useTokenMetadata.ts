/**
 * @file useTokenMetadata.ts
 * @description Hook that reads a SEP-41 token's name, symbol and decimals together.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Account,
  Contract,
  TransactionBuilder,
  scValToNative,
} from "@stellar/stellar-sdk/minimal";
import * as rpc from "@stellar/stellar-sdk/rpc";
import { useStellarContext } from "../context";
import { getCache, setCache } from "../utils";

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

export interface UseTokenMetadataOptions {
  /** SEP-41 token contract address (C...). */
  contractId: string | null | undefined;
  /** Set false to skip fetching. Default: true */
  enabled?: boolean;
  /**
   * Cache lifetime in ms. Token metadata does not change, so the default is
   * 24 hours; set lower if you track upgradeable tokens.
   */
  cacheTTL?: number;
}

export interface UseTokenMetadataReturn {
  metadata: TokenMetadata | null;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  isLoading: boolean;
  error: Error | null;
  /** Re-fetch, bypassing the cache. */
  refetch: () => Promise<void>;
}

const DUMMY_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const DAY_MS = 24 * 60 * 60 * 1000;

async function readMethod(
  server: rpc.Server,
  passphrase: string,
  contractId: string,
  method: "name" | "symbol" | "decimals",
): Promise<unknown> {
  // One Account per transaction: building increments the sequence number.
  const tx = new TransactionBuilder(new Account(DUMMY_ACCOUNT, "0"), {
    fee: "100",
    networkPassphrase: passphrase,
  })
    .addOperation(new Contract(contractId).call(method))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Token ${method}() simulation failed: ${sim.error}`);
  }
  if (!sim.result) throw new Error(`Token ${method}() returned no result`);
  return scValToNative(sim.result.retval);
}

/**
 * Read a SEP-41 token's `name`, `symbol` and `decimals`.
 *
 * Soroban transactions carry a single contract invocation, so the three reads
 * cannot share one simulation. They are issued concurrently from one hook call
 * and cached together per contract, so each token costs three RPC requests
 * once, in parallel, instead of one render-blocking request per field.
 *
 * @example
 * ```tsx
 * const { name, symbol, decimals, isLoading } = useTokenMetadata({ contractId: "CTOKEN..." });
 * ```
 */
export function useTokenMetadata({
  contractId,
  enabled = true,
  cacheTTL = DAY_MS,
}: UseTokenMetadataOptions): UseTokenMetadataReturn {
  const { config } = useStellarContext();
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);

  const load = useCallback(
    async (bypassCache: boolean) => {
      if (!contractId) return;
      const gen = ++generation.current;
      const cacheKey = `token-metadata-${contractId}-${config.network}`;

      if (!bypassCache) {
        const cached = getCache<TokenMetadata>(cacheKey);
        if (cached) {
          setMetadata(cached);
          setError(null);
          return;
        }
      }

      setIsLoading(true);
      setError(null);
      try {
        const server = new rpc.Server(config.sorobanRpcUrl);
        const [name, symbol, decimals] = await Promise.all([
          readMethod(server, config.networkPassphrase, contractId, "name"),
          readMethod(server, config.networkPassphrase, contractId, "symbol"),
          readMethod(server, config.networkPassphrase, contractId, "decimals"),
        ]);
        if (typeof name !== "string" || typeof symbol !== "string" || typeof decimals !== "number") {
          throw new Error("Contract does not look like a SEP-41 token (unexpected name/symbol/decimals types)");
        }
        const result: TokenMetadata = { name, symbol, decimals };
        setCache(cacheKey, result, cacheTTL);
        if (gen !== generation.current) return;
        setMetadata(result);
      } catch (err) {
        if (gen !== generation.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (gen === generation.current) setIsLoading(false);
      }
    },
    [contractId, config.network, config.sorobanRpcUrl, config.networkPassphrase, cacheTTL],
  );

  useEffect(() => {
    if (!enabled || !contractId) return;
    void load(false);
    return () => {
      // Invalidate any in-flight load; this is a counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [enabled, contractId, load]);

  const refetch = useCallback(() => load(true), [load]);

  return {
    metadata,
    name: metadata?.name ?? null,
    symbol: metadata?.symbol ?? null,
    decimals: metadata?.decimals ?? null,
    isLoading,
    error,
    refetch,
  };
}
