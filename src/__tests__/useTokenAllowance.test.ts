/**
 * @file useTokenAllowance.test.ts
 * @description Tests for the SEP-41 allowance hook (#967).
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Keypair } from "@stellar/stellar-sdk";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk/minimal";

const TOKEN = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
const OWNER = Keypair.random().publicKey();
const SPENDER = Keypair.random().publicKey();

const readMock = vi.fn();
const getLedgerEntries = vi.fn();

vi.mock("../hooks/useSorobanRead", () => ({ useSorobanRead: (...a: unknown[]) => readMock(...a) }));
vi.mock("../context", () => ({
  useStellarContext: () => ({
    config: { network: "testnet", sorobanRpcUrl: "https://rpc.test", networkPassphrase: "Test" },
  }),
}));
vi.mock("@stellar/stellar-sdk/rpc", () => ({
  Server: vi.fn().mockImplementation(() => ({ getLedgerEntries })),
}));

import { buildAllowanceKey, useTokenAllowance } from "../hooks/useTokenAllowance";

const read = (over: Record<string, unknown> = {}) => ({
  data: null,
  isLoading: false,
  isRefetching: false,
  error: null,
  refetch: vi.fn(),
  ...over,
});

/** A ledger entry shaped like the Soroban token's AllowanceValue. */
function entry(field: string, amount: bigint, ledger: number) {
  const val = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount"), val: nativeToScVal(amount, { type: "i128" }) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(field), val: nativeToScVal(ledger, { type: "u32" }) }),
  ]);
  return { val: { contractData: () => ({ val: () => val }) } };
}

beforeEach(() => {
  readMock.mockReset();
  getLedgerEntries.mockReset();
});

describe("useTokenAllowance", () => {
  it("reads allowance(owner, spender)", () => {
    readMock.mockReturnValue(read());
    renderHook(() => useTokenAllowance({ contractId: TOKEN, owner: OWNER, spender: SPENDER }));
    const [contractId, method, args, options] = readMock.mock.calls[0];
    expect(contractId).toBe(TOKEN);
    expect(method).toBe("allowance");
    expect(args).toHaveLength(2);
    expect(options.enabled).toBe(true);
  });

  it("returns the amount and its expiration ledger", async () => {
    readMock.mockReturnValue(read({ data: 50_000_000n }));
    getLedgerEntries.mockResolvedValue({ entries: [entry("expiration_ledger", 50_000_000n, 2_000)], latestLedger: 1_500 });

    const { result } = renderHook(() =>
      useTokenAllowance({ contractId: TOKEN, owner: OWNER, spender: SPENDER }),
    );
    await waitFor(() => expect(result.current.expirationLedger).toBe(2_000));
    expect(result.current.allowance).toBe(50_000_000n);
    expect(result.current.formatted).toBe("5");
    expect(result.current.isExpired).toBe(false);
  });

  it("understands the Stellar Asset Contract field name and flags expiry", async () => {
    readMock.mockReturnValue(read({ data: 1n }));
    getLedgerEntries.mockResolvedValue({ entries: [entry("live_until_ledger", 1n, 900)], latestLedger: 1_000 });
    const { result } = renderHook(() =>
      useTokenAllowance({ contractId: TOKEN, owner: OWNER, spender: SPENDER }),
    );
    await waitFor(() => expect(result.current.expirationLedger).toBe(900));
    expect(result.current.isExpired).toBe(true);
  });

  it("keeps the amount when the expiration lookup fails or finds nothing", async () => {
    readMock.mockReturnValue(read({ data: 7n }));
    getLedgerEntries.mockRejectedValueOnce(new Error("rpc down"));
    const failing = renderHook(() =>
      useTokenAllowance({ contractId: TOKEN, owner: OWNER, spender: SPENDER }),
    );
    await waitFor(() => expect(getLedgerEntries).toHaveBeenCalled());
    expect(failing.result.current.allowance).toBe(7n);
    expect(failing.result.current.expirationLedger).toBeNull();
    expect(failing.result.current.isExpired).toBe(false);

    getLedgerEntries.mockResolvedValueOnce({ entries: [], latestLedger: 5 });
    const missing = renderHook(() =>
      useTokenAllowance({ contractId: TOKEN, owner: OWNER, spender: SPENDER }),
    );
    await waitFor(() => expect(getLedgerEntries).toHaveBeenCalledTimes(2));
    expect(missing.result.current.expirationLedger).toBeNull();
  });

  it("skips the storage lookup when includeExpiration is false", () => {
    readMock.mockReturnValue(read({ data: 7n }));
    renderHook(() =>
      useTokenAllowance({ contractId: TOKEN, owner: OWNER, spender: SPENDER, includeExpiration: false }),
    );
    expect(getLedgerEntries).not.toHaveBeenCalled();
  });

  it("waits for owner and spender", () => {
    readMock.mockReturnValue(read());
    renderHook(() => useTokenAllowance({ contractId: TOKEN, owner: OWNER, spender: null }));
    expect(readMock.mock.calls[0][3].enabled).toBe(false);
    expect(getLedgerEntries).not.toHaveBeenCalled();
  });

  it("passes errors and loading state through", () => {
    const error = new Error("boom");
    readMock.mockReturnValue(read({ isLoading: true, error }));
    const { result } = renderHook(() =>
      useTokenAllowance({ contractId: TOKEN, owner: OWNER, spender: SPENDER }),
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe(error);
    expect(result.current.allowance).toBeNull();
  });
});

describe("buildAllowanceKey", () => {
  it("targets the temporary Allowance({from, spender}) entry of the token", () => {
    const key = buildAllowanceKey(TOKEN, OWNER, SPENDER).contractData();
    expect(key.durability().name).toBe("temporary");
    const vec = key.key().vec()!;
    expect(vec[0].sym().toString()).toBe("Allowance");
    expect(vec[1].map()!.map((e) => e.key().sym().toString())).toEqual(["from", "spender"]);
  });
});
