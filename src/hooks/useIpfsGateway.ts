/**
 * @file useIpfsGateway.ts
 * @description Configurable IPFS gateway support for NFT metadata — lets consumers
 *   set one or more IPFS gateways, with automatic fallback to the next gateway when
 *   one is slow or unavailable.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useRef } from "react";

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Public IPFS gateways used when none are provided by the consumer. */
export const DEFAULT_IPFS_GATEWAYS: readonly string[] = [
  "https://cloudflare-ipfs.com/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseIpfsGatewayOptions {
  /**
   * Ordered list of IPFS gateway base URLs (each ending with `/ipfs/`).
   * The hook tries them in order, falling back to the next on failure.
   * Defaults to {@link DEFAULT_IPFS_GATEWAYS}.
   */
  gateways?: string[];
  /**
   * Per-gateway request timeout in milliseconds before the hook falls back
   * to the next gateway. Default: 5 000
   */
  timeoutMs?: number;
}

export interface UseIpfsGatewayReturn {
  /**
   * Resolve an IPFS URI (ipfs://CID/path) or a bare CID to a full HTTP URL
   * using the first available gateway.
   *
   * @param cidOrUri - `ipfs://<CID>/<path>` URI or a raw CID string.
   * @returns Resolved HTTP URL string.
   */
  resolveUrl: (cidOrUri: string) => string;
  /**
   * Fetch a resource from IPFS, trying each gateway in turn until one succeeds
   * or all gateways are exhausted.
   *
   * @param cidOrUri - `ipfs://<CID>/<path>` URI or a raw CID string.
   * @returns The `Response` from the first gateway that responded within the timeout.
   * @throws {Error} when all gateways fail or time out.
   */
  fetchFromIpfs: (cidOrUri: string) => Promise<Response>;
  /** The list of gateway URLs currently in use (consumer-provided or defaults). */
  gateways: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise an `ipfs://` URI or raw CID to just the `<CID>[/path]` portion.
 */
function extractCidPath(cidOrUri: string): string {
  const trimmed = cidOrUri.trim();
  if (trimmed.startsWith("ipfs://")) {
    return trimmed.slice("ipfs://".length);
  }
  return trimmed;
}

/**
 * Build a full HTTP URL for a given CID/path using the provided gateway base.
 */
function buildGatewayUrl(gatewayBase: string, cidPath: string): string {
  const base = gatewayBase.endsWith("/") ? gatewayBase : `${gatewayBase}/`;
  return `${base}${cidPath}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Provides IPFS gateway resolution with configurable fallback support.
 *
 * Consumers supply an ordered list of gateway base URLs; when fetching a
 * resource the hook tries each gateway sequentially and returns the first
 * successful response.  Gateways that do not respond within `timeoutMs` are
 * treated as failed and the next gateway is tried.
 *
 * @example
 * ```tsx
 * const { fetchFromIpfs, resolveUrl } = useIpfsGateway({
 *   gateways: [
 *     "https://my-private-gateway.com/ipfs/",
 *     "https://cloudflare-ipfs.com/ipfs/",
 *   ],
 *   timeoutMs: 3000,
 * });
 *
 * // Resolve a URI to a URL without fetching
 * const url = resolveUrl("ipfs://QmABC.../metadata.json");
 *
 * // Fetch with automatic fallback
 * const res = await fetchFromIpfs("ipfs://QmABC.../metadata.json");
 * const json = await res.json();
 * ```
 */
export function useIpfsGateway(options: UseIpfsGatewayOptions = {}): UseIpfsGatewayReturn {
  const { gateways = DEFAULT_IPFS_GATEWAYS as string[], timeoutMs = 5_000 } = options;

  // Stable ref so fetchFromIpfs doesn't need gateways/timeoutMs in its dep array
  const gatewaysRef = useRef(gateways);
  const timeoutRef = useRef(timeoutMs);
  gatewaysRef.current = gateways;
  timeoutRef.current = timeoutMs;

  const resolveUrl = useCallback((cidOrUri: string): string => {
    const cidPath = extractCidPath(cidOrUri);
    const [firstGateway] = gatewaysRef.current;
    if (!firstGateway) {
      throw new Error("useIpfsGateway: no gateways configured.");
    }
    return buildGatewayUrl(firstGateway, cidPath);
  }, []);

  const fetchFromIpfs = useCallback(async (cidOrUri: string): Promise<Response> => {
    const cidPath = extractCidPath(cidOrUri);
    const currentGateways = gatewaysRef.current;
    const timeout = timeoutRef.current;
    const errors: string[] = [];

    for (const gateway of currentGateways) {
      const url = buildGatewayUrl(gateway, cidPath);
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timerId);
        if (res.ok) {
          return res;
        }
        errors.push(`${gateway} → HTTP ${res.status}`);
      } catch (err) {
        clearTimeout(timerId);
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${gateway} → ${msg}`);
      }
    }

    throw new Error(
      `useIpfsGateway: all gateways failed for "${cidOrUri}".\n${errors.join("\n")}`,
    );
  }, []);

  return { resolveUrl, fetchFromIpfs, gateways };
}
