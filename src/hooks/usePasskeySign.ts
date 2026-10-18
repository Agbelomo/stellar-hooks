/**
 * @file usePasskeySign.ts
 * @description Hook for signing Soroban authorization entries and invocations with a passkey.
 * @package stellar-hooks
 * @license MIT
 */

import { useState, useCallback, useRef } from "react";
import { rpc, xdr } from "@stellar/stellar-sdk";
import { useOptionalStellarContext } from "../context";
import { signAuthEntry as signEntryWithPasskey } from "../utils/passkey/signAuthEntry";
import {
  authEntriesFor,
  buildInvokeTransaction,
  prepareAndSubmit,
  type InvokeContractParams,
  type PasskeyFeePayer,
  type SubmitSorobanResult,
} from "../utils/passkey/invoke";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UsePasskeySignOptions {
  /** Base64url credential ID of the passkey */
  credentialId: string | null | undefined;
  /** `C…` address of the passkey smart account */
  smartAccountAddress: string | null | undefined;
  /** Network passphrase. Defaults to the `<StellarProvider>` network. */
  networkPassphrase?: string;
  /** Soroban RPC URL. Defaults to the `<StellarProvider>` network. */
  rpcUrl?: string;
  /** Pre-built RPC server; takes precedence over `rpcUrl`. */
  sorobanRpcServer?: rpc.Server;
  /** Account that pays for and submits transactions. Required for `invoke`. */
  feePayer?: PasskeyFeePayer;
  /** Relying party ID. Defaults to the current origin's host. */
  rpId?: string;
  /** Ledgers a signature stays valid for when no expiry is given. Defaults to `100` (~8 minutes). */
  signatureTtlLedgers?: number;
}

export interface UsePasskeySignReturn {
  /** Sign one authorization entry. Fetches the latest ledger when `validUntilLedgerSeq` is omitted. */
  signAuthEntry: (
    entry: xdr.SorobanAuthorizationEntry,
    validUntilLedgerSeq?: number
  ) => Promise<xdr.SorobanAuthorizationEntry>;
  /** Sign every entry addressed to the smart account; other entries are returned unchanged. */
  signAuthEntries: (
    entries: xdr.SorobanAuthorizationEntry[],
    validUntilLedgerSeq?: number
  ) => Promise<xdr.SorobanAuthorizationEntry[]>;
  /** Simulate, passkey-authorise, and submit a contract invocation through the fee payer. */
  invoke: (params: InvokeContractParams) => Promise<SubmitSorobanResult>;
  /** True while a signature or invocation is in progress */
  isSigning: boolean;
  /** Last error, if any */
  error: Error | null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Signs individual Soroban `SorobanAuthorizationEntry` objects with a passkey,
 * enabling fine-grained authorisation of contract invocations by a passkey
 * smart account.
 *
 * @example
 * ```tsx
 * const { invoke } = usePasskeySign({ credentialId, smartAccountAddress, feePayer });
 * await invoke({
 *   contractId: xlmSac,
 *   method: "transfer",
 *   args: [from, to, amount],
 * });
 * ```
 */
export function usePasskeySign(options: UsePasskeySignOptions): UsePasskeySignReturn {
  const context = useOptionalStellarContext();
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const networkPassphrase = options.networkPassphrase ?? context?.config.networkPassphrase;
  const rpcUrl = options.rpcUrl ?? context?.config.sorobanRpcUrl;

  const getServer = useCallback((): rpc.Server => {
    const { sorobanRpcServer } = optionsRef.current;
    if (sorobanRpcServer) return sorobanRpcServer;
    if (!rpcUrl) throw new Error("rpcUrl is required");
    return new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  }, [rpcUrl]);

  const resolveExpiry = useCallback(
    async (validUntilLedgerSeq?: number): Promise<number> => {
      if (validUntilLedgerSeq !== undefined) return validUntilLedgerSeq;
      const { sequence } = await getServer().getLatestLedger();
      return sequence + (optionsRef.current.signatureTtlLedgers ?? 100);
    },
    [getServer]
  );

  const signEntries = useCallback(
    async (
      entries: xdr.SorobanAuthorizationEntry[],
      validUntilLedgerSeq?: number
    ): Promise<xdr.SorobanAuthorizationEntry[]> => {
      const { credentialId, smartAccountAddress, rpId } = optionsRef.current;
      if (!credentialId) throw new Error("credentialId is required");
      if (!smartAccountAddress) throw new Error("smartAccountAddress is required");
      if (!networkPassphrase) throw new Error("networkPassphrase is required");

      const toSign = new Set(authEntriesFor(entries, smartAccountAddress));
      if (toSign.size === 0) return entries;

      const expiry = await resolveExpiry(validUntilLedgerSeq);
      const signed: xdr.SorobanAuthorizationEntry[] = [];
      for (const entry of entries) {
        signed.push(
          toSign.has(entry)
            ? await signEntryWithPasskey(entry, {
                credentialId,
                networkPassphrase,
                validUntilLedgerSeq: expiry,
                rpId,
              })
            : entry
        );
      }
      return signed;
    },
    [networkPassphrase, resolveExpiry]
  );

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setIsSigning(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsSigning(false);
    }
  }, []);

  const signAuthEntries = useCallback(
    (entries: xdr.SorobanAuthorizationEntry[], validUntilLedgerSeq?: number) =>
      run(() => signEntries(entries, validUntilLedgerSeq)),
    [run, signEntries]
  );

  const signAuthEntry = useCallback(
    (entry: xdr.SorobanAuthorizationEntry, validUntilLedgerSeq?: number) =>
      run(async () => {
        const { smartAccountAddress } = optionsRef.current;
        if (smartAccountAddress && authEntriesFor([entry], smartAccountAddress).length === 0) {
          throw new Error("Authorization entry is not addressed to the smart account");
        }
        const [signed] = await signEntries([entry], validUntilLedgerSeq);
        return signed;
      }),
    [run, signEntries]
  );

  const invoke = useCallback(
    (params: InvokeContractParams) =>
      run(async () => {
        const { feePayer } = optionsRef.current;
        if (!feePayer) throw new Error("feePayer is required to submit transactions");
        if (!networkPassphrase) throw new Error("networkPassphrase is required");

        const submitOptions = { server: getServer(), networkPassphrase, feePayer };

        // 1. Simulate in recording mode to discover the auth entries required.
        const draft = await buildInvokeTransaction(params, submitOptions);
        const simulation = await submitOptions.server.simulateTransaction(draft);
        if (rpc.Api.isSimulationError(simulation)) {
          throw new Error(`Simulation failed: ${simulation.error}`);
        }

        // 2. Passkey-sign the entries addressed to the smart account.
        const auth = await signEntries(simulation.result?.auth ?? []);

        // 3. Rebuild with signed auth; prepare re-simulates so __check_auth is metered.
        const tx = await buildInvokeTransaction(params, submitOptions, auth);
        return prepareAndSubmit(tx, submitOptions);
      }),
    [run, signEntries, getServer, networkPassphrase]
  );

  return { signAuthEntry, signAuthEntries, invoke, isSigning, error };
}
