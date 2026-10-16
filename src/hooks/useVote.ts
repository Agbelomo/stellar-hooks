/**
 * @file useVote.ts
 * @description Hook that submits a vote on a proposal and exposes whether the connected account has already voted.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  Account,
  Address,
  Contract,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import * as rpc from "@stellar/stellar-sdk/rpc";
import { useStellarContext } from "../context";
import { useFreighter } from "./useFreighter";
import { useTransactionCore } from "./useTransactionCore";
import type { TransactionStatus, StellarTransactionError } from "../types";
import { unsafeAsXdrString } from "../types";
import { validateContractId, validatePublicKey } from "../utils";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Vote support option:
 * 0 = Against
 * 1 = For
 * 2 = Abstain
 */
export type VoteSupport = "for" | "against" | "abstain" | 0 | 1 | 2;

export interface CastVoteParams {
  proposalId: string | number;
  support: VoteSupport;
}

export interface UseVoteOptions {
  /** Soroban Governor contract address (`C...`) */
  contractId: string;
  /** Proposal ID to monitor voting status for. Optional. */
  proposalId?: string | number;
  /** Base fee in stroops. Default: 100 */
  fee?: number;
  /** Polling timeout in seconds. Default: 60 */
  timeoutSeconds?: number;
  /** Callback fired when the vote transaction is confirmed */
  onSuccess?: (hash: string) => void;
  /** Callback fired when the transaction fails */
  onError?: (error: StellarTransactionError) => void;
}

export interface UseVoteReturn {
  /** Submit a vote on the proposal */
  vote: (params?: CastVoteParams) => Promise<void>;
  /** Whether the connected account has already voted on this proposal */
  hasVoted: boolean;
  /** Whether the check for hasVoted is currently loading */
  isLoadingHasVoted: boolean;
  /** Status of the vote transaction submission */
  status: TransactionStatus;
  /** Transaction hash on success */
  hash: string | null;
  /** Transaction error, if any */
  error: StellarTransactionError | null;
  /** True while the vote transaction is being built, signed, submitted, or polled */
  isLoading: boolean;
  /** True when the vote transaction succeeded */
  isSuccess: boolean;
  /** True when the vote transaction failed */
  isError: boolean;
  /** Manually re-check if the connected account has voted */
  checkHasVoted: () => Promise<boolean>;
  /** Reset transaction status back to idle */
  reset: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DUMMY_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export function normalizeSupport(support: VoteSupport): number {
  if (typeof support === "number") {
    return support;
  }
  switch (support.toLowerCase()) {
    case "against":
      return 0;
    case "for":
      return 1;
    case "abstain":
      return 2;
    default:
      return 1;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Submits a vote on a proposal in a Soroban governor-style contract and exposes
 * whether the connected account has already voted.
 *
 * @param options - Hook configuration
 * @returns {UseVoteReturn}
 *
 * @example
 * ```tsx
 * const { vote, hasVoted, isLoading, isSuccess } = useVote({
 *   contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
 *   proposalId: 1,
 *   onSuccess: (hash) => console.log("Voted successfully!", hash),
 * });
 *
 * return (
 *   <button onClick={() => vote({ proposalId: 1, support: "for" })} disabled={hasVoted || isLoading}>
 *     {hasVoted ? "Already Voted" : "Vote For"}
 *   </button>
 * );
 * ```
 */
export function useVote(options: UseVoteOptions): UseVoteReturn {
  const {
    contractId,
    proposalId: baseProposalId,
    fee = 100,
    timeoutSeconds = 60,
    onSuccess,
    onError,
  } = options;

  const { config } = useStellarContext();
  const { publicKey, signTransaction } = useFreighter();

  const [hasVotedState, setHasVotedState] = useReducer(
    (
      prev: { hasVoted: boolean; isLoading: boolean },
      next: Partial<{ hasVoted: boolean; isLoading: boolean }>
    ) => ({ ...prev, ...next }),
    { hasVoted: false, isLoading: false }
  );

  const { submit: submitXdr, reset, ...txState } = useTransactionCore({
    mode: "soroban",
    timeoutSeconds,
    debugLabel: "useVote",
    ...(onSuccess && {
      onSuccess: (hash) => {
        setHasVotedState({ hasVoted: true });
        onSuccess(hash);
      },
    }),
    ...(onError && { onError }),
  });

  const checkHasVotedFor = useCallback(
    async (propId?: string | number): Promise<boolean> => {
      const pid = propId ?? baseProposalId;
      if (!contractId || !publicKey || pid === undefined) {
        setHasVotedState({ hasVoted: false, isLoading: false });
        return false;
      }

      setHasVotedState({ isLoading: true });

      try {
        validateContractId(contractId, "contractId");
        validatePublicKey(publicKey, "publicKey");

        const server = new rpc.Server(config.sorobanRpcUrl);
        const contract = new Contract(contractId);

        let accountObj: Account;
        try {
          accountObj = await server.getAccount(publicKey);
        } catch {
          accountObj = new Account(publicKey, "0");
        }

        const voterAddressScVal = new Address(publicKey).toScVal();
        const proposalIdScVal =
          typeof pid === "number"
            ? nativeToScVal(pid, { type: "u32" })
            : nativeToScVal(pid);

        // Common method names for checking vote presence in governor contracts:
        // get_vote(voter, proposal_id), has_voted(proposal_id, voter), or get_receipt(proposal_id, voter)
        const checkMethods = [
          { method: "get_vote", args: [voterAddressScVal, proposalIdScVal] },
          { method: "has_voted", args: [proposalIdScVal, voterAddressScVal] },
          { method: "get_receipt", args: [proposalIdScVal, voterAddressScVal] },
        ];

        for (const { method, args } of checkMethods) {
          try {
            const tx = new TransactionBuilder(accountObj, {
              fee: "100",
              networkPassphrase: config.networkPassphrase,
            })
              .addOperation(contract.call(method, ...args))
              .setTimeout(30)
              .build();

            const sim = await server.simulateTransaction(tx);
            if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
              const res = scValToNative(sim.result.retval);
              if (res !== null && res !== undefined) {
                if (typeof res === "boolean") {
                  setHasVotedState({ hasVoted: res, isLoading: false });
                  return res;
                }
                // Any receipt or vote object returned means user has voted
                setHasVotedState({ hasVoted: true, isLoading: false });
                return true;
              }
            }
          } catch {
            // Try next candidate signature
          }
        }

        setHasVotedState({ hasVoted: false, isLoading: false });
        return false;
      } catch {
        setHasVotedState({ hasVoted: false, isLoading: false });
        return false;
      }
    },
    [contractId, baseProposalId, publicKey, config.sorobanRpcUrl, config.networkPassphrase]
  );

  useEffect(() => {
    if (contractId && publicKey && baseProposalId !== undefined) {
      checkHasVotedFor();
    }
  }, [contractId, publicKey, baseProposalId, checkHasVotedFor]);

  const vote = useCallback(
    async (params?: CastVoteParams) => {
      const pid = params?.proposalId ?? baseProposalId;
      if (pid === undefined) {
        throw new Error("No proposalId specified for vote.");
      }
      if (!publicKey) {
        throw new Error("Freighter is not connected. Call connect() first.");
      }
      validateContractId(contractId, "contractId");
      validatePublicKey(publicKey, "publicKey");

      const supportVal = normalizeSupport(params?.support ?? 1);
      const server = new rpc.Server(config.sorobanRpcUrl);
      const contract = new Contract(contractId);

      const sourceAccount = await server.getAccount(publicKey);
      const voterAddressScVal = new Address(publicKey).toScVal();
      const proposalIdScVal =
        typeof pid === "number"
          ? nativeToScVal(pid, { type: "u32" })
          : nativeToScVal(pid);
      const supportScVal = nativeToScVal(supportVal, { type: "u32" });

      // Call 'vote(voter, proposal_id, support)' or 'vote(proposal_id, support)'
      const tx = new TransactionBuilder(sourceAccount, {
        fee: String(fee),
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          contract.call("vote", voterAddressScVal, proposalIdScVal, supportScVal)
        )
        .setTimeout(timeoutSeconds)
        .build();

      // Simulate to obtain footprints / resource fees
      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`Simulation failed: ${sim.error}`);
      }

      const preparedTx = rpc.assembleTransaction(tx, sim).build();
      const signedXdr = await signTransaction(unsafeAsXdrString(preparedTx.toXDR()), {
        networkPassphrase: config.networkPassphrase,
      });

      await submitXdr(signedXdr);
    },
    [
      baseProposalId,
      publicKey,
      contractId,
      config.sorobanRpcUrl,
      config.networkPassphrase,
      fee,
      timeoutSeconds,
      signTransaction,
      submitXdr,
    ]
  );

  return {
    vote,
    hasVoted: hasVotedState.hasVoted,
    isLoadingHasVoted: hasVotedState.isLoading,
    status: txState.status,
    hash: txState.hash,
    error: txState.error,
    isLoading: txState.isLoading,
    isSuccess: txState.isSuccess,
    isError: txState.isError,
    checkHasVoted: () => checkHasVotedFor(),
    reset,
  };
}

export default useVote;
