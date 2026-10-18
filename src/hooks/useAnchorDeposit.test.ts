/**
 * @file useAnchorDeposit.test.ts
 * @description Unit tests for the useAnchorDeposit hook (SEP-24 interactive deposit).
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnchorDeposit } from "./useAnchorDeposit";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ANCHOR_URL = "https://testanchor.stellar.org/sep24";
const JWT = "eyJhbGciOiJIUzI1NiJ9.test.token";
const ACCOUNT = "GAAZI4BCE7Y5L7S25K2LJKBJHW7X2UHLW4XY5R2DZPHFBUHE5PQ7L2UQ";

const INTERACTIVE_RESPONSE = {
  type: "interactive_customer_info_needed",
  url: "https://testanchor.stellar.org/sep24/transactions/deposit/webapp?token=abc",
  id: "82fhs729f63dh0v4",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Forbidden",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useAnchorDeposit", () => {
  it("POSTs the SEP-24 interactive deposit payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse(INTERACTIVE_RESPONSE));
    const { result } = renderHook(() => useAnchorDeposit({ anchorUrl: `${ANCHOR_URL}/`, jwt: JWT }));

    await act(async () => {
      await result.current.deposit({
        assetCode: "USDC",
        assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        account: ACCOUNT,
        amount: "100",
        claimableBalanceSupported: true,
        memo: "12345",
        memoType: "id",
        lang: "en",
        walletName: "Demo Wallet",
        extraFields: { email_address: "alice@example.com" },
      });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ANCHOR_URL}/transactions/deposit/interactive`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${JWT}`,
    });
    expect(JSON.parse(init.body)).toEqual({
      asset_code: "USDC",
      asset_issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      account: ACCOUNT,
      amount: "100",
      claimable_balance_supported: true,
      memo: "12345",
      memo_type: "id",
      lang: "en",
      wallet_name: "Demo Wallet",
      email_address: "alice@example.com",
    });
  });

  it("sends only the asset code when no optional fields are given", async () => {
    fetchMock.mockResolvedValue(jsonResponse(INTERACTIVE_RESPONSE));
    const { result } = renderHook(() => useAnchorDeposit({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    await act(async () => {
      await result.current.deposit({ assetCode: "SRT" });
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ asset_code: "SRT" });
  });

  it("extracts the interactive URL and transaction ID", async () => {
    fetchMock.mockResolvedValue(jsonResponse(INTERACTIVE_RESPONSE));
    const { result } = renderHook(() => useAnchorDeposit({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    let response: Awaited<ReturnType<typeof result.current.deposit>> | undefined;
    await act(async () => {
      response = await result.current.deposit({ assetCode: "USDC" });
    });

    expect(response).toEqual(INTERACTIVE_RESPONSE);
    expect(result.current.url).toBe(INTERACTIVE_RESPONSE.url);
    expect(result.current.transactionId).toBe(INTERACTIVE_RESPONSE.id);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the anchor's error message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "asset not supported" }, 403));
    const { result } = renderHook(() => useAnchorDeposit({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    await act(async () => {
      await expect(result.current.deposit({ assetCode: "FOO" })).rejects.toThrow(
        /403.*asset not supported/
      );
    });
    expect(result.current.error?.message).toMatch(/asset not supported/);
    expect(result.current.url).toBeNull();
  });

  it("rejects unexpected response shapes", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ type: "non_interactive_customer_info_needed" }));
    const { result } = renderHook(() => useAnchorDeposit({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    await act(async () => {
      await expect(result.current.deposit({ assetCode: "USDC" })).rejects.toThrow(/unexpected/);
    });
  });

  it("requires a JWT", async () => {
    const { result } = renderHook(() => useAnchorDeposit({ anchorUrl: ANCHOR_URL, jwt: null }));

    await act(async () => {
      await expect(result.current.deposit({ assetCode: "USDC" })).rejects.toThrow(/jwt/);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reset clears the last response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(INTERACTIVE_RESPONSE));
    const { result } = renderHook(() => useAnchorDeposit({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    await act(async () => {
      await result.current.deposit({ assetCode: "USDC" });
    });
    act(() => result.current.reset());
    expect(result.current.url).toBeNull();
    expect(result.current.transactionId).toBeNull();
  });
});
