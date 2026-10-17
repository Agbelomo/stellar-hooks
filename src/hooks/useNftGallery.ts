/**
 * @file useNftGallery.ts
 * @description Hook that lists the connected account's NFTs by scanning its
 *   non-native trustlines for assets with a supply of 1 and a limit of 1
 *   (the standard Stellar NFT pattern), then enriches each one with metadata
 *   from the issuer's stellar.toml.
 *
 *   The hook composes existing library primitives:
 *   - `useStellarAccount` — to fetch account balances / trustlines
 *   - `useStellarToml`    — to pull asset metadata per issuer domain
 *   - `useStellarQuery`   — for the outer Horizon fetch so caching / polling
 *                           semantics are consistent with the rest of the library
 *
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useMemo } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { useStellarQuery } from "./useStellarQuery";
import { getHorizonServer } from "../utils/memoizedServers";
import { useStellarContext } from "../context";

// ─── Public types ─────────────────────────────────────────────────────────────

/** A single NFT entry enriched with on-chain and off-chain metadata. */
export interface NftItem {
  /** Asset code, e.g. "MYNFT001". */
  code: string;
  /** Issuer's Stellar public key (G…). */
  issuer: string;
  /**
   * Image URL resolved from the issuer's stellar.toml `CURRENCIES[].image`
   * field. `null` when the issuer has no toml or the asset has no image.
   */
  imageUrl: string | null;
  /**
   * Human-readable name from `CURRENCIES[].name`.
   * Falls back to `CURRENCIES[].code` then `asset.code`.
   */
  name: string;
  /** Raw `desc` field from stellar.toml, if present. */
  description: string | null;
  /**
   * Any additional key/value pairs the issuer included in their
   * stellar.toml CURRENCIES entry.
   */
  extra: Record<string, unknown>;
}

export interface UseNftGalleryOptions {
  /**
   * Set to `false` to pause fetching without unmounting the component.
   * @default true
   */
  enabled?: boolean;
  /**
   * Polling interval in milliseconds. `0` disables polling.
   * @default 0
   */
  refetchInterval?: number;
  /**
   * When `true`, only assets whose balance equals `"1.0000000"` and whose
   * trustline limit equals `"1.0000000"` are treated as NFTs. Set to `false`
   * to include all non-native trustlines (useful for SFTs or testing).
   * @default true
   */
  strictNftFilter?: boolean;
}

export interface UseNftGalleryReturn {
  /** NFT items discovered in the account, enriched with metadata. */
  nfts: NftItem[];
  /** `true` during the initial Horizon fetch. */
  isLoading: boolean;
  /** `true` while re-fetching (polling or manual refetch). */
  isRefetching: boolean;
  /** Any error that occurred during the fetch. */
  error: Error | null;
  /** Timestamp of the most recent successful fetch. */
  lastFetchedAt: Date | null;
  /** Manually trigger a re-fetch. */
  refetch: () => Promise<void>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface TomlCurrency {
  code?: string;
  issuer?: string;
  name?: string;
  desc?: string;
  image?: string;
  [key: string]: unknown;
}

interface TomlDoc {
  CURRENCIES?: TomlCurrency[];
  [key: string]: unknown;
}

/** Simple stellar.toml fetcher — parses CURRENCIES block only. */
async function fetchToml(domain: string): Promise<TomlDoc> {
  const url = `https://${domain}/.well-known/stellar.toml`;
  const res = await fetch(url, { signal: AbortSignal.timeout?.(5000) });
  if (!res.ok) return {};
  const text = await res.text();

  const doc: TomlDoc = {};
  // Extract CURRENCIES array with a small hand-rolled parser so we avoid
  // pulling in a TOML library.  We only need `code`, `issuer`, `name`,
  // `desc`, and `image`.
  const currenciesMatch = text.match(/\[\[CURRENCIES\]\]([\s\S]*?)(?=\[\[|$)/g);
  if (currenciesMatch) {
    doc.CURRENCIES = currenciesMatch.map((block) => {
      const entry: TomlCurrency = {};
      const kvRe = /^\s*(\w+)\s*=\s*"([^"]*)"\s*$/gm;
      let m: RegExpExecArray | null;
      while ((m = kvRe.exec(block)) !== null) {
        const [, key, val] = m;
        if (key && val !== undefined) entry[key] = val;
      }
      return entry;
    });
  }
  return doc;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Lists NFTs owned by a Stellar account, resolved from the account's trustlines.
 *
 * An asset is treated as an NFT when its balance **and** trustline limit are
 * both `"1.0000000"` (the Stellar NFT convention). For each qualifying asset,
 * the hook fetches the issuer account's `home_domain` from Horizon, then reads
 * the issuer's `stellar.toml` to get image, name, and description metadata.
 *
 * @param publicKey - Stellar account address to inspect. Pass `null` / `undefined`
 *   to suspend fetching (e.g., while the wallet is not yet connected).
 * @param options - Optional configuration.
 *
 * @example
 * ```tsx
 * const { nfts, isLoading } = useNftGallery(publicKey);
 *
 * if (isLoading) return <p>Loading NFTs…</p>;
 *
 * return (
 *   <ul>
 *     {nfts.map((nft) => (
 *       <li key={`${nft.issuer}-${nft.code}`}>
 *         {nft.imageUrl && <img src={nft.imageUrl} alt={nft.name} />}
 *         <span>{nft.name}</span>
 *       </li>
 *     ))}
 *   </ul>
 * );
 * ```
 */
export function useNftGallery(
  publicKey: string | null | undefined,
  options: UseNftGalleryOptions = {},
): UseNftGalleryReturn {
  const { enabled = true, refetchInterval = 0, strictNftFilter = true } = options;
  const { config } = useStellarContext();

  const fetcher = useCallback(
    async (_signal?: AbortSignal): Promise<NftItem[] | null> => {
      if (!publicKey) return null;

      const server = getHorizonServer(config.horizonUrl);
      const account = await server.loadAccount(publicKey);

      // Filter trustlines that look like NFTs
      const nftLines = account.balances.filter(
        (b: Horizon.HorizonApi.BalanceLine) => {
          if (b.asset_type === "native") return false;
          const line = b as Horizon.HorizonApi.BalanceLineAsset;
          if (!strictNftFilter) return true;
          return (
            line.balance === "1.0000000" &&
            line.limit === "1.0000000"
          );
        },
      ) as Horizon.HorizonApi.BalanceLineAsset[];

      if (nftLines.length === 0) return [];

      // Collect unique issuers so we only fetch each toml once
      const issuerSet = new Set(nftLines.map((l) => l.asset_issuer));
      const domainMap = new Map<string, string>(); // issuer → home_domain
      const tomlMap = new Map<string, TomlDoc>();  // issuer → toml doc

      await Promise.allSettled(
        Array.from(issuerSet).map(async (issuer) => {
          try {
            const issuerAccount = await server.loadAccount(issuer);
            const domain: string | undefined = (issuerAccount as unknown as { home_domain?: string }).home_domain;
            if (!domain) return;
            domainMap.set(issuer, domain);
            const toml = await fetchToml(domain);
            tomlMap.set(issuer, toml);
          } catch {
            // Silently skip issuers that can't be fetched
          }
        }),
      );

      // Build NftItem list
      const items: NftItem[] = nftLines.map((line) => {
        const toml = tomlMap.get(line.asset_issuer) ?? {};
        const currency = toml.CURRENCIES?.find(
          (c) => c.code === line.asset_code && c.issuer === line.asset_issuer,
        );

        const { code: _code, issuer: _issuer, name: _name, desc: _desc, image: _image, ...rest } =
          (currency as TomlCurrency & Record<string, unknown>) ?? {};

        return {
          code: line.asset_code,
          issuer: line.asset_issuer,
          imageUrl: (currency?.image as string | undefined) ?? null,
          name:
            (currency?.name as string | undefined) ??
            (currency?.code as string | undefined) ??
            line.asset_code,
          description: (currency?.desc as string | undefined) ?? null,
          extra: rest,
        };
      });

      return items;
    },
    [publicKey, config.horizonUrl, strictNftFilter],
  );

  const queryResult = useStellarQuery<NftItem[]>(fetcher, {
    enabled: enabled && Boolean(publicKey),
    refetchInterval,
    debugLabel: "useNftGallery",
    initialData: [],
  });

  return useMemo(
    () => ({
      nfts: queryResult.data ?? [],
      isLoading: queryResult.isLoading,
      isRefetching: queryResult.isRefetching,
      error: queryResult.error,
      lastFetchedAt: queryResult.lastFetchedAt,
      refetch: queryResult.refetch,
    }),
    [
      queryResult.data,
      queryResult.isLoading,
      queryResult.isRefetching,
      queryResult.error,
      queryResult.lastFetchedAt,
      queryResult.refetch,
    ],
  );
}
