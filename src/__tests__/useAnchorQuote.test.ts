/**
 * @file useAnchorQuote.test.ts
 * @description Tests for the SEP-38 quote hook (#984).
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnchorQuote } from "../hooks/useAnchorQuote";
import { validateSep38Params } from "../utils/sep38";

const SERVER = "https://anchor.example/sep38/";
const fetchMock = vi.fn();

const reply = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status < 400,
    status,
    statusText: status === 400 ? "Bad Request" : "OK",
    text: () => Promise.resolve(JSON.stringify(body)),
  });

const params = {
  sellAsset: "iso4217:USD",
  buyAsset: "stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  sellAmount: "100",
  context: "sep6" as const,
};

const priceBody = { total_price: "1.02", price: "1.00", sell_amount: "100", buy_amount: "98.04", fee: { total: "2", asset: "iso4217:USD" } };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAnchorQuote", () => {
  it("fetches an indicative price from GET /price", async () => {
    fetchMock.mockReturnValue(reply(200, priceBody));
    const { result } = renderHook(() => useAnchorQuote({ quoteServer: SERVER }));

    let price;
    await act(async () => {
      price = await result.current.getPrice(params);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/anchor\.example\/sep38\/price\?/);
    const query = new URL(url).searchParams;
    expect(query.get("sell_asset")).toBe("iso4217:USD");
    expect(query.get("sell_amount")).toBe("100");
    expect(query.get("context")).toBe("sep6");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBeUndefined();
    expect(price).toMatchObject({ totalPrice: "1.02", buyAmount: "98.04" });
    expect(result.current.price).toEqual(price);
    expect(result.current.isLoading).toBe(false);
  });

  it("requests a firm quote with POST /quote, JWT and expire_after", async () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    fetchMock.mockReturnValue(reply(200, { ...priceBody, id: "q-1", expires_at: expires, sell_asset: params.sellAsset, buy_asset: params.buyAsset }));
    const { result } = renderHook(() => useAnchorQuote({ quoteServer: SERVER, jwt: "token" }));

    const expireAfter = new Date("2030-01-01T00:00:00Z");
    await act(async () => {
      await result.current.getQuote({ ...params, expireAfter });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://anchor.example/sep38/quote");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(init.body)).toMatchObject({ sell_amount: "100", expire_after: "2030-01-01T00:00:00.000Z" });
    expect(result.current.quote).toMatchObject({ id: "q-1", totalPrice: "1.02" });
    expect(result.current.isExpired).toBe(false);
  });

  it("marks a firm quote expired when its time runs out", async () => {
    vi.useFakeTimers();
    const expires = new Date(Date.now() + 5_000).toISOString();
    fetchMock.mockReturnValue(reply(200, { ...priceBody, id: "q-2", expires_at: expires, sell_asset: "a", buy_asset: "b" }));
    const { result } = renderHook(() => useAnchorQuote({ quoteServer: SERVER, jwt: "t" }));
    await act(async () => {
      await result.current.getQuote(params);
    });
    expect(result.current.isExpired).toBe(false);
    act(() => void vi.advanceTimersByTime(5_001));
    expect(result.current.isExpired).toBe(true);
  });

  it("requires a JWT for firm quotes and a quote server for everything", async () => {
    const noJwt = renderHook(() => useAnchorQuote({ quoteServer: SERVER }));
    await act(async () => {
      await expect(noJwt.result.current.getQuote(params)).rejects.toThrow(/jwt is required/);
    });
    const noServer = renderHook(() => useAnchorQuote({ quoteServer: null }));
    await act(async () => {
      await expect(noServer.result.current.getPrice(params)).rejects.toThrow(/quoteServer is required/);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(noJwt.result.current.error?.message).toMatch(/jwt/);
  });

  it("surfaces the anchor's error message", async () => {
    fetchMock.mockReturnValue(reply(400, { error: "unsupported asset pair" }));
    const { result } = renderHook(() => useAnchorQuote({ quoteServer: SERVER }));
    await act(async () => {
      await expect(result.current.getPrice(params)).rejects.toThrow(/\(400\).*unsupported asset pair/);
    });
    expect(result.current.error?.message).toMatch(/unsupported asset pair/);
    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
  });

  it("rejects a malformed anchor response", async () => {
    fetchMock.mockReturnValue(reply(200, { price: "1" }));
    const { result } = renderHook(() => useAnchorQuote({ quoteServer: SERVER }));
    await act(async () => {
      await expect(result.current.getPrice(params)).rejects.toThrow(/missing "total_price"/);
    });
  });
});

describe("validateSep38Params", () => {
  it.each([
    [{ ...params, sellAmount: undefined }, /exactly one/],
    [{ ...params, buyAmount: "5" }, /exactly one/],
    [{ ...params, sellAmount: "-1" }, /positive decimal/],
    [{ ...params, sellAmount: "abc" }, /positive decimal/],
    [{ ...params, buyAsset: params.sellAsset }, /must differ/],
    [{ ...params, sellAsset: "" }, /required/],
  ])("rejects invalid input %#", (bad, message) => {
    expect(() => validateSep38Params(bad)).toThrow(message);
  });

  it("accepts a buyAmount-only request", () => {
    expect(() => validateSep38Params({ ...params, sellAmount: undefined, buyAmount: "10.5" })).not.toThrow();
  });
});
