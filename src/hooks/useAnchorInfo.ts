/**
 * @file useAnchorInfo.ts
 * @description Hook for SEP-1 anchor discovery via an anchor's stellar.toml.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getCache, setCache } from "../utils";
import { parseStellarToml } from "../utils/parseStellarToml";
import type { StellarTomlCurrency, StellarTomlData } from "./useStellarToml";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseAnchorInfoOptions {
  /** Anchor home domain, e.g. `"testanchor.stellar.org"`. Fetching is disabled while falsy. */
  domain: string | null | undefined;
  /** Cache time-to-live in milliseconds. Defaults to `300000` (5 minutes). */
  cacheTTL?: number;
  /** Fetch over plain HTTP instead of HTTPS (local development only). Defaults to `false`. */
  allowHttp?: boolean;
  /** Request timeout in milliseconds. Defaults to `10000`. */
  timeout?: number;
}

export interface UseAnchorInfoReturn {
  /** Full parsed stellar.toml */
  info: StellarTomlData | null;
  /** `TRANSFER_SERVER_SEP0024` — SEP-24 interactive deposit/withdrawal server */
  transferServer: string | null;
  /** `TRANSFER_SERVER` — SEP-6 programmatic deposit/withdrawal server */
  transferServerSep6: string | null;
  /** `WEB_AUTH_ENDPOINT` — SEP-10 authentication endpoint */
  webAuthEndpoint: string | null;
  /** `KYC_SERVER` — SEP-12 KYC server */
  kycServer: string | null;
  /** `SIGNING_KEY` — key the anchor signs SEP-10 challenges with */
  signingKey: string | null;
  /** `[[CURRENCIES]]` entries — always an array */
  currencies: StellarTomlCurrency[];
  /** True while the stellar.toml is being fetched */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Re-fetch, bypassing the cache */
  refetch: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build the SEP-1 discovery URL for a home domain. */
export function stellarTomlUrl(domain: string, allowHttp = false): string {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `${allowHttp ? "http" : "https"}://${host}/.well-known/stellar.toml`;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Discovers an anchor's capabilities from its SEP-1 `stellar.toml`
 * (`https://{domain}/.well-known/stellar.toml`), exposing the SEP-24 transfer
 * server, SEP-10 auth endpoint, SEP-12 KYC server, and supported currencies.
 *
 * Results are cached per domain for `cacheTTL` milliseconds.
 *
 * @example
 * ```tsx
 * const { transferServer, webAuthEndpoint, currencies, isLoading } = useAnchorInfo({
 *   domain: "testanchor.stellar.org",
 * });
 * ```
 */
export function useAnchorInfo({
  domain,
  cacheTTL = 300_000,
  allowHttp = false,
  timeout = 10_000,
}: UseAnchorInfoOptions): UseAnchorInfoReturn {
  const [info, setInfo] = useState<StellarTomlData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (force: boolean): Promise<void> => {
      if (!domain) return;
      const url = stellarTomlUrl(domain, allowHttp);
      const cacheKey = `anchor-info-${url}`;

      if (!force) {
        const cached = getCache<StellarTomlData>(cacheKey);
        if (cached) {
          setInfo(cached);
          setError(null);
          return;
        }
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), timeout);

      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Failed to fetch ${url} (${res.status}): ${res.statusText}`);
        }
        const parsed = parseStellarToml(await res.text()) as StellarTomlData;
        if (abortRef.current !== controller) return;
        setCache(cacheKey, parsed, cacheTTL);
        setInfo(parsed);
      } catch (err) {
        if (abortRef.current !== controller) return;
        const isTimeout = err instanceof Error && err.name === "AbortError";
        setError(
          isTimeout
            ? new Error(`Timed out fetching ${url}`)
            : err instanceof Error
              ? err
              : new Error(String(err))
        );
      } finally {
        clearTimeout(timer);
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [domain, allowHttp, cacheTTL, timeout]
  );

  useEffect(() => {
    setInfo(null);
    setError(null);
    void load(false);
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  return {
    info,
    transferServer: asString(info?.TRANSFER_SERVER_SEP0024),
    transferServerSep6: asString(info?.TRANSFER_SERVER),
    webAuthEndpoint: asString(info?.WEB_AUTH_ENDPOINT),
    kycServer: asString(info?.KYC_SERVER),
    signingKey: asString(info?.SIGNING_KEY),
    currencies: Array.isArray(info?.CURRENCIES) ? info.CURRENCIES : [],
    isLoading,
    error,
    refetch,
  };
}
