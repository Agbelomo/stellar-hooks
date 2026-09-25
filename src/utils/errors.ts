/**
 * @file errors.ts
 * @description Standardized error structures for all stellar-hooks.
 * @package stellar-hooks
 * @license MIT
 */

import { getErrorString } from "./errorStrings";

/**
 * Standardized error code enum so consumers can reliably branch on error types.
 */
export enum ErrorCode {
  // Wallet errors
  WALLET_NOT_CONNECTED = "WALLET_NOT_CONNECTED",
  WALLET_NOT_INSTALLED = "WALLET_NOT_INSTALLED",
  FREIGHTER_NOT_INSTALLED = "FREIGHTER_NOT_INSTALLED",
  USER_REJECTED = "USER_REJECTED",
  WALLET_CONNECTION_FAILED = "WALLET_CONNECTION_FAILED",
  WALLET_SIGN_FAILED = "WALLET_SIGN_FAILED",

  // Transaction / Execution errors
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  TRANSACTION_TIMEOUT = "TRANSACTION_TIMEOUT",
  SIMULATION_ERROR = "SIMULATION_ERROR",
  SIMULATION_FAILED = "SIMULATION_FAILED",
  TX_SUBMIT_FAILED = "TX_SUBMIT_FAILED",
  SEQUENCE_MISMATCH = "SEQUENCE_MISMATCH",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  FEE_TOO_LOW = "FEE_TOO_LOW",

  // Network / RPC errors
  NETWORK_ERROR = "NETWORK_ERROR",
  RPC_ERROR = "RPC_ERROR",
  ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND",
  CONTRACT_NOT_FOUND = "CONTRACT_NOT_FOUND",
  ENTRY_NOT_FOUND = "ENTRY_NOT_FOUND",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",

  // Validation / Configuration errors
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_PUBLIC_KEY = "INVALID_PUBLIC_KEY",
  INVALID_CONTRACT_ID = "INVALID_CONTRACT_ID",
  INVALID_PARAMETERS = "INVALID_PARAMETERS",
  INVALID_NETWORK = "INVALID_NETWORK",
  UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION",

  // General / Fallback
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export type ErrorCodeType = `${ErrorCode}` | ErrorCode;

/**
 * Standardized error class thrown or returned by all hooks in the library.
 * Replaces raw generic Error objects to provide predictable shape: { message, code, cause, context }
 */
export class StellarHookError extends Error {
  public code: ErrorCode | string | undefined;
  public context: Record<string, unknown> | undefined;

  constructor(
    message: string,
    options?: { code?: ErrorCode | string; cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message);
    
    this.name = 'StellarHookError';
    this.code = options?.code;
    this.context = options?.context;

    if (options?.cause !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cause = options.cause;
    }

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StellarHookError);
    }
  }

  /**
   * Helper to wrap unknown caught errors into a StellarHookError with a structured error code.
   */
  static from(
    err: unknown,
    fallbackMessage = getErrorString("unknownError"),
    additionalContext?: Record<string, unknown>,
    fallbackCode?: ErrorCode | string
  ): StellarHookError {
    if (err instanceof StellarHookError) {
      if (additionalContext) {
        err.context = { ...err.context, ...additionalContext };
      }
      if (fallbackCode && !err.code) {
        err.code = fallbackCode;
      }
      return err;
    }

    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : fallbackMessage;
    let code: ErrorCode | string | undefined = err instanceof Error && 'code' in err ? String((err as { code?: unknown }).code) : fallbackCode;

    if (!code) {
      if (isUserRejectionMessage(message)) {
        code = ErrorCode.USER_REJECTED;
      } else if (/not installed|is not installed/i.test(message)) {
        code = ErrorCode.WALLET_NOT_INSTALLED;
      } else if (/not connected|is not connected|connect\(\) first/i.test(message)) {
        code = ErrorCode.WALLET_NOT_CONNECTED;
      } else if (/timed out|timeout/i.test(message)) {
        code = ErrorCode.TRANSACTION_TIMEOUT;
      } else if (/simulation|simulate/i.test(message)) {
        code = ErrorCode.SIMULATION_ERROR;
      } else if (/network|fetch|ECONNREFUSED|NetworkError/i.test(message)) {
        code = ErrorCode.NETWORK_ERROR;
      } else if (/valid.*stellar|invalid.*public key|invalid.*contract/i.test(message)) {
        code = ErrorCode.VALIDATION_ERROR;
      } else {
        code = ErrorCode.UNKNOWN_ERROR;
      }
    }

    const opts: { code?: ErrorCode | string; cause?: unknown; context?: Record<string, unknown> } = {
      code,
      cause: err,
    };
    if (additionalContext !== undefined) opts.context = additionalContext;
    return new StellarHookError(message, opts);
  }
}

// ─── UserRejectedError ──────────────────────────────────────────────────────────

/**
 * Error thrown when the user explicitly rejects a wallet interaction
 * (e.g. dismissing a Freighter signature popup, denying a connection request).
 *
 * Extends {@link StellarHookError} with a fixed `code` of `ErrorCode.USER_REJECTED` so
 * consumers can reliably distinguish intentional user cancellations from
 * unexpected failures:
 *
 * @example
 * ```ts
 * try {
 *   await signTransaction(xdr);
 * } catch (err) {
 *   if (err instanceof UserRejectedError || (err instanceof StellarHookError && err.code === ErrorCode.USER_REJECTED)) {
 *     // User dismissed the popup — no error report needed
 *     return;
 *   }
 *   // Handle real errors (network, on-chain failure, etc.)
 *   console.error(err);
 * }
 * ```
 */
export class UserRejectedError extends StellarHookError {
  /** Wallet ID that triggered the rejection (e.g. `"freighter"`, `"albedo"`). */
  public readonly walletId: string | undefined;
  /** The operation the user rejected (e.g. `"signTransaction"`, `"connect"`). */
  public readonly operation: string | undefined;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      walletId?: string;
      operation?: string;
    }
  ) {
    super(message, {
      code: ErrorCode.USER_REJECTED,
      cause: options?.cause,
      context: {
        walletId: options?.walletId,
        operation: options?.operation,
      },
    });

    this.name = 'UserRejectedError';
    this.walletId = options?.walletId;
    this.operation = options?.operation;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UserRejectedError);
    }
  }
}

// ─── FreighterNotInstalledError ───────────────────────────────────────────────

/**
 * Thrown when an operation requires the Freighter browser extension but it is
 * not installed (or not reachable) in the current environment.
 *
 * Extends {@link StellarHookError} with a fixed `code` of `"FREIGHTER_NOT_INSTALLED"`
 * so consumers can reliably detect and react to this specific failure mode,
 * e.g. by showing an "Install Freighter" prompt.
 *
 * @example
 * ```ts
 * try {
 *   await signTransaction(xdr);
 * } catch (err) {
 *   if (err instanceof FreighterNotInstalledError) {
 *     return <InstallFreighterPrompt />;
 *   }
 * }
 * ```
 */
export class FreighterNotInstalledError extends StellarHookError {
  constructor(
    message = getErrorString("freighterNotInstalled"),
    options?: { cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message, {
      code: ErrorCode.FREIGHTER_NOT_INSTALLED,
      ...(options?.cause !== undefined && { cause: options.cause }),
      ...(options?.context !== undefined && { context: options.context }),
    });
    this.name = "FreighterNotInstalledError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FreighterNotInstalledError);
    }
  }
}

// ─── WalletNotConnectedError ──────────────────────────────────────────────────

/**
 * Thrown when an operation requires an active wallet connection, but no wallet is connected.
 */
export class WalletNotConnectedError extends StellarHookError {
  constructor(
    message = getErrorString("walletNotConnected"),
    options?: { cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message, {
      code: ErrorCode.WALLET_NOT_CONNECTED,
      cause: options?.cause,
      context: options?.context,
    });
    this.name = "WalletNotConnectedError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WalletNotConnectedError);
    }
  }
}

// ─── WalletNotInstalledError ──────────────────────────────────────────────────

/**
 * Thrown when a specified wallet extension is not installed or reachable in the environment.
 */
export class WalletNotInstalledError extends StellarHookError {
  public readonly walletId: string | undefined;

  constructor(
    message = getErrorString("walletNotInstalled"),
    options?: { walletId?: string; cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message, {
      code: ErrorCode.WALLET_NOT_INSTALLED,
      cause: options?.cause,
      context: { ...options?.context, walletId: options?.walletId },
    });
    this.name = "WalletNotInstalledError";
    this.walletId = options?.walletId;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WalletNotInstalledError);
    }
  }
}

// ─── TransactionFailedError ───────────────────────────────────────────────────

/**
 * Thrown when a Stellar or Soroban transaction fails to submit or validate on-chain.
 */
export class TransactionFailedError extends StellarHookError {
  public readonly txHash: string | undefined;
  public readonly resultCode: string | undefined;

  constructor(
    message: string,
    options?: { txHash?: string; resultCode?: string; cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message, {
      code: ErrorCode.TRANSACTION_FAILED,
      cause: options?.cause,
      context: { ...options?.context, txHash: options?.txHash, resultCode: options?.resultCode },
    });
    this.name = "TransactionFailedError";
    this.txHash = options?.txHash;
    this.resultCode = options?.resultCode;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TransactionFailedError);
    }
  }
}

// ─── TransactionTimeoutError ──────────────────────────────────────────────────

/**
 * Thrown when a transaction confirmation polling loop times out.
 */
export class TransactionTimeoutError extends StellarHookError {
  public readonly txHash: string | undefined;

  constructor(
    message = getErrorString("transactionTimeout"),
    options?: { txHash?: string; cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message, {
      code: ErrorCode.TRANSACTION_TIMEOUT,
      cause: options?.cause,
      context: { ...options?.context, txHash: options?.txHash },
    });
    this.name = "TransactionTimeoutError";
    this.txHash = options?.txHash;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TransactionTimeoutError);
    }
  }
}

// ─── NetworkError ─────────────────────────────────────────────────────────────

/**
 * Thrown when a network or transport error occurs during RPC/Horizon calls.
 */
export class NetworkError extends StellarHookError {
  constructor(
    message = getErrorString("networkError"),
    options?: { cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message, {
      code: ErrorCode.NETWORK_ERROR,
      cause: options?.cause,
      context: options?.context,
    });
    this.name = "NetworkError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError);
    }
  }
}

// ─── SimulationError ──────────────────────────────────────────────────────────

/**
 * Thrown when a Soroban transaction simulation fails to produce a usable result.
 *
 * Extends {@link StellarHookError} with a fixed `code` of `ErrorCode.SIMULATION_ERROR` and
 * an optional `errorCode` carrying the RPC-level error code, when available.
 *
 * @example
 * ```ts
 * try {
 *   await simulate("transfer", [from, to, amount]);
 * } catch (err) {
 *   if (err instanceof SimulationError || (err instanceof StellarHookError && err.code === ErrorCode.SIMULATION_ERROR)) {
 *     console.error("Simulation failed:", err.errorCode, err.message);
 *   }
 * }
 * ```
 */
export class SimulationError extends StellarHookError {
  /** RPC-level error code (e.g. `"host_error"`, `"txn_failed"`) when available. */
  public readonly errorCode: string | undefined;

  constructor(
    message: string,
    options?: { cause?: unknown; errorCode?: string; context?: Record<string, unknown> }
  ) {
    super(message, {
      code: ErrorCode.SIMULATION_ERROR,
      cause: options?.cause,
      context: { ...options?.context, errorCode: options?.errorCode },
    });
    this.name = "SimulationError";
    this.errorCode = options?.errorCode;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SimulationError);
    }
  }
}

// ─── User Rejection Detection ────────────────────────────────────────────────────

/**
 * Patterns that indicate a user deliberately rejected or cancelled a wallet
 * interaction rather than encountering a technical failure.
 *
 * These are matched case-insensitively against the error message.
 */
const USER_REJECTION_PATTERNS = [
  /user\s*rejected/i,
  /user\s*denied/i,
  /user\s*declined/i,
  /user\s*cancelled/i,
  /user\s*canceled/i,
  /rejected\s*by\s*user/i,
  /denied\s*by\s*user/i,
  /transaction\s*rejected/i,
  /request\s*rejected/i,
  /access\s*denied/i,
  /permission\s*denied/i,
  /signing\s*rejected/i,
  /popup\s*closed/i,
  /user\s*closed/i,
];

/**
 * Checks whether an error message indicates the user deliberately rejected
 * or cancelled a wallet interaction.
 *
 * @param message - The error message to inspect.
 * @returns `true` if the message matches known user-rejection patterns.
 *
 * @example
 * ```ts
 * if (isUserRejectionMessage(error.message)) {
 *   throw new UserRejectedError(error.message, { cause: error });
 * }
 * ```
 */
export function isUserRejectionMessage(message: string): boolean {
  if (!message) return false;
  return USER_REJECTION_PATTERNS.some((pattern) => pattern.test(message));
}
