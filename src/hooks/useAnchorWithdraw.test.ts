/**
 * @file useAnchorWithdraw.test.ts
 * @description Unit tests for the useAnchorWithdraw hook (SEP-24 interactive withdrawal).
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Account, Asset, Horizon, Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { useAnchorWithdraw, parseSep38Asset, sep24Memo } from "./useAnchorWithdraw";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ANCHOR_URL = "https://testanchor.stellar.org/sep24";
const JWT = "eyJhbGciOiJIUzI1NiJ9.test.token";
const WALLET = Keypair.random().publicKey();
const ANCHOR_ACCOUNT = Keypair.random().publicKey();
const USDC_ISSUER = Keypair.random().publicKey();
const TX_ID = "82fhs729f63dh0v4";

const INTERACTIVE_RESPONSE = {
  type: "interactive_customer_info_needed",
  url: "https://testanchor.stellar.org/sep24/transactions/withdraw/webapp?token=abc",
  id: TX_ID,
};

function anchorTx(overrides: Record<string, unknown> = {}) {
  return {
    transaction: {
      id: TX_ID,
      kind: "withdrawal",
      status: "pending_user_transfer_start",
      amount_in: "50.5",
      amount_in_asset: `stellar:USDC:${USDC_ISSUER}`,
      withdraw_anchor_account: ANCHOR_ACCOUNT,
      withdraw_memo: "123456789",
      withdraw_memo_type: "id",
      ...overrides,
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const fetchMock = vi.fn();
const horizonServer = {
  loadAccount: vi.fn(async (id: string) => new Account(id, "100")),
} as unknown as Horizon.Server;

function renderWithdraw() {
  return renderHook(() =>
    useAnchorWithdraw({
      anchorUrl: ANCHOR_URL,
      jwt: JWT,
      walletAccount: WALLET,
      networkPassphrase: Networks.TESTNET,
      horizonServer,
    })
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe("parseSep38Asset", () => {
  it("parses issued and native assets", () => {
    expect(parseSep38Asset(`stellar:USDC:${USDC_ISSUER}`).equals(new Asset("USDC", USDC_ISSUER))).toBe(true);
    expect(parseSep38Asset("stellar:native").isNative()).toBe(true);
  });

  it("rejects off-chain or malformed identifiers", () => {
    expect(() => parseSep38Asset("iso4217:USD")).toThrow(/Unsupported/);
    expect(() => parseSep38Asset("stellar:USDC")).toThrow(/issuer/);
  });
});

describe("sep24Memo", () => {
  it("builds text, id, and base64 hash memos", () => {
    expect(sep24Memo("hello", "text").value).toBe("hello");
    expect(sep24Memo("42", "id").value).toBe("42");
    const hash = Buffer.alloc(32, 7);
    expect(Buffer.from(sep24Memo(hash.toString("base64"), "hash").value as Buffer).equals(hash)).toBe(true);
    expect(sep24Memo(undefined, undefined).type).toBe("none");
  });
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

describe("useAnchorWithdraw", () => {
  it("POSTs an interactive withdrawal and exposes the URL and ID", async () => {
    fetchMock.mockResolvedValue(jsonResponse(INTERACTIVE_RESPONSE));
    const { result } = renderWithdraw();

    await act(async () => {
      await result.current.withdraw({ assetCode: "USDC", amount: "50.5" });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ANCHOR_URL}/transactions/withdraw/interactive`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${JWT}`);
    expect(JSON.parse(init.body)).toEqual({ asset_code: "USDC", amount: "50.5", account: WALLET });
    expect(result.current.url).toBe(INTERACTIVE_RESPONSE.url);
    expect(result.current.transactionId).toBe(TX_ID);
  });

  it("builds a payment to the anchor account with its memo", async () => {
    fetchMock.mockResolvedValue(jsonResponse(anchorTx()));
    const { result } = renderWithdraw();

    let payment: Awaited<ReturnType<typeof result.current.buildWithdrawalPayment>> | undefined;
    await act(async () => {
      payment = await result.current.buildWithdrawalPayment({ transactionId: TX_ID });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ANCHOR_URL}/transaction?id=${TX_ID}`);
    expect(init.headers.Authorization).toBe(`Bearer ${JWT}`);
    expect(horizonServer.loadAccount).toHaveBeenCalledWith(WALLET);

    const tx = TransactionBuilder.fromXDR(payment!.xdr, Networks.TESTNET);
    expect("source" in tx && tx.source).toBe(WALLET);
    expect(tx.memo.type).toBe("id");
    expect(tx.memo.value).toBe("123456789");
    expect(tx.operations).toHaveLength(1);

    const op = tx.operations[0];
    expect(op.type).toBe("payment");
    if (op.type === "payment") {
      expect(op.destination).toBe(ANCHOR_ACCOUNT);
      expect(op.amount).toBe("50.5000000");
      expect(op.asset.equals(new Asset("USDC", USDC_ISSUER))).toBe(true);
    }
    expect(payment!.destination).toBe(ANCHOR_ACCOUNT);
  });

  it("supports text memos, legacy field names, and amount/asset overrides", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        anchorTx({
          withdraw_anchor_account: undefined,
          withdraw_memo: undefined,
          withdraw_memo_type: undefined,
          amount_in_asset: undefined,
          account_id: ANCHOR_ACCOUNT,
          memo: "ref-42",
          memo_type: "text",
        })
      )
    );
    const { result } = renderWithdraw();

    let payment: Awaited<ReturnType<typeof result.current.buildWithdrawalPayment>> | undefined;
    await act(async () => {
      payment = await result.current.buildWithdrawalPayment({
        transactionId: TX_ID,
        amount: "10",
        asset: Asset.native(),
      });
    });

    expect(payment!.destination).toBe(ANCHOR_ACCOUNT);
    expect(payment!.memo.value).toBe("ref-42");
    expect(payment!.amount).toBe("10");
    expect(payment!.asset.isNative()).toBe(true);
  });

  it("refuses to build before the anchor is ready for the transfer", async () => {
    fetchMock.mockResolvedValue(jsonResponse(anchorTx({ status: "incomplete" })));
    const { result } = renderWithdraw();

    await act(async () => {
      await expect(result.current.buildWithdrawalPayment({ transactionId: TX_ID })).rejects.toThrow(
        /pending_user_transfer_start/
      );
    });
    expect(result.current.error).not.toBeNull();
  });

  it("refuses to build a payment for a deposit", async () => {
    fetchMock.mockResolvedValue(jsonResponse(anchorTx({ kind: "deposit" })));
    const { result } = renderWithdraw();

    await act(async () => {
      await expect(result.current.buildWithdrawalPayment({ transactionId: TX_ID })).rejects.toThrow(
        /not a withdrawal/
      );
    });
  });

  it("requires a destination account from the anchor", async () => {
    fetchMock.mockResolvedValue(jsonResponse(anchorTx({ withdraw_anchor_account: undefined })));
    const { result } = renderWithdraw();

    await act(async () => {
      await expect(result.current.buildWithdrawalPayment({ transactionId: TX_ID })).rejects.toThrow(
        /withdrawal account/
      );
    });
  });

  it("surfaces anchor errors from the interactive request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "unsupported asset" }, 400));
    const { result } = renderWithdraw();

    await act(async () => {
      await expect(result.current.withdraw({ assetCode: "FOO" })).rejects.toThrow(/unsupported asset/);
    });
    expect(result.current.url).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
