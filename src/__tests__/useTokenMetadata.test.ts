/**
 * @file useTokenMetadata.test.ts
 * @description Tests for the SEP-41 metadata hook (#969).
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { nativeToScVal, StrKey } from "@stellar/stellar-sdk/minimal";

const simulate = vi.fn();
vi.mock("@stellar/stellar-sdk/rpc", () => ({
  Server: vi.fn().mockImplementation(() => ({ simulateTransaction: simulate })),
  Api: { isSimulationError: (r: { error?: unknown }) => typeof r.error === "string" },
}));
vi.mock("../context", () => ({
  useStellarContext: () => ({
    config: {
      network: "testnet",
      sorobanRpcUrl: "https://rpc.test",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
  }),
}));

import { useTokenMetadata } from "../hooks/useTokenMetadata";

const TOKEN = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
const TOKEN_B = StrKey.encodeContract(Buffer.alloc(32, 2));
const TOKEN_C = StrKey.encodeContract(Buffer.alloc(32, 3));
const TOKEN_D = StrKey.encodeContract(Buffer.alloc(32, 4));

/** Answer each simulation according to the method named in its transaction. */
function answer(values: Record<string, unknown>) {
  simulate.mockImplementation(async (tx: { operations: Array<{ func: { invokeContract: () => { functionName: () => Buffer } } }> }) => {
    const method = tx.operations[0].func.invokeContract().functionName().toString();
    const value = values[method];
    if (value instanceof Error) return { error: value.message };
    return { result: { retval: nativeToScVal(value as string, typeof value === "number" ? { type: "u32" } : undefined) } };
  });
}

beforeEach(() => {
  simulate.mockReset();
});

describe("useTokenMetadata", () => {
  it("reads name, symbol and decimals", async () => {
    answer({ name: "USD Coin", symbol: "USDC", decimals: 7 });
    const { result } = renderHook(() => useTokenMetadata({ contractId: TOKEN }));

    await waitFor(() => expect(result.current.metadata).not.toBeNull());
    expect(result.current).toMatchObject({ name: "USD Coin", symbol: "USDC", decimals: 7, error: null, isLoading: false });
    expect(simulate).toHaveBeenCalledTimes(3);
  });

  it("starts all three reads before any of them resolves", async () => {
    const resolvers: Array<() => void> = [];
    simulate.mockImplementation(
      () => new Promise((resolve) => resolvers.push(() => resolve({ error: "stop" }))),
    );
    renderHook(() => useTokenMetadata({ contractId: TOKEN_B }));
    await waitFor(() => expect(simulate).toHaveBeenCalledTimes(3));
    resolvers.forEach((r) => r());
  });

  it("serves a second mount from the cache without more RPC calls", async () => {
    answer({ name: "Cached", symbol: "CCH", decimals: 6 });
    const first = renderHook(() => useTokenMetadata({ contractId: TOKEN_B }));
    await waitFor(() => expect(first.result.current.metadata).not.toBeNull());
    const calls = simulate.mock.calls.length;

    const second = renderHook(() => useTokenMetadata({ contractId: TOKEN_B }));
    await waitFor(() => expect(second.result.current.symbol).toBe("CCH"));
    expect(simulate.mock.calls.length).toBe(calls);

    answer({ name: "Cached", symbol: "NEW", decimals: 6 });
    await act(() => second.result.current.refetch());
    await waitFor(() => expect(second.result.current.symbol).toBe("NEW"));
  });

  it("reports a simulation failure", async () => {
    answer({ name: new Error("no such function"), symbol: "X", decimals: 7 });
    const { result } = renderHook(() =>
      useTokenMetadata({ contractId: TOKEN_C }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/simulation failed/);
    expect(result.current.metadata).toBeNull();
  });

  it("rejects contracts that do not return the SEP-41 types", async () => {
    answer({ name: "Odd", symbol: "ODD", decimals: "seven" });
    const { result } = renderHook(() =>
      useTokenMetadata({ contractId: TOKEN_D }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/SEP-41/);
  });

  it("does nothing while disabled or without a contract", () => {
    renderHook(() => useTokenMetadata({ contractId: TOKEN, enabled: false }));
    renderHook(() => useTokenMetadata({ contractId: null }));
    expect(simulate).not.toHaveBeenCalled();
  });
});
