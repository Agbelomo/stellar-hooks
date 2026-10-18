/**
 * @file useAnchorTransactionStatus.test.ts
 * @description Unit tests for the useAnchorTransactionStatus hook (SEP-24 transaction polling).
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useAnchorTransactionStatus,
  isTerminalAnchorStatus,
  type AnchorTransactionStatus,
} from "./useAnchorTransactionStatus";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANCHOR_URL = "https://testanchor.stellar.org/sep24";
const TX_ID = "82fhs729f63dh0v4";
const JWT = "eyJhbGciOiJIUzI1NiJ9.test.token";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function txResponse(status: AnchorTransactionStatus) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ transaction: { id: TX_ID, kind: "deposit", status } }),
  } as Response;
}

/** Flush pending promises and advance fake timers inside act(). */
async function advance(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("isTerminalAnchorStatus", () => {
  it.each(["completed", "refunded", "expired", "no_market", "error"] as const)(
    "treats %s as terminal",
    (status) => {
      expect(isTerminalAnchorStatus(status)).toBe(true);
    }
  );

  it.each(["incomplete", "pending_anchor", "pending_user_transfer_start"] as const)(
    "treats %s as non-terminal",
    (status) => {
      expect(isTerminalAnchorStatus(status)).toBe(false);
    }
  );

  it("treats null as non-terminal", () => {
    expect(isTerminalAnchorStatus(null)).toBe(false);
  });
});

describe("useAnchorTransactionStatus", () => {
  it("fetches the transaction on mount with the JWT", async () => {
    fetchMock.mockResolvedValue(txResponse("pending_anchor"));

    const { result } = renderHook(() =>
      useAnchorTransactionStatus({ anchorUrl: ANCHOR_URL, transactionId: TX_ID, jwt: JWT })
    );
    await advance();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ANCHOR_URL}/transaction?id=${TX_ID}`);
    expect(init.headers).toEqual({ Authorization: `Bearer ${JWT}` });
    expect(result.current.status).toBe("pending_anchor");
    expect(result.current.transaction?.id).toBe(TX_ID);
    expect(result.current.isPolling).toBe(true);
  });

  it("polls at the configured interval", async () => {
    fetchMock.mockResolvedValue(txResponse("pending_anchor"));

    renderHook(() =>
      useAnchorTransactionStatus({
        anchorUrl: ANCHOR_URL,
        transactionId: TX_ID,
        jwt: JWT,
        pollIntervalMs: 1000,
      })
    );
    await advance();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops polling once a terminal status is reached", async () => {
    fetchMock
      .mockResolvedValueOnce(txResponse("pending_anchor"))
      .mockResolvedValueOnce(txResponse("pending_stellar"))
      .mockResolvedValue(txResponse("completed"));

    const { result } = renderHook(() =>
      useAnchorTransactionStatus({
        anchorUrl: ANCHOR_URL,
        transactionId: TX_ID,
        jwt: JWT,
        pollIntervalMs: 1000,
      })
    );
    await advance();
    await advance(1000);
    await advance(1000);

    expect(result.current.status).toBe("completed");
    expect(result.current.isPolling).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("clears timers on unmount", async () => {
    fetchMock.mockResolvedValue(txResponse("pending_anchor"));

    const { unmount } = renderHook(() =>
      useAnchorTransactionStatus({
        anchorUrl: ANCHOR_URL,
        transactionId: TX_ID,
        jwt: JWT,
        pollIntervalMs: 1000,
      })
    );
    await advance();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    await advance(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("restarts polling when the transaction ID changes", async () => {
    fetchMock.mockResolvedValue(txResponse("pending_anchor"));

    const { rerender } = renderHook(
      ({ id }) =>
        useAnchorTransactionStatus({
          anchorUrl: ANCHOR_URL,
          transactionId: id,
          jwt: JWT,
          pollIntervalMs: 1000,
        }),
      { initialProps: { id: TX_ID } }
    );
    await advance();

    rerender({ id: "other-tx" });
    await advance();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${ANCHOR_URL}/transaction?id=other-tx`);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("refetch triggers an immediate request and resets the poll timer", async () => {
    fetchMock.mockResolvedValue(txResponse("pending_anchor"));

    const { result } = renderHook(() =>
      useAnchorTransactionStatus({
        anchorUrl: ANCHOR_URL,
        transactionId: TX_ID,
        jwt: JWT,
        pollIntervalMs: 1000,
      })
    );
    await advance();
    await advance(500);

    await act(async () => {
      await result.current.refetch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await advance(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refetch fetches again after a terminal status", async () => {
    fetchMock
      .mockResolvedValueOnce(txResponse("error"))
      .mockResolvedValue(txResponse("refunded"));

    const { result } = renderHook(() =>
      useAnchorTransactionStatus({ anchorUrl: ANCHOR_URL, transactionId: TX_ID, jwt: JWT })
    );
    await advance();
    expect(result.current.status).toBe("error");
    expect(result.current.isPolling).toBe(false);

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.status).toBe("refunded");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces HTTP errors and keeps polling", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable" } as Response)
      .mockResolvedValue(txResponse("pending_anchor"));

    const { result } = renderHook(() =>
      useAnchorTransactionStatus({
        anchorUrl: ANCHOR_URL,
        transactionId: TX_ID,
        jwt: JWT,
        pollIntervalMs: 1000,
      })
    );
    await advance();
    expect(result.current.error?.message).toContain("503");
    expect(result.current.isPolling).toBe(true);

    await advance(1000);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("pending_anchor");
  });

  it("does nothing when required params are missing", async () => {
    const { result } = renderHook(() =>
      useAnchorTransactionStatus({ anchorUrl: ANCHOR_URL, transactionId: null, jwt: JWT })
    );
    await advance(10_000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isPolling).toBe(false);
    expect(result.current.status).toBeNull();
  });
});
