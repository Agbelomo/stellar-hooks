/**
 * @file index.ts
 * @description Main entry point for `@stellar-hooks/core`.
 *
 * This package contains the framework-agnostic building blocks of
 * stellar-hooks: network presets, RPC helpers, XDR utilities, and error
 * classes. It has zero React dependency and can be consumed from Node.js,
 * Vue, Svelte, or any other JavaScript environment.
 *
 * React hooks live in the `stellar-hooks` package, which depends on this one.
 *
 * @package @stellar-hooks/core
 * @license MIT
 */

// ─── Network ──────────────────────────────────────────────────────────────────
export {
  NETWORK_CONFIGS,
  resolveNetworkConfig,
} from "./network";

export type {
  StellarNetwork,
  NetworkConfig,
  CustomNetworkConfig,
  PresetNetworkConfig,
} from "./network";

// ─── RPC & account helpers ────────────────────────────────────────────────────
export {
  parseAccountResponse,
  parseBalance,
  sleep,
  backoff,
  getHorizonUrl,
  getSorobanRpcUrl,
  fetchAccount,
  fetchSorobanTokenBalance,
} from "./rpc";

export type { StellarAccountData, StellarBalance } from "./rpc";

// ─── XDR helpers ──────────────────────────────────────────────────────────────
export { decodeXdr, formatXdrResult, detectXdrType } from "./xdr";
export type { XdrDecodeResult, XdrType } from "./xdr";

// ─── Errors ───────────────────────────────────────────────────────────────────
export {
  ErrorCode,
  StellarHookError,
  UserRejectedError,
  WalletNotInstalledError,
  WalletNotConnectedError,
  FreighterNotInstalledError,
  NetworkError,
  SimulationError,
  TransactionFailedError,
  TransactionTimeoutError,
  isUserRejectionMessage,
} from "./errors";

export type { ErrorCodeType } from "./errors";
