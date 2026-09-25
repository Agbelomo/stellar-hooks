/**
 * @file logger.ts
 * @description Configurable debug logging utility enabled via localStorage flag `stellar-hooks:debug`.
 * @package stellar-hooks
 * @license MIT
 */

export const DEBUG_STORAGE_KEY = "stellar-hooks:debug";

let memoryDebugOverride: boolean | null = null;

/**
 * Returns true if debug logging is enabled via in-memory toggle or `stellar-hooks:debug` flag in localStorage.
 * Safe to execute in server-side / SSR environments.
 */
export function isDebugLoggingEnabled(): boolean {
  if (memoryDebugOverride !== null) {
    return memoryDebugOverride;
  }

  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      const flag = localStorage.getItem(DEBUG_STORAGE_KEY);
      if (!flag) return false;
      const normalized = flag.trim().toLowerCase();
      return (
        normalized === "true" ||
        normalized === "1" ||
        normalized === "*" ||
        normalized === "stellar-hooks" ||
        normalized.startsWith("stellar-hooks")
      );
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Programmatically enable, disable, or reset the debug logging flag.
 *
 * @param enabled - `true` to enable, `false` to disable, or `null` to clear the override and rely on localStorage.
 */
export function setDebugLogging(enabled: boolean | null): void {
  memoryDebugOverride = enabled;

  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      if (enabled === true) {
        localStorage.setItem(DEBUG_STORAGE_KEY, "true");
      } else if (enabled === false || enabled === null) {
        localStorage.removeItem(DEBUG_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage access restrictions
    }
  }
}

/**
 * Enable verbose debug logging across all hooks.
 */
export function enableDebugLogging(): void {
  setDebugLogging(true);
}

/**
 * Disable verbose debug logging across all hooks.
 */
export function disableDebugLogging(): void {
  setDebugLogging(false);
}

/**
 * Structured debug logger for hooks, RPC calls, retries, and state transitions.
 */
export const logger = {
  isEnabled: isDebugLoggingEnabled,

  debug(tag: string, message: string, ...args: unknown[]): void {
    if (!isDebugLoggingEnabled()) return;
    console.debug(`[stellar-hooks:${tag}] ${message}`, ...args);
  },

  info(tag: string, message: string, ...args: unknown[]): void {
    if (!isDebugLoggingEnabled()) return;
    console.info(`[stellar-hooks:${tag}] ${message}`, ...args);
  },

  warn(tag: string, message: string, ...args: unknown[]): void {
    if (!isDebugLoggingEnabled()) return;
    console.warn(`[stellar-hooks:${tag}] ${message}`, ...args);
  },

  error(tag: string, message: string, ...args: unknown[]): void {
    if (!isDebugLoggingEnabled()) return;
    console.error(`[stellar-hooks:${tag}] ${message}`, ...args);
  },

  /**
   * Log an RPC request and optional response.
   */
  logRpc(method: string, params?: unknown, result?: unknown): void {
    if (!isDebugLoggingEnabled()) return;
    console.debug(`[stellar-hooks:rpc] Call: ${method}`, { params, result });
  },

  /**
   * Log an RPC retry attempt with failure details.
   */
  logRetry(hook: string, attempt: number, maxRetries: number, error?: unknown): void {
    if (!isDebugLoggingEnabled()) return;
    console.warn(`[stellar-hooks:retry] [${hook}] Attempt ${attempt}/${maxRetries}`, error ?? "");
  },

  /**
   * Log an internal hook state transition.
   */
  logStateTransition(hook: string, fromState: string, toState: string, details?: unknown): void {
    if (!isDebugLoggingEnabled()) return;
    console.debug(`[stellar-hooks:state] [${hook}] ${fromState} -> ${toState}`, details ?? "");
  },
};

export const debugLogger = logger;
