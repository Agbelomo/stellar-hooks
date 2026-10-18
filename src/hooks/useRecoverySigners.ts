/**
 * @file useRecoverySigners.ts
 * @description Hook for managing passkey smart account recovery signers with threshold safety checks.
 * @package stellar-hooks
 * @license MIT
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { InvokeContractParams, SubmitSorobanResult } from "../utils/passkey/invoke";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A recovery key registered on the smart account. */
export interface RecoverySigner {
  /** `G…` or `C…` address of the recovery signer */
  key: string;
  /** Recovery weight contributed by this signer. Defaults to `1`. */
  weight?: number;
}

/** Warning raised when recovery capacity would drop below the threshold. */
export type RecoveryWarning = "RECOVERY_THRESHOLD_LOW";

export interface RecoveryRemovalPreview {
  /** Total recovery weight remaining after the removal */
  remainingWeight: number;
  /** Weight required to recover the account */
  threshold: number;
  /** Set when `remainingWeight < threshold` */
  warning: RecoveryWarning | null;
}

export type RemoveRecoverySignerResult =
  | { status: "removed"; hash: string; warning: RecoveryWarning | null }
  | ({ status: "confirmation_required" } & RecoveryRemovalPreview & { warning: RecoveryWarning });

export interface UseRecoverySignersOptions {
  /** `C…` address of the passkey smart account */
  smartAccountAddress: string | null | undefined;
  /** Total recovery weight required to recover the account */
  threshold: number;
  /**
   * Submits a contract invocation authorised by the account owner, e.g.
   * `usePasskeySign(...).invoke`.
   */
  invoke: (params: InvokeContractParams) => Promise<SubmitSorobanResult>;
  /** Loads the current recovery signers from the contract or an indexer */
  fetchSigners?: (smartAccountAddress: string) => Promise<RecoverySigner[]>;
  /** Known signers, used until (or instead of) `fetchSigners` */
  initialSigners?: RecoverySigner[];
  /** Contract function names. Defaults to `add_recovery_signer` / `remove_recovery_signer`. */
  methods?: { add?: string; remove?: string };
}

export interface UseRecoverySignersReturn {
  /** Current recovery signers */
  signers: RecoverySigner[];
  /** Sum of all signer weights */
  totalWeight: number;
  /** Weight required to recover the account */
  threshold: number;
  /** True while `totalWeight >= threshold` */
  isRecoverable: boolean;
  /** Safety warning for the current state or a pending removal */
  warning: RecoveryWarning | null;
  /** Signer whose removal is awaiting confirmation */
  pendingRemoval: string | null;
  /** Register a recovery signer (args: `address, u32 weight`) */
  addRecoverySigner: (signer: RecoverySigner) => Promise<SubmitSorobanResult>;
  /**
   * Remove a recovery signer (args: `address`). When the removal would leave
   * less than `threshold` weight, nothing is submitted and
   * `{ status: "confirmation_required" }` is returned unless `confirm` is set.
   */
  removeRecoverySigner: (
    key: string,
    opts?: { confirm?: boolean }
  ) => Promise<RemoveRecoverySignerResult>;
  /** Compute the effect of removing `key` without submitting anything */
  previewRemoval: (key: string) => RecoveryRemovalPreview;
  /** Dismiss a pending removal confirmation */
  cancelRemoval: () => void;
  /** Reload signers via `fetchSigners` */
  refetch: () => Promise<void>;
  isLoading: boolean;
  isSubmitting: boolean;
  error: Error | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const weightOf = (signer: RecoverySigner) => signer.weight ?? 1;

/** Sum the weights of `signers`. */
export function totalRecoveryWeight(signers: RecoverySigner[]): number {
  return signers.reduce((sum, s) => sum + weightOf(s), 0);
}

/** Preview the recovery capacity left after removing `key` from `signers`. */
export function previewRecoverySignerRemoval(
  signers: RecoverySigner[],
  key: string,
  threshold: number
): RecoveryRemovalPreview {
  const remainingWeight = totalRecoveryWeight(signers.filter((s) => s.key !== key));
  return {
    remainingWeight,
    threshold,
    warning: remainingWeight < threshold ? "RECOVERY_THRESHOLD_LOW" : null,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Manages recovery signers on a passkey smart account and guards against
 * removals that would leave the account unrecoverable.
 *
 * @example
 * ```tsx
 * const { invoke } = usePasskeySign({ credentialId, smartAccountAddress, feePayer });
 * const recovery = useRecoverySigners({ smartAccountAddress, threshold: 2, invoke });
 *
 * const result = await recovery.removeRecoverySigner("G…");
 * if (result.status === "confirmation_required") {
 *   // show result.warning, then:
 *   await recovery.removeRecoverySigner("G…", { confirm: true });
 * }
 * ```
 */
export function useRecoverySigners(options: UseRecoverySignersOptions): UseRecoverySignersReturn {
  const { smartAccountAddress, threshold, fetchSigners, initialSigners } = options;

  const [signers, setSigners] = useState<RecoverySigner[]>(initialSigners ?? []);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const signersRef = useRef(signers);
  signersRef.current = signers;

  const refetch = useCallback(async (): Promise<void> => {
    if (!smartAccountAddress || !fetchSigners) return;
    setIsLoading(true);
    setError(null);
    try {
      setSigners(await fetchSigners(smartAccountAddress));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [smartAccountAddress, fetchSigners]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const submit = useCallback(async (method: string, args: xdr.ScVal[]) => {
    const { smartAccountAddress: address, invoke } = optionsRef.current;
    if (!address) throw new Error("smartAccountAddress is required");
    setIsSubmitting(true);
    setError(null);
    try {
      return await invoke({ contractId: address, method, args });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const addRecoverySigner = useCallback(
    async (signer: RecoverySigner): Promise<SubmitSorobanResult> => {
      const weight = weightOf(signer);
      if (!Number.isInteger(weight) || weight < 1) {
        throw new Error("Recovery signer weight must be a positive integer");
      }
      if (signersRef.current.some((s) => s.key === signer.key)) {
        throw new Error(`${signer.key} is already a recovery signer`);
      }
      const result = await submit(optionsRef.current.methods?.add ?? "add_recovery_signer", [
        nativeToScVal(signer.key, { type: "address" }),
        nativeToScVal(weight, { type: "u32" }),
      ]);
      setSigners((prev) => [...prev, { key: signer.key, weight }]);
      return result;
    },
    [submit]
  );

  const previewRemoval = useCallback(
    (key: string) => previewRecoverySignerRemoval(signersRef.current, key, threshold),
    [threshold]
  );

  const removeRecoverySigner = useCallback(
    async (key: string, opts: { confirm?: boolean } = {}): Promise<RemoveRecoverySignerResult> => {
      if (!signersRef.current.some((s) => s.key === key)) {
        throw new Error(`${key} is not a recovery signer`);
      }
      const preview = previewRecoverySignerRemoval(signersRef.current, key, threshold);
      if (preview.warning && !opts.confirm) {
        setPendingRemoval(key);
        return { status: "confirmation_required", ...preview, warning: preview.warning };
      }

      const result = await submit(optionsRef.current.methods?.remove ?? "remove_recovery_signer", [
        nativeToScVal(key, { type: "address" }),
      ]);
      setSigners((prev) => prev.filter((s) => s.key !== key));
      setPendingRemoval(null);
      return { status: "removed", hash: result.hash, warning: preview.warning };
    },
    [submit, threshold]
  );

  const cancelRemoval = useCallback(() => setPendingRemoval(null), []);

  const totalWeight = totalRecoveryWeight(signers);
  const isRecoverable = totalWeight >= threshold;

  return {
    signers,
    totalWeight,
    threshold,
    isRecoverable,
    warning: pendingRemoval !== null || !isRecoverable ? "RECOVERY_THRESHOLD_LOW" : null,
    pendingRemoval,
    addRecoverySigner,
    removeRecoverySigner,
    previewRemoval,
    cancelRemoval,
    refetch,
    isLoading,
    isSubmitting,
    error,
  };
}
