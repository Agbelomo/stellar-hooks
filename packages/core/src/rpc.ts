/**
 * @file rpc.ts
 * @description Framework-agnostic Stellar / Soroban RPC helpers.
 *
 * These helpers wrap common Horizon and Soroban RPC operations in a way that
 * can be used from any JavaScript environment — Node.js CLI tools, Vue/Svelte
 * apps, or React hooks. They have zero dependency on React or browser APIs.
 *
 * @package @stellar-hooks/core
 * @license MIT
 */

import type { Horizon } from "@stellar/stellar-sdk";
import type { NetworkConfig } from "./network";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The canonical account data shape used throughout stellar-hooks.
 * Derived from a Horizon `AccountResponse` via {@link parseAccountResponse}.
 */
export interface StellarAccountData {
  accountId: string;
  sequence: string;
  subentryCount: number;
  numSponsored: number;
  numSponsoring: number;
  thresholds: {
    lowThreshold: number;
    medThreshold: number;
    highThreshold: number;
  };
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
    authClawbackEnabled: boolean;
  };
  balances: StellarBalance[];
  /** The raw Horizon response — use for fields not yet surfaced by the library. */
  raw: Horizon.AccountResponse;
}

/** A single balance entry from a Stellar account. */
export interface StellarBalance {
  assetType: string;
  assetCode?: string;
  assetIssuer?: string;
  balance: string;
  /** Numeric representation computed via {@link parseBalance}. */
  balanceFloat: number;
  buyingLiabilities: string;
  sellingLiabilities: string;
  limit?: string;
  isNative: boolean;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * Transforms a raw Horizon `AccountResponse` into the library's internal
 * `StellarAccountData` format.
 *
 * This is the canonical account-data parser that all hooks and any future
 * framework bindings should use so the shape stays consistent.
 */
export function parseAccountResponse(raw: Horizon.AccountResponse): StellarAccountData {
  return {
    accountId: raw.account_id,
    sequence: raw.sequence,
    subentryCount: raw.subentry_count,
    numSponsored: (raw as Horizon.AccountResponse & { num_sponsored?: number }).num_sponsored ?? 0,
    numSponsoring: (raw as Horizon.AccountResponse & { num_sponsoring?: number }).num_sponsoring ?? 0,
    thresholds: {
      lowThreshold: raw.thresholds.low_threshold,
      medThreshold: raw.thresholds.med_threshold,
      highThreshold: raw.thresholds.high_threshold,
    },
    flags: {
      authRequired: raw.flags.auth_required,
      authRevocable: raw.flags.auth_revocable,
      authImmutable: raw.flags.auth_immutable,
      authClawbackEnabled: raw.flags.auth_clawback_enabled,
    },
    balances: raw.balances
      .filter((b) => b.asset_type !== "liquidity_pool_shares")
      .map((b) => {
        const isAsset =
          b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12";
        return {
          assetType: b.asset_type,
          ...(isAsset && {
            assetCode: (b as Horizon.HorizonApi.BalanceLineAsset).asset_code,
          }),
          ...(isAsset && {
            assetIssuer: (b as Horizon.HorizonApi.BalanceLineAsset).asset_issuer,
          }),
          balance: b.balance,
          balanceFloat: parseBalance(b.balance),
          buyingLiabilities:
            isAsset || b.asset_type === "native"
              ? (
                  b as
                    | Horizon.HorizonApi.BalanceLineAsset
                    | Horizon.HorizonApi.BalanceLineNative
                ).buying_liabilities
              : "0",
          sellingLiabilities:
            isAsset || b.asset_type === "native"
              ? (
                  b as
                    | Horizon.HorizonApi.BalanceLineAsset
                    | Horizon.HorizonApi.BalanceLineNative
                ).selling_liabilities
              : "0",
          ...(isAsset && { limit: (b as Horizon.HorizonApi.BalanceLineAsset).limit }),
          isNative: b.asset_type === "native",
        };
      }),
    raw,
  };
}

/**
 * Converts a Stellar balance string (7 decimal places) to a number without
 * floating-point precision errors.
 *
 * Uses fixed-point arithmetic internally (BigInt) to avoid rounding issues
 * inherent to IEEE-754 with 7-decimal-place values.
 *
 * @param balanceStr - Balance string, e.g. `"100.1234567"`
 */
export function parseBalance(balanceStr: string): number {
  const trimmed = balanceStr.trim();
  const parts = trimmed.split(".");
  if (parts.length === 1) {
    return parseInt(parts[0] ?? "0", 10);
  }
  const [wholeStr, fractionStr] = parts;
  const paddedFraction = (fractionStr ?? "").padEnd(7, "0").slice(0, 7);
  const wholeValue = BigInt(wholeStr ?? "0");
  const fractionValue = BigInt(paddedFraction);
  const stroops = wholeValue * BigInt(10_000_000) + fractionValue;
  return Number(stroops) / 10_000_000;
}

// ─── Polling utilities ────────────────────────────────────────────────────────

/** Pauses execution for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential back-off delay for RPC polling retries.
 *
 * @param attempt - Zero-based attempt index.
 * @param base - Base delay in milliseconds (default: 1000).
 * @returns Capped delay in milliseconds (max: 10 000).
 */
export function backoff(attempt: number, base = 1000): number {
  return Math.min(base * Math.pow(2, attempt), 10_000);
}

// ─── Network utilities ────────────────────────────────────────────────────────

/**
 * Returns the Horizon `Server` base URL for the given network config.
 * This is a thin helper so consumers don't have to read `config.horizonUrl`
 * directly — useful for mocking in tests.
 */
export function getHorizonUrl(config: NetworkConfig): string {
  return config.horizonUrl;
}

/**
 * Returns the Soroban RPC endpoint URL for the given network config.
 */
export function getSorobanRpcUrl(config: NetworkConfig): string {
  return config.sorobanRpcUrl;
}

// ─── Framework-agnostic RPC fetchers ──────────────────────────────────────────

/**
 * Fetches and parses an account from Horizon using the given Horizon URL.
 *
 * @param horizonUrl - Base URL of the Horizon server
 * @param publicKey - Account public key (G...)
 */
export async function fetchAccount(
  horizonUrl: string,
  publicKey: string
): Promise<StellarAccountData> {
  const HorizonModule = await import("@stellar/stellar-sdk").then((m) => m.Horizon);
  const server = new HorizonModule.Server(horizonUrl);
  const raw = await server.loadAccount(publicKey);
  return parseAccountResponse(raw);
}

/**
 * Fetches SAC token balance via Soroban RPC simulation without signing.
 *
 * @param sorobanRpcUrl - RPC URL for Soroban
 * @param networkPassphrase - Network passphrase
 * @param contractId - Token/SAC contract address (C...)
 * @param accountAddress - Account address (G...)
 */
export async function fetchSorobanTokenBalance(
  sorobanRpcUrl: string,
  networkPassphrase: string,
  contractId: string,
  accountAddress: string
): Promise<bigint> {
  const sdk = await import("@stellar/stellar-sdk");
  const server = new sdk.rpc.Server(sorobanRpcUrl);
  const contract = new sdk.Contract(contractId);
  const operation = contract.call(
    "balance",
    new sdk.Address(accountAddress).toScVal()
  );

  const DUMMY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  let account: InstanceType<typeof sdk.Account>;
  try {
    account = await server.getAccount(accountAddress);
  } catch {
    account = new sdk.Account(DUMMY, "0");
  }

  const tx = new sdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (sdk.rpc.Api.isSimulationError(simResult)) {
    throw new Error(simResult.error);
  }
  if (!sdk.rpc.Api.isSimulationSuccess(simResult) || !simResult.result) {
    throw new Error("Simulation did not return a result");
  }

  return sdk.scValToNative(simResult.result.retval) as bigint;
}
