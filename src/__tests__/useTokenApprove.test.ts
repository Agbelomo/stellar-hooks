/**
 * @file useTokenApprove.test.ts
 * @description Tests for the SEP-41 approve hook (#968).
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Keypair } from "@stellar/stellar-sdk";

const TOKEN = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
const OWNER = Keypair.random().publicKey();
const SPENDER = Keypair.random().publicKey();

const call = vi.fn();
const resetContract = vi.fn();
const getLatestLedger = vi.fn();
let contractState: Record<string, unknown>;
let wallet: { publicKey: string | null };

vi.mock("../hooks/useFreighter", () => ({ useFreighter: () => wallet }));
vi.mock("../hooks/useSorobanContract", () => ({
  useSorobanContract: () => ({ ...contractState, call, reset: resetContract }),
}));
vi.mock("../context", () => ({ useStellarContext: () => ({ config: { sorobanRpcUrl: "https://rpc.test" } }) }));
vi.mock("@stellar/stellar-sdk/rpc", () => ({
  Server: vi.fn().mockImplementation(() => ({ getLatestLedger })),
}));

import { useTokenApprove } from "../hooks/useTokenApprove";

beforeEach(() => {
  call.mockReset().mockResolvedValue(null);
  resetContract.mockReset();
  getLatestLedger.mockReset().mockResolvedValue({ sequence: 1_000 });
  wallet = { publicKey: OWNER };
  contractState = { status: "idle", hash: null, error: null, isLoading: false, isSuccess: false, isError: false };
});

describe("useTokenApprove", () => {
  it("invokes approve(from, spender, amount, expiration_ledger) with typed arguments", async () => {
    const { result } = renderHook(() => useTokenApprove({ contractId: TOKEN }));
    await act(() => result.current.approve({ spender: SPENDER, amount: 5_000_000n, expirationLedger: 2_000 }));

    const { method, args } = call.mock.calls[0][0];
    expect(method).toBe("approve");
    expect(args.map((a: { switch: () => { name: string } }) => a.switch().name)).toEqual([
      "scvAddress",
      "scvAddress",
      "scvI128",
      "scvU32",
    ]);
    expect(args[3].u32()).toBe(2_000);
  });

  it.each([
    ["a malformed spender", { spender: "nope", amount: 1n, expirationLedger: 2_000 }, "invalid_spender"],
    ["approving yourself", { spender: OWNER, amount: 1n, expirationLedger: 2_000 }, "same_account"],
    ["a negative amount", { spender: SPENDER, amount: -1n, expirationLedger: 2_000 }, "invalid_amount"],
    ["a missing expiration", { spender: SPENDER, amount: 1n, expirationLedger: undefined as unknown as number }, "invalid_expiration"],
    ["a fractional expiration", { spender: SPENDER, amount: 1n, expirationLedger: 10.5 }, "invalid_expiration"],
    ["an expiration beyond u32", { spender: SPENDER, amount: 1n, expirationLedger: 2 ** 32 }, "invalid_expiration"],
    ["an expiration in the past", { spender: SPENDER, amount: 1n, expirationLedger: 900 }, "expiration_in_past"],
    ["an expiration equal to the current ledger", { spender: SPENDER, amount: 1n, expirationLedger: 1_000 }, "expiration_in_past"],
  ])("rejects %s with a clear error and never signs", async (_label, params, code) => {
    const onError = vi.fn();
    const { result } = renderHook(() => useTokenApprove({ contractId: TOKEN, onError }));
    await act(() => result.current.approve(params));

    expect(call).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({ type: "transaction", resultCode: code });
    expect(result.current.isError).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ resultCode: code }));
  });

  it("requires a connected wallet", async () => {
    wallet = { publicKey: null };
    const { result } = renderHook(() => useTokenApprove({ contractId: TOKEN }));
    await act(() => result.current.approve({ spender: SPENDER, amount: 1n, expirationLedger: 2_000 }));
    expect(result.current.error).toMatchObject({ resultCode: "no_wallet" });
  });

  it("lets a zero allowance revoke without checking the expiration", async () => {
    const { result } = renderHook(() => useTokenApprove({ contractId: TOKEN }));
    await act(() => result.current.approve({ spender: SPENDER, amount: 0n, expirationLedger: 0 }));
    expect(getLatestLedger).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("falls through to the contract when the current ledger cannot be fetched", async () => {
    getLatestLedger.mockRejectedValue(new Error("rpc down"));
    const { result } = renderHook(() => useTokenApprove({ contractId: TOKEN }));
    await act(() => result.current.approve({ spender: SPENDER, amount: 1n, expirationLedger: 500 }));
    expect(call).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("clears validation errors on reset and on the next attempt", async () => {
    const { result } = renderHook(() => useTokenApprove({ contractId: TOKEN }));
    await act(() => result.current.approve({ spender: "bad", amount: 1n, expirationLedger: 2_000 }));
    expect(result.current.isError).toBe(true);
    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
    expect(resetContract).toHaveBeenCalled();

    await act(() => result.current.approve({ spender: "bad", amount: 1n, expirationLedger: 2_000 }));
    await act(() => result.current.approve({ spender: SPENDER, amount: 1n, expirationLedger: 2_000 }));
    expect(result.current.isError).toBe(false);
  });

  it("reports the hash through onSuccess once and mirrors the contract lifecycle", () => {
    const onSuccess = vi.fn();
    contractState = { ...contractState, status: "success", hash: "tx9", isSuccess: true };
    const { result, rerender } = renderHook(() => useTokenApprove({ contractId: TOKEN, onSuccess }));
    rerender();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith("tx9");
    expect(result.current).toMatchObject({ status: "success", hash: "tx9", isSuccess: true });
  });
});
