/**
 * @file useFriendbot.test.ts
 * @description Tests for the Friendbot funding hook (#998).
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Keypair } from "@stellar/stellar-sdk";

let network = "testnet";
vi.mock("../context", () => ({ useStellarContext: () => ({ config: { network } }) }));

import { useFriendbot } from "../hooks/useFriendbot";

const ACCOUNT = Keypair.random().publicKey();
const fetchMock = vi.fn();

const reply = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 400 ? "Bad Request" : "OK",
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  });

beforeEach(() => {
  network = "testnet";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useFriendbot", () => {
  it("funds an account and reports the transaction hash", async () => {
    fetchMock.mockReturnValue(reply(200, { hash: "abc123" }));
    const onFunded = vi.fn();
    const { result } = renderHook(() => useFriendbot({ account: ACCOUNT, onFunded }));

    let status;
    await act(async () => {
      status = await result.current.fund();
    });

    expect(status).toBe("funded");
    expect(fetchMock).toHaveBeenCalledWith(`https://friendbot.stellar.org?addr=${ACCOUNT}`);
    expect(result.current).toMatchObject({ status: "funded", isFunded: true, isAlreadyFunded: false, hash: "abc123" });
    expect(onFunded).toHaveBeenCalledWith(ACCOUNT);
  });

  it.each([
    ["detail string", { detail: "createAccountAlreadyExist" }],
    ["result codes", { extras: { result_codes: { operations: ["op_already_exists"] } } }],
  ])("reports already-funded accounts (%s) without an error", async (_label, body) => {
    fetchMock.mockReturnValue(reply(400, body));
    const onError = vi.fn();
    const { result } = renderHook(() => useFriendbot({ account: ACCOUNT, onError }));
    await act(async () => {
      await result.current.fund();
    });
    expect(result.current).toMatchObject({ status: "already_funded", isFunded: true, isAlreadyFunded: true, error: null });
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports other Friendbot failures", async () => {
    fetchMock.mockReturnValue(reply(500, { detail: "database unavailable" }));
    const onError = vi.fn();
    const { result } = renderHook(() => useFriendbot({ account: ACCOUNT, onError }));
    await act(async () => {
      await result.current.fund();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toContain("500");
    expect(result.current.error?.message).toContain("database unavailable");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports network failures", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useFriendbot({ account: ACCOUNT }));
    await act(async () => {
      await result.current.fund();
    });
    expect(result.current.error?.message).toMatch(/Could not reach Friendbot: offline/);
  });

  it("rejects invalid and missing accounts without calling Friendbot", async () => {
    const { result } = renderHook(() => useFriendbot());
    await act(async () => {
      await result.current.fund("not-a-key");
    });
    expect(result.current.error?.message).toMatch(/not a valid Stellar public key/);
    await act(async () => {
      await result.current.fund();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to run on mainnet", async () => {
    network = "mainnet";
    const { result } = renderHook(() => useFriendbot({ account: ACCOUNT }));
    await act(async () => {
      await result.current.fund();
    });
    expect(result.current.error?.message).toMatch(/only available on test networks/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the futurenet Friendbot, or a custom URL on custom networks", async () => {
    fetchMock.mockReturnValue(reply(200, {}));
    network = "futurenet";
    const future = renderHook(() => useFriendbot({ account: ACCOUNT }));
    await act(async () => {
      await future.result.current.fund();
    });
    expect(fetchMock.mock.calls[0][0]).toContain("friendbot-futurenet.stellar.org");

    network = "custom";
    const custom = renderHook(() => useFriendbot({ account: ACCOUNT, friendbotUrl: "http://localhost:8000/friendbot/" }));
    await act(async () => {
      await custom.result.current.fund();
    });
    expect(fetchMock.mock.calls[1][0]).toBe(`http://localhost:8000/friendbot?addr=${ACCOUNT}`);

    const bare = renderHook(() => useFriendbot({ account: ACCOUNT }));
    await act(async () => {
      await bare.result.current.fund();
    });
    expect(bare.result.current.error?.message).toMatch(/Pass friendbotUrl/);
  });

  it("ignores a second call while one is in flight and resets", async () => {
    let release: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((r) => (release = r)));
    const { result } = renderHook(() => useFriendbot({ account: ACCOUNT }));

    let first: Promise<unknown>;
    act(() => {
      first = result.current.fund();
    });
    expect(result.current.isFunding).toBe(true);
    await act(async () => {
      expect(await result.current.fund()).toBe("funding");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(await reply(200, {}));
      await first;
    });
    expect(result.current.status).toBe("funded");
    act(() => result.current.reset());
    expect(result.current.status).toBe("idle");
  });
});
