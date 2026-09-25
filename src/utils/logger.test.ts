import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEBUG_STORAGE_KEY,
  isDebugLoggingEnabled,
  setDebugLogging,
  enableDebugLogging,
  disableDebugLogging,
  logger,
} from "./logger";

describe("debug logger", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    setDebugLogging(null); // Reset memory override
  });

  afterEach(() => {
    setDebugLogging(null);
    vi.restoreAllMocks();
  });

  it("is disabled by default when no flag is set", () => {
    expect(isDebugLoggingEnabled()).toBe(false);
  });

  it("can be enabled and disabled programmatically", () => {
    enableDebugLogging();
    expect(isDebugLoggingEnabled()).toBe(true);

    disableDebugLogging();
    expect(isDebugLoggingEnabled()).toBe(false);
  });

  it("reads stellar-hooks:debug flag from localStorage", () => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {}),
      length: 0,
      key: vi.fn(() => null),
    };

    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    setDebugLogging(null);
    expect(isDebugLoggingEnabled()).toBe(false);

    store[DEBUG_STORAGE_KEY] = "true";
    expect(isDebugLoggingEnabled()).toBe(true);

    store[DEBUG_STORAGE_KEY] = "1";
    expect(isDebugLoggingEnabled()).toBe(true);

    store[DEBUG_STORAGE_KEY] = "*";
    expect(isDebugLoggingEnabled()).toBe(true);

    store[DEBUG_STORAGE_KEY] = "false";
    expect(isDebugLoggingEnabled()).toBe(false);

    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    }
  });

  it("logs RPC, retries, and state transitions when enabled", () => {
    enableDebugLogging();

    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.logRpc("sorobanRpc.getTransaction", { hash: "0x123" });
    expect(debugSpy).toHaveBeenCalledWith(
      "[stellar-hooks:rpc] Call: sorobanRpc.getTransaction",
      expect.objectContaining({ params: { hash: "0x123" } })
    );

    logger.logRetry("useTransactionCore", 2, 3, new Error("timeout"));
    expect(warnSpy).toHaveBeenCalledWith(
      "[stellar-hooks:retry] [useTransactionCore] Attempt 2/3",
      expect.any(Error)
    );

    logger.logStateTransition("useTransactionLifecycle", "submitting", "polling");
    expect(debugSpy).toHaveBeenCalledWith(
      "[stellar-hooks:state] [useTransactionLifecycle] submitting -> polling",
      ""
    );
  });

  it("does not log when disabled", () => {
    disableDebugLogging();

    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.logRpc("sorobanRpc.getTransaction", { hash: "0x123" });
    logger.logRetry("useTransactionCore", 1, 3);
    logger.logStateTransition("useTransactionLifecycle", "idle", "building");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
