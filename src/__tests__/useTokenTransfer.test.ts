/**
 * @file useTokenTransfer.test.ts
 * @description Tests for the SEP-41 transfer hook (#966).
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Keypair } from "@stellar/stellar-sdk";

const TOKEN = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
const SENDER = Keypair.random().publicKey();
const RECIPIENT = Keypair.random().publicKey();

const call = vi.fn();
const resetContract = vi.fn();
let contractState: Record<string, unknown>;
let wallet: { publicKey: string | null };

vi.mock("../hooks/useFreighter", () => ({ useFreighter: () => wallet }));
vi.mock("../hooks/useSorobanContract", () => ({
  useSorobanContract: () => ({ ...contractState, call, reset: resetContract }),
}));

import { useTokenTransfer } from "../hooks/useTokenTransfer";

beforeEach(() => {
  call.mockReset().mockResolvedValue(null);
  resetContract.mockReset();
  wallet = { publicKey: SENDER };
  contractState = {
    status: "idle",
    hash: null,
    error: null,
    isLoading: false,
    isSuccess: false,
    isError: false,
  };
});

describe("useTokenTransfer", () => {
  it("invokes transfer(from, to, amount) with address and i128 arguments", async () => {
    const { result } = renderHook(() => useTokenTransfer({ contractId: TOKEN }));
    await act(() => result.current.transfer({ to: RECIPIENT, amount: 15_000_000n }));

    expect(call).toHaveBeenCalledTimes(1);
    const { method, args } = call.mock.calls[0][0];
    expect(method).toBe("transfer");
    expect(args.map((a: { switch: () => { name: string } }) => a.switch().name)).toEqual([
      "scvAddress",
      "scvAddress",
      "scvI128",
    ]);
    expect(args[2].i128().lo().toBigInt()).toBe(15_000_000n);
  });

  it.each([
    ["a zero amount", { to: RECIPIENT, amount: 0n }, "invalid_amount"],
    ["a negative amount", { to: RECIPIENT, amount: -1n }, "invalid_amount"],
    ["a malformed recipient", { to: "not-an-address", amount: 1n }, "invalid_recipient"],
    ["sending to yourself", { to: SENDER, amount: 1n }, "same_account"],
  ])("rejects %s before anything is signed", async (_label, params, code) => {
    const onError = vi.fn();
    const { result } = renderHook(() => useTokenTransfer({ contractId: TOKEN, onError }));
    await act(() => result.current.transfer(params));

    expect(call).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(true);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatchObject({ type: "transaction", resultCode: code });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ resultCode: code }));
  });

  it("requires a connected wallet", async () => {
    wallet = { publicKey: null };
    const { result } = renderHook(() => useTokenTransfer({ contractId: TOKEN }));
    await act(() => result.current.transfer({ to: RECIPIENT, amount: 1n }));
    expect(call).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({ resultCode: "no_wallet" });
  });

  it("clears a validation error on reset and on the next attempt", async () => {
    const { result } = renderHook(() => useTokenTransfer({ contractId: TOKEN }));
    await act(() => result.current.transfer({ to: RECIPIENT, amount: 0n }));
    expect(result.current.isError).toBe(true);

    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
    expect(resetContract).toHaveBeenCalled();

    await act(() => result.current.transfer({ to: RECIPIENT, amount: 0n }));
    await act(() => result.current.transfer({ to: RECIPIENT, amount: 5n }));
    expect(result.current.isError).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("reflects the underlying transaction lifecycle", () => {
    contractState = { ...contractState, status: "signing", isLoading: true };
    const { result, rerender } = renderHook(() => useTokenTransfer({ contractId: TOKEN }));
    expect(result.current.status).toBe("signing");
    expect(result.current.isLoading).toBe(true);

    contractState = { ...contractState, status: "success", hash: "abc", isLoading: false, isSuccess: true };
    rerender();
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.hash).toBe("abc");
  });

  it("reports the hash through onSuccess exactly once", () => {
    const onSuccess = vi.fn();
    contractState = { ...contractState, status: "success", hash: "tx1", isSuccess: true };
    const { rerender } = renderHook(() => useTokenTransfer({ contractId: TOKEN, onSuccess }));
    rerender();
    rerender();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith("tx1");
  });

  it("surfaces on-chain errors from the contract hook", () => {
    contractState = {
      ...contractState,
      status: "error",
      isError: true,
      error: { type: "transaction", resultCode: "unknown", message: "failed" },
    };
    const { result } = renderHook(() => useTokenTransfer({ contractId: TOKEN }));
    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe("failed");
  });
});
