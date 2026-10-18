/**
 * @file useRecoverySigners.test.ts
 * @description Unit tests for the useRecoverySigners hook (smart account recovery management).
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { Address, Keypair, scValToNative } from "@stellar/stellar-sdk";
import {
  useRecoverySigners,
  previewRecoverySignerRemoval,
  totalRecoveryWeight,
} from "./useRecoverySigners";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const SIGNER_A = Keypair.random().publicKey();
const SIGNER_B = Keypair.random().publicKey();
const SIGNER_C = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

const invoke = vi.fn();

beforeEach(() => {
  invoke.mockReset().mockResolvedValue({ hash: "tx-hash" });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe("recovery weight helpers", () => {
  it("sums weights, defaulting to 1", () => {
    expect(totalRecoveryWeight([{ key: SIGNER_A }, { key: SIGNER_B, weight: 3 }])).toBe(4);
  });

  it("flags removals that drop below the threshold", () => {
    const signers = [{ key: SIGNER_A }, { key: SIGNER_B }];
    expect(previewRecoverySignerRemoval(signers, SIGNER_A, 1)).toEqual({
      remainingWeight: 1,
      threshold: 1,
      warning: null,
    });
    expect(previewRecoverySignerRemoval(signers, SIGNER_A, 2)).toEqual({
      remainingWeight: 1,
      threshold: 2,
      warning: "RECOVERY_THRESHOLD_LOW",
    });
  });
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

describe("useRecoverySigners", () => {
  it("loads signers via fetchSigners", async () => {
    const fetchSigners = vi.fn().mockResolvedValue([{ key: SIGNER_A }, { key: SIGNER_B }]);
    const { result } = renderHook(() =>
      useRecoverySigners({ smartAccountAddress: ACCOUNT, threshold: 2, invoke, fetchSigners })
    );

    await waitFor(() => expect(result.current.signers).toHaveLength(2));
    expect(fetchSigners).toHaveBeenCalledWith(ACCOUNT);
    expect(result.current.totalWeight).toBe(2);
    expect(result.current.isRecoverable).toBe(true);
    expect(result.current.warning).toBeNull();
  });

  it("adds a recovery signer on the smart account", async () => {
    const { result } = renderHook(() =>
      useRecoverySigners({ smartAccountAddress: ACCOUNT, threshold: 1, invoke })
    );
    expect(result.current.warning).toBe("RECOVERY_THRESHOLD_LOW");

    await act(async () => {
      await result.current.addRecoverySigner({ key: SIGNER_C, weight: 2 });
    });

    const call = invoke.mock.calls[0][0];
    expect(call.contractId).toBe(ACCOUNT);
    expect(call.method).toBe("add_recovery_signer");
    expect(Address.fromScVal(call.args[0]).toString()).toBe(SIGNER_C);
    expect(scValToNative(call.args[1])).toBe(2);

    expect(result.current.signers).toEqual([{ key: SIGNER_C, weight: 2 }]);
    expect(result.current.totalWeight).toBe(2);
    expect(result.current.warning).toBeNull();
  });

  it("uses custom method names", async () => {
    const { result } = renderHook(() =>
      useRecoverySigners({
        smartAccountAddress: ACCOUNT,
        threshold: 1,
        invoke,
        initialSigners: [{ key: SIGNER_A }, { key: SIGNER_B }],
        methods: { add: "add_signer", remove: "remove_signer" },
      })
    );

    await act(async () => {
      await result.current.addRecoverySigner({ key: SIGNER_C });
      await result.current.removeRecoverySigner(SIGNER_A);
    });
    expect(invoke.mock.calls.map((c) => c[0].method)).toEqual(["add_signer", "remove_signer"]);
  });

  it("rejects duplicate signers and invalid weights", async () => {
    const { result } = renderHook(() =>
      useRecoverySigners({
        smartAccountAddress: ACCOUNT,
        threshold: 1,
        invoke,
        initialSigners: [{ key: SIGNER_A }],
      })
    );

    await expect(result.current.addRecoverySigner({ key: SIGNER_A })).rejects.toThrow(/already/);
    await expect(result.current.addRecoverySigner({ key: SIGNER_B, weight: 0 })).rejects.toThrow(
      /positive integer/
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("removes a signer when the threshold is still met", async () => {
    const { result } = renderHook(() =>
      useRecoverySigners({
        smartAccountAddress: ACCOUNT,
        threshold: 1,
        invoke,
        initialSigners: [{ key: SIGNER_A }, { key: SIGNER_B }],
      })
    );

    let outcome: Awaited<ReturnType<typeof result.current.removeRecoverySigner>> | undefined;
    await act(async () => {
      outcome = await result.current.removeRecoverySigner(SIGNER_A);
    });

    expect(outcome).toEqual({ status: "removed", hash: "tx-hash", warning: null });
    const call = invoke.mock.calls[0][0];
    expect(call.method).toBe("remove_recovery_signer");
    expect(Address.fromScVal(call.args[0]).toString()).toBe(SIGNER_A);
    expect(result.current.signers).toEqual([{ key: SIGNER_B }]);
    expect(result.current.warning).toBeNull();
  });

  it("warns and requires confirmation when removal drops below the threshold", async () => {
    const { result } = renderHook(() =>
      useRecoverySigners({
        smartAccountAddress: ACCOUNT,
        threshold: 2,
        invoke,
        initialSigners: [{ key: SIGNER_A }, { key: SIGNER_B }],
      })
    );

    let outcome: Awaited<ReturnType<typeof result.current.removeRecoverySigner>> | undefined;
    await act(async () => {
      outcome = await result.current.removeRecoverySigner(SIGNER_A);
    });

    expect(outcome).toEqual({
      status: "confirmation_required",
      warning: "RECOVERY_THRESHOLD_LOW",
      remainingWeight: 1,
      threshold: 2,
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.warning).toBe("RECOVERY_THRESHOLD_LOW");
    expect(result.current.pendingRemoval).toBe(SIGNER_A);
    expect(result.current.signers).toHaveLength(2);
  });

  it("removes after explicit confirmation and keeps the warning", async () => {
    const { result } = renderHook(() =>
      useRecoverySigners({
        smartAccountAddress: ACCOUNT,
        threshold: 2,
        invoke,
        initialSigners: [{ key: SIGNER_A }, { key: SIGNER_B }],
      })
    );

    await act(async () => {
      await result.current.removeRecoverySigner(SIGNER_A);
    });
    let outcome: Awaited<ReturnType<typeof result.current.removeRecoverySigner>> | undefined;
    await act(async () => {
      outcome = await result.current.removeRecoverySigner(SIGNER_A, { confirm: true });
    });

    expect(outcome).toEqual({ status: "removed", hash: "tx-hash", warning: "RECOVERY_THRESHOLD_LOW" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.current.pendingRemoval).toBeNull();
    expect(result.current.isRecoverable).toBe(false);
    expect(result.current.warning).toBe("RECOVERY_THRESHOLD_LOW");
  });

  it("clears a pending removal on cancel", async () => {
    const { result } = renderHook(() =>
      useRecoverySigners({
        smartAccountAddress: ACCOUNT,
        threshold: 2,
        invoke,
        initialSigners: [{ key: SIGNER_A }, { key: SIGNER_B }],
      })
    );

    await act(async () => {
      await result.current.removeRecoverySigner(SIGNER_B);
    });
    act(() => result.current.cancelRemoval());

    expect(result.current.pendingRemoval).toBeNull();
    expect(result.current.warning).toBeNull();
  });

  it("surfaces invoke failures without changing signers", async () => {
    invoke.mockRejectedValue(new Error("simulation failed"));
    const { result } = renderHook(() =>
      useRecoverySigners({
        smartAccountAddress: ACCOUNT,
        threshold: 1,
        invoke,
        initialSigners: [{ key: SIGNER_A }],
      })
    );

    await act(async () => {
      await expect(result.current.addRecoverySigner({ key: SIGNER_B })).rejects.toThrow(
        "simulation failed"
      );
    });
    expect(result.current.error?.message).toBe("simulation failed");
    expect(result.current.signers).toEqual([{ key: SIGNER_A }]);
    expect(result.current.isSubmitting).toBe(false);
  });
});
