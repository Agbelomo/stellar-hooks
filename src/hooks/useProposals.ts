/**
 * @file useProposals.ts
 * @description Hook for listing proposals from a Soroban governor-style contract
 * with status, vote tallies, and voting deadlines.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  Account,
  Contract,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import * as rpc from "@stellar/stellar-sdk/rpc";
import { useStellarContext } from "../context";
import { getCache, setCache, validateContractId } from "../utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProposalStatus =
  | "pending"
  | "active"
  | "canceled"
  | "defeated"
  | "successful"
  | "ready"
  | "executed"
  | "expired"
  | "unknown";

export interface VoteTallies {
  for: bigint;
  against: bigint;
  abstain: bigint;
}

export interface Proposal {
  id: string | number;
  title?: string;
  description?: string;
  proposer?: string;
  status: ProposalStatus;
  voteTallies: VoteTallies;
  voteStartLedger?: number;
  voteEndLedger?: number;
  voteStartTime?: number;
  voteEndTime?: number;
  executableTime?: number;
  raw?: unknown;
}

export interface UseProposalsOptions {
  /** Soroban Governor contract address (`C...`) */
  contractId?: string;
  /** Enable automatic fetching. Default: true */
  enabled?: boolean;
  /** Poll interval in milliseconds. Set to 0 to disable. Default: 0 */
  refetchInterval?: number;
  /** Cache TTL in milliseconds. Default: 30000 */
  cacheTTL?: number;
  /** Custom proposal parser from ScVal */
  parseProposal?: (raw: unknown) => Proposal;
  /** Callback fired on successful proposals fetch */
  onSuccess?: (proposals: Proposal[]) => void;
  /** Callback fired on error */
  onError?: (error: Error) => void;
}

export interface UseProposalsReturn {
  proposals: Proposal[];
  isLoading: boolean;
  isRefetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DUMMY_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export function normalizeProposalStatus(statusVal: unknown): ProposalStatus {
  if (typeof statusVal === "string") {
    const s = statusVal.toLowerCase();
    if (s.includes("pend")) return "pending";
    if (s.includes("act")) return "active";
    if (s.includes("cancel")) return "canceled";
    if (s.includes("defeat")) return "defeated";
    if (s.includes("succ")) return "successful";
    if (s.includes("read")) return "ready";
    if (s.includes("exec")) return "executed";
    if (s.includes("exp")) return "expired";
    return "unknown";
  }
  if (typeof statusVal === "number") {
    switch (statusVal) {
      case 0:
        return "pending";
      case 1:
        return "active";
      case 2:
        return "canceled";
      case 3:
        return "defeated";
      case 4:
        return "successful";
      case 5:
        return "ready";
      case 6:
        return "executed";
      case 7:
        return "expired";
      default:
        return "unknown";
    }
  }
  return "unknown";
}

export function parseRawProposal(raw: unknown, defaultId?: string | number): Proposal {
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const id = (obj.id ?? obj.proposal_id ?? defaultId ?? "0") as string | number;
    const title = typeof obj.title === "string" ? obj.title : undefined;
    const description = typeof obj.description === "string" ? obj.description : undefined;
    const proposer = typeof obj.proposer === "string" ? obj.proposer : undefined;

    const rawStatus = obj.status ?? obj.state;
    const status = normalizeProposalStatus(rawStatus);

    let forVotes = 0n;
    let againstVotes = 0n;
    let abstainVotes = 0n;

    if (obj.vote_tallies || obj.tallies || obj.votes) {
      const tallies = (obj.vote_tallies ?? obj.tallies ?? obj.votes) as Record<string, unknown>;
      if (tallies.for !== undefined) forVotes = BigInt(tallies.for as string | number | bigint);
      if (tallies.against !== undefined) againstVotes = BigInt(tallies.against as string | number | bigint);
      if (tallies.abstain !== undefined) abstainVotes = BigInt(tallies.abstain as string | number | bigint);
    } else {
      if (obj.for_votes !== undefined) forVotes = BigInt(obj.for_votes as string | number | bigint);
      if (obj.against_votes !== undefined) againstVotes = BigInt(obj.against_votes as string | number | bigint);
      if (obj.abstain_votes !== undefined) abstainVotes = BigInt(obj.abstain_votes as string | number | bigint);
    }

    const voteStartLedger = typeof obj.vote_start === "number" ? obj.vote_start : undefined;
    const voteEndLedger = typeof obj.vote_end === "number" ? obj.vote_end : undefined;
    const voteStartTime = typeof obj.vote_start_time === "number" ? obj.vote_start_time : undefined;
    const voteEndTime = typeof obj.vote_end_time === "number" ? obj.vote_end_time : undefined;
    const executableTime = typeof obj.executable_time === "number" ? obj.executable_time : undefined;

    return {
      id,
      title,
      description,
      proposer,
      status,
      voteTallies: {
        for: forVotes,
        against: againstVotes,
        abstain: abstainVotes,
      },
      voteStartLedger,
      voteEndLedger,
      voteStartTime,
      voteEndTime,
      executableTime,
      raw,
    };
  }

  return {
    id: defaultId ?? "0",
    status: "unknown",
    voteTallies: { for: 0n, against: 0n, abstain: 0n },
    raw,
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

interface State {
  proposals: Proposal[];
  isLoading: boolean;
  isRefetching: boolean;
  isError: boolean;
  error: Error | null;
}

type Action =
  | { type: "FETCH_START"; isRefetch: boolean }
  | { type: "FETCH_SUCCESS"; payload: Proposal[] }
  | { type: "FETCH_ERROR"; payload: Error };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return {
        ...state,
        isLoading: !action.isRefetch && state.proposals.length === 0,
        isRefetching: action.isRefetch || state.proposals.length > 0,
        isError: false,
        error: null,
      };
    case "FETCH_SUCCESS":
      return {
        proposals: action.payload,
        isLoading: false,
        isRefetching: false,
        isError: false,
        error: null,
      };
    case "FETCH_ERROR":
      return {
        ...state,
        isLoading: false,
        isRefetching: false,
        isError: true,
        error: action.payload,
      };
    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Lists governance proposals from a Soroban governor-style contract with
 * current status, vote tallies, and voting deadlines.
 *
 * @param options - Configuration options for reading proposals
 * @returns {UseProposalsReturn}
 *
 * @example
 * ```tsx
 * const { proposals, isLoading, error, refetch } = useProposals({
 *   contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
 * });
 *
 * if (isLoading) return <div>Loading proposals...</div>;
 *
 * return (
 *   <ul>
 *     {proposals.map(p => (
 *       <li key={p.id}>
 *         Proposal #{p.id}: {p.status} (For: {p.voteTallies.for.toString()})
 *       </li>
 *     ))}
 *   </ul>
 * );
 * ```
 */
export function useProposals(options: UseProposalsOptions = {}): UseProposalsReturn {
  const {
    contractId,
    enabled = true,
    refetchInterval = 0,
    cacheTTL = 30_000,
    parseProposal: customParseProposal,
    onSuccess,
    onError,
  } = options;

  const { config } = useStellarContext();
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchGenRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, dispatch] = useReducer(reducer, {
    proposals: [],
    isLoading: Boolean(enabled && contractId),
    isRefetching: false,
    isError: false,
    error: null,
  });

  const fetchProposals = useCallback(
    async (isRefetch = false) => {
      if (!contractId) return;

      const gen = ++fetchGenRef.current;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const cacheKey = `soroban-governor-proposals-${contractId}-${config.network}`;

      if (!isRefetch) {
        const cached = getCache<Proposal[]>(cacheKey);
        if (cached) {
          if (gen !== fetchGenRef.current) return;
          dispatch({ type: "FETCH_SUCCESS", payload: cached });
          onSuccess?.(cached);
          return;
        }
      }

      dispatch({ type: "FETCH_START", isRefetch });

      try {
        validateContractId(contractId, "contractId");

        const server = new rpc.Server(config.sorobanRpcUrl);
        const contract = new Contract(contractId);

        let accountObj: Account;
        try {
          accountObj = await server.getAccount(DUMMY_ACCOUNT);
        } catch {
          accountObj = new Account(DUMMY_ACCOUNT, "0");
        }

        // Helper to simulate a read call
        const simulateCall = async (method: string, args: xdr.ScVal[] = []) => {
          const tx = new TransactionBuilder(accountObj, {
            fee: "100",
            networkPassphrase: config.networkPassphrase,
          })
            .addOperation(contract.call(method, ...args))
            .setTimeout(30)
            .build();

          const sim = await server.simulateTransaction(tx);
          if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
            return scValToNative(sim.result.retval);
          }
          return null;
        };

        let proposalList: Proposal[] = [];

        // 1. Try batch methods: get_proposals or list_proposals
        let batchResult = await simulateCall("get_proposals");
        if (!batchResult) {
          batchResult = await simulateCall("list_proposals");
        }

        if (Array.isArray(batchResult)) {
          proposalList = batchResult.map((raw, idx) =>
            customParseProposal ? customParseProposal(raw) : parseRawProposal(raw, idx + 1)
          );
        } else {
          // 2. Try fetching count then individual proposals: proposal_count or get_proposal_count
          let countResult = await simulateCall("proposal_count");
          if (countResult === null) {
            countResult = await simulateCall("get_proposal_count");
          }

          const count = typeof countResult === "number" || typeof countResult === "bigint"
            ? Number(countResult)
            : 0;

          if (count > 0) {
            const fetched: Proposal[] = [];
            for (let i = 1; i <= count; i++) {
              let propData = await simulateCall("get_proposal", [nativeToScVal(i, { type: "u32" })]);
              if (!propData) {
                propData = await simulateCall("get_proposal", [nativeToScVal(i, { type: "i128" })]);
              }
              if (propData) {
                fetched.push(
                  customParseProposal
                    ? customParseProposal(propData)
                    : parseRawProposal(propData, i)
                );
              }
            }
            proposalList = fetched;
          }
        }

        if (gen !== fetchGenRef.current) return;

        setCache(cacheKey, proposalList, cacheTTL);
        dispatch({ type: "FETCH_SUCCESS", payload: proposalList });
        onSuccess?.(proposalList);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (gen !== fetchGenRef.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        dispatch({ type: "FETCH_ERROR", payload: error });
        onError?.(error);
      }
    },
    [contractId, config.sorobanRpcUrl, config.networkPassphrase, config.network, cacheTTL, customParseProposal, onSuccess, onError]
  );

  useEffect(() => {
    if (enabled && contractId) {
      fetchProposals();
    }
  }, [enabled, contractId, fetchProposals]);

  useEffect(() => {
    if (!enabled || !contractId || refetchInterval <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      fetchProposals(true);
    }, refetchInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, contractId, refetchInterval, fetchProposals]);

  const refetch = useCallback(async () => {
    await fetchProposals(true);
  }, [fetchProposals]);

  return {
    proposals: state.proposals,
    isLoading: state.isLoading,
    isRefetching: state.isRefetching,
    isError: state.isError,
    error: state.error,
    refetch,
  };
}

export default useProposals;
