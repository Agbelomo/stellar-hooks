/**
 * @file useTokenBalance.test.ts
 * @description Tests for the SEP-41 balance hook (#965) and token amount helpers.
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { xdr, nativeToScVal } from "@stellar/stellar-sdk/minimal";

const readMock = vi.fn();
vi.mock("../hooks/useSorobanRead", () => ({
  useSorobanRead: (...args: unknown[]) => readMock(...args),
}));

import { useTokenBalance } from "../hooks/useTokenBalance";
import { formatTokenAmount, parseTokenAmount } from "../utils/tokenAmount";

const TOKEN = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
const ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const state = (over: Record<string, unknown> = {}) => ({
  data: null,
  result: null,
  simulation: null,
  isLoading: false,
  isRefetching: false,
  error: null,
  refetch: vi.fn(),
  ...over,
});

beforeEach(() => readMock.mockReset());

describe("useTokenBalance", () => {
  it("reads balance(account) with an address argument", () => {
    readMock.mockReturnValue(state());
    renderHook(() => useTokenBalance({ contractId: TOKEN, account: ACCOUNT }));

    const [contractId, method, args, options] = readMock.mock.calls[0];
    expect(contractId).toBe(TOKEN);
    expect(method).toBe("balance");
    expect(args).toHaveLength(1);
    expect(args[0].switch().name).toBe("scvAddress");
    expect(options.enabled).toBe(true);
  });

  it("returns a typed bigint plus a formatted amount", () => {
    readMock.mockReturnValue(state({ data: 123_456_789n }));
    const { result } = renderHook(() => useTokenBalance({ contractId: TOKEN, account: ACCOUNT }));
    expect(result.current.balance).toBe(123_456_789n);
    expect(result.current.formatted).toBe("12.3456789");
    expect(result.current.decimals).toBe(7);
  });

  it("honours custom decimals", () => {
    readMock.mockReturnValue(state({ data: 2_500_000n }));
    const { result } = renderHook(() =>
      useTokenBalance({ contractId: TOKEN, account: ACCOUNT, decimals: 6 }),
    );
    expect(result.current.formatted).toBe("2.5");
  });

  it("passes loading and error state through", () => {
    const error = new Error("simulation failed");
    readMock.mockReturnValue(state({ isLoading: true, error }));
    const { result } = renderHook(() => useTokenBalance({ contractId: TOKEN, account: ACCOUNT }));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe(error);
    expect(result.current.balance).toBeNull();
    expect(result.current.formatted).toBeNull();
  });

  it("does not fetch until an account is provided or when disabled", () => {
    readMock.mockReturnValue(state());
    renderHook(() => useTokenBalance({ contractId: TOKEN, account: null }));
    expect(readMock.mock.calls[0][3].enabled).toBe(false);
    renderHook(() => useTokenBalance({ contractId: TOKEN, account: ACCOUNT, enabled: false }));
    expect(readMock.mock.calls[1][3].enabled).toBe(false);
  });

  it("parseResult accepts i128 values and rejects non-integers", () => {
    readMock.mockReturnValue(state());
    renderHook(() => useTokenBalance({ contractId: TOKEN, account: ACCOUNT }));
    const parse = readMock.mock.calls[0][3].parseResult as (v: xdr.ScVal) => bigint;
    expect(parse(nativeToScVal(42n, { type: "i128" }))).toBe(42n);
    expect(() => parse(nativeToScVal("hello"))).toThrow(/non-integer/);
  });
});

describe("token amount helpers", () => {
  it("formats without precision loss", () => {
    expect(formatTokenAmount(0n)).toBe("0");
    expect(formatTokenAmount(10_000_000n)).toBe("1");
    expect(formatTokenAmount(1n)).toBe("0.0000001");
    expect(formatTokenAmount(-15_000_000n)).toBe("-1.5");
    expect(formatTokenAmount(123n, 0)).toBe("123");
    expect(formatTokenAmount(2n ** 100n, 18)).toBe("1267650600228.229401496703205376");
  });

  it("parses decimal strings and rejects bad input", () => {
    expect(parseTokenAmount("1.5")).toBe(15_000_000n);
    expect(parseTokenAmount("0.0000001")).toBe(1n);
    expect(parseTokenAmount("-2", 2)).toBe(-200n);
    expect(() => parseTokenAmount("1.12345678")).toThrow(RangeError);
    expect(() => parseTokenAmount("abc")).toThrow(SyntaxError);
    expect(() => formatTokenAmount(1n, -1)).toThrow(RangeError);
  });
});
