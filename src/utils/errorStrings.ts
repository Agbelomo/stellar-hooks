/**
 * @file errorStrings.ts
 * @description Translatable user-facing error strings module for internationalization (i18n).
 * @package stellar-hooks
 * @license MIT
 */

import type { ErrorCode } from "./errors";

export interface ErrorStrings {
  // Wallet errors
  walletNotConnected: string;
  walletNotInstalled: string;
  freighterNotInstalled: string;
  userRejected: string;
  walletConnectionFailed: string;
  walletSignFailed: string;

  // Transaction / Execution errors
  transactionFailed: string;
  transactionTimeout: string;
  simulationError: string;
  simulationFailed: string;
  txSubmitFailed: string;
  sequenceMismatch: string;
  insufficientBalance: string;
  feeTooLow: string;

  // Network / RPC errors
  networkError: string;
  rpcError: string;
  accountNotFound: string;
  contractNotFound: string;
  entryNotFound: string;
  resourceNotFound: string;

  // Validation / Configuration errors
  validationError: string;
  invalidPublicKey: string;
  invalidContractId: string;
  invalidParameters: string;
  invalidNetwork: string;
  unsupportedOperation: string;

  // General / Fallback
  unknownError: string;
}

export type ErrorStringKey = keyof ErrorStrings;

/**
 * Default English error strings.
 */
export const DEFAULT_ERROR_STRINGS: Readonly<ErrorStrings> = Object.freeze({
  // Wallet errors
  walletNotConnected: "Wallet is not connected. Call connect() first.",
  walletNotInstalled: "Wallet extension is not installed or not reachable.",
  freighterNotInstalled: "Freighter is not installed or not reachable in this environment.",
  userRejected: "User rejected the transaction or signature request.",
  walletConnectionFailed: "Failed to connect to wallet.",
  walletSignFailed: "Failed to sign transaction.",

  // Transaction / Execution errors
  transactionFailed: "Transaction failed on-chain.",
  transactionTimeout: "Transaction confirmation timed out.",
  simulationError: "Soroban transaction simulation failed.",
  simulationFailed: "Soroban transaction simulation failed.",
  txSubmitFailed: "Failed to submit transaction to the Stellar network.",
  sequenceMismatch: "Transaction sequence number does not match account sequence.",
  insufficientBalance: "Account has insufficient balance for transaction.",
  feeTooLow: "Transaction fee is too low.",

  // Network / RPC errors
  networkError: "A network error occurred while communicating with the Stellar network.",
  rpcError: "An RPC error occurred while querying the network.",
  accountNotFound: "Account was not found on the Stellar network.",
  contractNotFound: "Soroban contract was not found.",
  entryNotFound: "Ledger entry was not found.",
  resourceNotFound: "Requested resource was not found.",

  // Validation / Configuration errors
  validationError: "Validation error occurred.",
  invalidPublicKey: 'Invalid {label}: "{value}" is not a valid Stellar public key (G...).',
  invalidContractId: 'Invalid {label}: "{value}" is not a valid Stellar contract ID (C...).',
  invalidParameters: "Invalid parameters provided.",
  invalidNetwork: "Invalid Stellar network configuration.",
  unsupportedOperation: "The requested operation is not supported.",

  // General / Fallback
  unknownError: "An unknown error occurred",
});

/**
 * Mapping between ErrorCode enums/strings and ErrorStrings keys.
 */
const ERROR_CODE_TO_STRING_KEY: Record<string, ErrorStringKey> = {
  WALLET_NOT_CONNECTED: "walletNotConnected",
  WALLET_NOT_INSTALLED: "walletNotInstalled",
  FREIGHTER_NOT_INSTALLED: "freighterNotInstalled",
  USER_REJECTED: "userRejected",
  WALLET_CONNECTION_FAILED: "walletConnectionFailed",
  WALLET_SIGN_FAILED: "walletSignFailed",

  TRANSACTION_FAILED: "transactionFailed",
  TRANSACTION_TIMEOUT: "transactionTimeout",
  SIMULATION_ERROR: "simulationError",
  SIMULATION_FAILED: "simulationFailed",
  TX_SUBMIT_FAILED: "txSubmitFailed",
  SEQUENCE_MISMATCH: "sequenceMismatch",
  INSUFFICIENT_BALANCE: "insufficientBalance",
  FEE_TOO_LOW: "feeTooLow",

  NETWORK_ERROR: "networkError",
  RPC_ERROR: "rpcError",
  ACCOUNT_NOT_FOUND: "accountNotFound",
  CONTRACT_NOT_FOUND: "contractNotFound",
  ENTRY_NOT_FOUND: "entryNotFound",
  RESOURCE_NOT_FOUND: "resourceNotFound",

  VALIDATION_ERROR: "validationError",
  INVALID_PUBLIC_KEY: "invalidPublicKey",
  INVALID_CONTRACT_ID: "invalidContractId",
  INVALID_PARAMETERS: "invalidParameters",
  INVALID_NETWORK: "invalidNetwork",
  UNSUPPORTED_OPERATION: "unsupportedOperation",

  UNKNOWN_ERROR: "unknownError",
};

/**
 * Active translatable error strings dictionary.
 */
let currentErrorStrings: ErrorStrings = { ...DEFAULT_ERROR_STRINGS };

/**
 * Interpolates `{param}` placeholders inside a message template with values from params.
 *
 * @param template - String template containing `{placeholder}` tokens.
 * @param params - Key-value map of parameter values.
 * @returns Formatted string with placeholders replaced.
 */
export function formatErrorTemplate(
  template: string,
  params?: Record<string, unknown>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in params ? String(params[key]) : match;
  });
}

/**
 * Retrieves a translatable error string by its string key or ErrorCode.
 *
 * @param keyOrCode - ErrorStringKey (e.g. "walletNotConnected") or ErrorCode enum value.
 * @param params - Optional parameter map for placeholder replacement (e.g. `{ label: "publicKey", value: "invalid" }`).
 * @returns The resolved (and interpolated) error string.
 *
 * @example
 * ```ts
 * getErrorString("walletNotConnected");
 * // => "Wallet is not connected. Call connect() first."
 *
 * getErrorString(ErrorCode.WALLET_NOT_CONNECTED);
 * // => "Wallet is not connected. Call connect() first."
 *
 * getErrorString("invalidPublicKey", { label: "destination", value: "ABC" });
 * // => 'Invalid destination: "ABC" is not a valid Stellar public key (G...).'
 * ```
 */
export function getErrorString(
  keyOrCode: ErrorStringKey | ErrorCode | string,
  params?: Record<string, unknown>
): string {
  const resolvedKey: ErrorStringKey =
    keyOrCode in currentErrorStrings
      ? (keyOrCode as ErrorStringKey)
      : ERROR_CODE_TO_STRING_KEY[keyOrCode] ?? "unknownError";

  const template = currentErrorStrings[resolvedKey] ?? DEFAULT_ERROR_STRINGS[resolvedKey];
  return formatErrorTemplate(template, params);
}

/**
 * Updates the global error strings dictionary with custom or translated strings.
 * Consuming applications can call this during app initialization to localize all hook error messages.
 *
 * @param overrides - Partial mapping of ErrorStrings to override.
 *
 * @example
 * ```ts
 * setErrorStrings({
 *   walletNotConnected: "Portefeuille non connecté. Appelez connect() d'abord.",
 *   freighterNotInstalled: "Freighter n'est pas installé dans cet environnement.",
 * });
 * ```
 */
export function setErrorStrings(overrides: Partial<ErrorStrings>): void {
  currentErrorStrings = {
    ...currentErrorStrings,
    ...overrides,
  };
}

/**
 * Returns a copy of the current error strings dictionary.
 */
export function getErrorStrings(): Readonly<ErrorStrings> {
  return { ...currentErrorStrings };
}

/**
 * Resets the active error strings back to the default English dictionary.
 * Useful in unit tests or when resetting application state.
 */
export function resetErrorStrings(): void {
  currentErrorStrings = { ...DEFAULT_ERROR_STRINGS };
}
