/**
 * @file useNftMetadata.ts
 * @description Hook that reads an NFT's token URI from the contract and fetches
 *   and validates the referenced JSON metadata, with IPFS gateway support.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
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
import { useIpfsGateway } from "./useIpfsGateway";
import type { UseIpfsGatewayOptions } from "./useIpfsGateway";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Standard NFT metadata following the ERC-721 / OpenSea metadata schema that
 * is commonly used by Soroban NFT contracts.
 */
export interface NftMetadata {
  /** Token name */
  name?: string;
  /** Token description */
  description?: string;
  /** Image URL (may be an `ipfs://` URI) */
  image?: string;
  /** External URL for further information */
  external_url?: string;
  /** Background colour (6-digit hex, no `#`) */
  background_color?: string;
  /** Animation URL */
  animation_url?: string;
  /** YouTube URL */
  youtube_url?: string;
  /** Trait array */
  attributes?: Array<{
    trait_type: string;
    value: string | number;
    display_type?: string;
  }>;
  /** Any additional fields from the raw JSON */
  [key: string]: unknown;
}

export interface UseNftMetadataOptions {
  /**
   * Soroban NFT contract address (C-prefix).
   * Required.
   */
  contractId: string;
  /**
   * Token ID to fetch metadata for.
   * Required.
   */
  tokenId: string | number;
  /**
   * Account used as the simulation source when reading the token URI.
   * Optional — a dummy account is used when omitted.
   */
  accountAddress?: string;
  /**
   * IPFS gateway configuration forwarded to `useIpfsGateway`.
   * Lets callers supply custom gateways or a timeout override.
   */
  ipfsGateway?: UseIpfsGatewayOptions;
  /** Enable automatic fetching on mount. Default: true */
  enabled?: boolean;
  /** Re-fetch interval in milliseconds. 0 = disabled. Default: 0 */
  refetchInterval?: number;
  /** Callback fired when metadata is successfully loaded. */
  onSuccess?: (metadata: NftMetadata) => void;
  /** Callback fired on any error. */
  onError?: (error: Error) => void;
}

export interface UseNftMetadataReturn {
  /** The resolved and validated JSON metadata, or `null` while loading. */
  metadata: NftMetadata | null;
  /** The raw token URI string returned by the contract. */
  tokenUri: string | null;
  /** `true` during the initial fetch. */
  isLoading: boolean;
  /** `true` during background re-fetches. */
  isRefetching: boolean;
  /** Most recent error, or `null`. */
  error: Error | null;
  /** Manually trigger a re-fetch of the token URI and metadata. */
  refetch: () => Promise<void>;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

interface State {
  metadata: NftMetadata | null;
  tokenUri: string | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
}

type Action =
  | { type: "FETCH_START"; isRefetch: boolean }
  | { type: "FETCH_SUCCESS"; metadata: NftMetadata; tokenUri: string }
  | { type: "FETCH_ERROR"; error: Error };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return {
        ...state,
        isLoading: !action.isRefetch && state.metadata === null,
        isRefetching: action.isRefetch || state.metadata !== null,
        error: null,
      };
    case "FETCH_SUCCESS":
      return {
        metadata: action.metadata,
        tokenUri: action.tokenUri,
        isLoading: false,
        isRefetching: false,
        error: null,
      };
    case "FETCH_ERROR":
      return { ...state, isLoading: false, isRefetching: false, error: action.error };
    default:
      return state;
  }
}

const DUMMY_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Read an NFT's token URI from a Soroban contract and fetch the referenced JSON
 * metadata, resolving `ipfs://` URIs via the configurable gateway system.
 *
 * The hook expects the contract to expose a `token_uri(token_id: u32)` method
 * that returns a `String` (or `Bytes`) URI.
 *
 * @example
 * ```tsx
 * const { metadata, isLoading, error } = useNftMetadata({
 *   contractId: "CABC...XYZ",
 *   tokenId: 42,
 *   ipfsGateway: {
 *     gateways: ["https://cloudflare-ipfs.com/ipfs/"],
 *   },
 * });
 *
 * if (isLoading) return <Spinner />;
 * if (error) return <p>Error: {error.message}</p>;
 * return <img src={metadata?.image} alt={metadata?.name} />;
 * ```
 */
export function useNftMetadata(options: UseNftMetadataOptions): UseNftMetadataReturn {
  const {
    contractId,
    tokenId,
    accountAddress,
    ipfsGateway,
    enabled = true,
    refetchInterval = 0,
    onSuccess,
    onError,
  } = options;

  const { config } = useStellarContext();
  const { fetchFromIpfs, resolveUrl } = useIpfsGateway(ipfsGateway);

  const [state, dispatch] = useReducer(reducer, {
    metadata: null,
    tokenUri: null,
    isLoading: false,
    isRefetching: false,
    error: null,
  });

  // Keep latest callbacks in refs to avoid stale closure issues
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const fetch = useCallback(
    async (isRefetch = false) => {
      if (!contractId || tokenId === undefined) return;

      dispatch({ type: "FETCH_START", isRefetch });

      try {
        // ── 1. Read token_uri from contract ──────────────────────────────────
        const server = new rpc.Server(config.sorobanRpcUrl);
        const contract = new Contract(contractId);
        const targetAccount = accountAddress ?? DUMMY_ACCOUNT;

        let accountObj: Account;
        try {
          accountObj = await server.getAccount(targetAccount);
        } catch {
          accountObj = new Account(targetAccount, "0");
        }

        const tx = new TransactionBuilder(accountObj, {
          fee: "100",
          networkPassphrase: config.networkPassphrase,
        })
          .addOperation(
            contract.call(
              "token_uri",
              nativeToScVal(Number(tokenId), { type: "u32" }),
            ),
          )
          .setTimeout(30)
          .build();

        const simResult = await server.simulateTransaction(tx);

        if (rpc.Api.isSimulationError(simResult)) {
          throw new Error(`token_uri simulation failed: ${simResult.error}`);
        }

        const retval = simResult.result?.retval ?? xdr.ScVal.scvVoid();
        const rawUri = scValToNative(retval);

        if (typeof rawUri !== "string" || !rawUri) {
          throw new Error(
            `useNftMetadata: contract returned an unexpected token_uri value: ${JSON.stringify(rawUri)}`,
          );
        }

        const tokenUri = rawUri.trim();

        // ── 2. Fetch the JSON metadata ────────────────────────────────────────
        let metadataRes: Response;

        if (tokenUri.startsWith("ipfs://")) {
          metadataRes = await fetchFromIpfs(tokenUri);
        } else if (tokenUri.startsWith("http://") || tokenUri.startsWith("https://")) {
          const controller = new AbortController();
          const timerId = setTimeout(() => controller.abort(), 10_000);
          try {
            metadataRes = await globalThis.fetch(tokenUri, { signal: controller.signal });
          } finally {
            clearTimeout(timerId);
          }
        } else {
          // Treat as a bare CID
          metadataRes = await fetchFromIpfs(tokenUri);
        }

        if (!metadataRes.ok) {
          throw new Error(
            `useNftMetadata: metadata fetch returned HTTP ${metadataRes.status} for URI "${tokenUri}"`,
          );
        }

        // ── 3. Parse & basic-validate JSON ────────────────────────────────────
        let rawJson: unknown;
        try {
          rawJson = await metadataRes.json();
        } catch {
          throw new Error(
            `useNftMetadata: metadata at "${tokenUri}" is not valid JSON.`,
          );
        }

        if (typeof rawJson !== "object" || rawJson === null || Array.isArray(rawJson)) {
          throw new Error(
            `useNftMetadata: metadata at "${tokenUri}" must be a JSON object.`,
          );
        }

        const metadata = rawJson as NftMetadata;

        // Resolve image IPFS URI to an HTTP URL so consumers can use it directly
        if (typeof metadata.image === "string" && metadata.image.startsWith("ipfs://")) {
          try {
            metadata.image = resolveUrl(metadata.image);
          } catch {
            // non-fatal: leave image as-is if resolution fails
          }
        }

        dispatch({ type: "FETCH_SUCCESS", metadata, tokenUri });
        onSuccessRef.current?.(metadata);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        dispatch({ type: "FETCH_ERROR", error });
        onErrorRef.current?.(error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contractId, tokenId, accountAddress, config.sorobanRpcUrl, config.networkPassphrase, fetchFromIpfs, resolveUrl],
  );

  useEffect(() => {
    if (!enabled || !contractId || tokenId === undefined) return;
    void fetch(false);
  }, [enabled, contractId, tokenId, fetch]);

  useEffect(() => {
    if (!enabled || !contractId || tokenId === undefined || refetchInterval <= 0) return;
    const id = setInterval(() => void fetch(true), refetchInterval);
    return () => clearInterval(id);
  }, [enabled, contractId, tokenId, refetchInterval, fetch]);

  return {
    metadata: state.metadata,
    tokenUri: state.tokenUri,
    isLoading: state.isLoading,
    isRefetching: state.isRefetching,
    error: state.error,
    refetch: () => fetch(true),
  };
}
