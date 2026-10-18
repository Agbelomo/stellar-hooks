/**
 * @file useAnchorQuote.ts
 * @description Hook for SEP-38 indicative prices and firm quotes from an anchor.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useState } from "react";
import {
  parseSep38Price,
  parseSep38Quote,
  sep38Request,
  toSep38Body,
  toSep38Query,
  validateSep38Params,
  type Sep38FirmQuoteParams,
  type Sep38Price,
  type Sep38Quote,
  type Sep38RequestParams,
} from "../utils/sep38";

export type {
  Sep38Context,
  Sep38Fee,
  Sep38FirmQuoteParams,
  Sep38Price,
  Sep38Quote,
  Sep38RequestParams,
} from "../utils/sep38";

export interface UseAnchorQuoteOptions {
  /** Anchor's `ANCHOR_QUOTE_SERVER` URL from its stellar.toml (see `useAnchorInfo`). */
  quoteServer: string | null | undefined;
  /** SEP-10 JWT. Required for firm quotes; optional for indicative prices. */
  jwt?: string | null;
}

export interface UseAnchorQuoteReturn {
  /** Request an indicative price (`GET /price`). No commitment from the anchor. */
  getPrice: (params: Sep38RequestParams) => Promise<Sep38Price>;
  /** Request a firm quote (`POST /quote`). Needs `jwt`; valid until `expiresAt`. */
  getQuote: (params: Sep38FirmQuoteParams) => Promise<Sep38Quote>;
  /** Latest indicative price, or `null`. */
  price: Sep38Price | null;
  /** Latest firm quote, or `null`. */
  quote: Sep38Quote | null;
  /** True once the latest firm quote's `expiresAt` has passed. */
  isExpired: boolean;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

const join = (base: string, path: string) => `${base.replace(/\/+$/, "")}${path}`;

/**
 * Request SEP-38 indicative prices and firm quotes for asset conversions from
 * an anchor that advertises an `ANCHOR_QUOTE_SERVER`.
 *
 * @example
 * ```tsx
 * const { quoteServer } = useAnchorInfo({ domain: "testanchor.stellar.org" });
 * const { getPrice, getQuote, quote, isExpired } = useAnchorQuote({ quoteServer, jwt });
 *
 * await getPrice({
 *   sellAsset: "iso4217:USD",
 *   buyAsset: "stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
 *   sellAmount: "100",
 *   context: "sep6",
 * });
 * ```
 */
export function useAnchorQuote({ quoteServer, jwt }: UseAnchorQuoteOptions): UseAnchorQuoteReturn {
  const [price, setPrice] = useState<Sep38Price | null>(null);
  const [quote, setQuote] = useState<Sep38Quote | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Flip `isExpired` when the firm quote runs out, without polling.
  useEffect(() => {
    if (!quote) {
      setIsExpired(false);
      return;
    }
    const remaining = quote.expiresAt.getTime() - Date.now();
    if (remaining <= 0) {
      setIsExpired(true);
      return;
    }
    setIsExpired(false);
    const timer = setTimeout(() => setIsExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [quote]);

  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      return await work();
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      throw wrapped;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getPrice = useCallback(
    (params: Sep38RequestParams) =>
      run(async () => {
        if (!quoteServer) throw new Error("quoteServer is required");
        validateSep38Params(params);
        const raw = await sep38Request(`${join(quoteServer, "/price")}?${toSep38Query(params)}`, { method: "GET" }, jwt);
        const result = parseSep38Price(raw);
        setPrice(result);
        return result;
      }),
    [quoteServer, jwt, run],
  );

  const getQuote = useCallback(
    (params: Sep38FirmQuoteParams) =>
      run(async () => {
        if (!quoteServer) throw new Error("quoteServer is required");
        if (!jwt) throw new Error("jwt is required to request a firm quote");
        validateSep38Params(params);
        const raw = await sep38Request(
          join(quoteServer, "/quote"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toSep38Body(params)),
          },
          jwt,
        );
        const result = parseSep38Quote(raw);
        setQuote(result);
        return result;
      }),
    [quoteServer, jwt, run],
  );

  const reset = useCallback(() => {
    setPrice(null);
    setQuote(null);
    setError(null);
  }, []);

  return { getPrice, getQuote, price, quote, isExpired, isLoading, error, reset };
}
