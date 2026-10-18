/**
 * @file useAnchorInfo.test.ts
 * @description Unit tests for the useAnchorInfo hook (SEP-1 anchor discovery).
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAnchorInfo, stellarTomlUrl } from "./useAnchorInfo";
import { clearCache } from "../utils";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DOMAIN = "testanchor.stellar.org";

const STELLAR_TOML = `
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
SIGNING_KEY = "GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR"
TRANSFER_SERVER = "https://testanchor.stellar.org/sep6"
TRANSFER_SERVER_SEP0024 = "https://testanchor.stellar.org/sep24"
WEB_AUTH_ENDPOINT = "https://testanchor.stellar.org/auth"
KYC_SERVER = "https://testanchor.stellar.org/sep12"

[DOCUMENTATION]
ORG_NAME = "Stellar Development Foundation"

[[CURRENCIES]]
code = "SRT"
issuer = "GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B"
display_decimals = 2

[[CURRENCIES]]
code = "USDC"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
display_decimals = 2
`;

function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    text: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  clearCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("stellarTomlUrl", () => {
  it("builds the SEP-1 well-known URL", () => {
    expect(stellarTomlUrl(DOMAIN)).toBe("https://testanchor.stellar.org/.well-known/stellar.toml");
    expect(stellarTomlUrl("https://example.com/")).toBe("https://example.com/.well-known/stellar.toml");
    expect(stellarTomlUrl("localhost:8000", true)).toBe("http://localhost:8000/.well-known/stellar.toml");
  });
});

describe("useAnchorInfo", () => {
  it("fetches stellar.toml from the well-known location", async () => {
    fetchMock.mockResolvedValue(textResponse(STELLAR_TOML));
    renderHook(() => useAnchorInfo({ domain: DOMAIN }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(`https://${DOMAIN}/.well-known/stellar.toml`);
  });

  it("parses SEP-24, SEP-10, SEP-12 endpoints and currencies", async () => {
    fetchMock.mockResolvedValue(textResponse(STELLAR_TOML));
    const { result } = renderHook(() => useAnchorInfo({ domain: DOMAIN }));

    await waitFor(() => expect(result.current.info).not.toBeNull());
    expect(result.current.transferServer).toBe("https://testanchor.stellar.org/sep24");
    expect(result.current.transferServerSep6).toBe("https://testanchor.stellar.org/sep6");
    expect(result.current.webAuthEndpoint).toBe("https://testanchor.stellar.org/auth");
    expect(result.current.kycServer).toBe("https://testanchor.stellar.org/sep12");
    expect(result.current.signingKey).toBe("GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR");
    expect(result.current.currencies.map((c) => c.code)).toEqual(["SRT", "USDC"]);
    expect(result.current.currencies[1].display_decimals).toBe(2);
    expect(result.current.info?.DOCUMENTATION?.ORG_NAME).toBe("Stellar Development Foundation");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns nulls and an empty currency list for missing fields", async () => {
    fetchMock.mockResolvedValue(textResponse('VERSION = "2.0.0"'));
    const { result } = renderHook(() => useAnchorInfo({ domain: "bare.example.com" }));

    await waitFor(() => expect(result.current.info).not.toBeNull());
    expect(result.current.transferServer).toBeNull();
    expect(result.current.webAuthEndpoint).toBeNull();
    expect(result.current.currencies).toEqual([]);
  });

  it("caches results per domain", async () => {
    fetchMock.mockResolvedValue(textResponse(STELLAR_TOML));
    const first = renderHook(() => useAnchorInfo({ domain: DOMAIN }));
    await waitFor(() => expect(first.result.current.info).not.toBeNull());

    const second = renderHook(() => useAnchorInfo({ domain: DOMAIN }));
    await waitFor(() => expect(second.result.current.transferServer).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetch bypasses the cache", async () => {
    fetchMock.mockResolvedValue(textResponse(STELLAR_TOML));
    const { result } = renderHook(() => useAnchorInfo({ domain: DOMAIN }));
    await waitFor(() => expect(result.current.info).not.toBeNull());

    fetchMock.mockResolvedValue(
      textResponse('TRANSFER_SERVER_SEP0024 = "https://new.example.com/sep24"')
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.transferServer).toBe("https://new.example.com/sep24");
  });

  it("surfaces HTTP errors", async () => {
    fetchMock.mockResolvedValue(textResponse("", 404));
    const { result } = renderHook(() => useAnchorInfo({ domain: "missing.example.com" }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toContain("404");
    expect(result.current.info).toBeNull();
  });

  it("surfaces TOML parse errors", async () => {
    fetchMock.mockResolvedValue(textResponse("NOT VALID TOML"));
    const { result } = renderHook(() => useAnchorInfo({ domain: "broken.example.com" }));

    await waitFor(() => expect(result.current.error?.message).toMatch(/Invalid stellar.toml/));
  });

  it("does not fetch without a domain", async () => {
    const { result } = renderHook(() => useAnchorInfo({ domain: null }));
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.info).toBeNull();
  });
});
