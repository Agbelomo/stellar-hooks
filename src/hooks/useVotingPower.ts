/**
 * @file useVotingPower.ts
 * @description Hook that reads the voting power of an account at the current or a specified ledger from a governance token contract.
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
import { getCache, setCache, validateContractId, validatePublicKey } from "../utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VotingPowerState {
  /** Raw voting power weight as a BigInt */
  votingPower: bigint | null;
  /** Formatted voting power as a string formatted with specified decimal places */
  formatted: string | null;
  /** The ledger sequence number at which voting power was evaluated */
  ledger: number | null;
  isLoading: boolean;
  error: Error | null;
  lastFetchedAt: Date | null;
  refetch: () => Promise<void>;
}

export interface UseVotingPowerOptions {
  /**
   * The governance token or governor contract address (`C...`).
   */
  contractId: string | null | undefined;
  /**
   * Account address to query voting weight for (`G...` or `C...`).
   */
  accountAddress: string | null | undefined;
  /**
   * Specific ledger sequence number to evaluate voting power at.
   * If omitted, queries the current voting weight.
   */
  ledger?: number | null;
  /**
   * Set false to skip automatic fetching. Default: true
   */
  enabled?: boolean;
  /**
   * Polling interval in milliseconds. Set to 0 to disable. Default: 0
   */
  refetchInterval?: number;
  /**
   * Number of decimal places for formatting the token amount. Default: 7
   */
  decimals?: number;
  /**
   * Cache time-to-live in milliseconds. Default: 30000
   */
  cacheTTL?: number;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: { votingPower: bigint; ledger: number | null } }
  | { type: "FETCH_ERROR"; payload: Error };

function reducer(state: VotingPowerState, action: Action): VotingPowerState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, isLoading: true, error: null };
    case "FETCH_SUCCESS":
      return {
        ...state,
        votingPower: action.payload.votingPower,
        ledger: action.payload.ledger,
        isLoading: false,
        error: null,
        lastFetchedAt: new Date(),
      };
    case "FETCH_ERROR":
      return { ...state, isLoading: false, error: action.payload };
    default:
      return state;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatVotingPower(raw: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${whole}.${fractionStr}`;
}

const DUMMY_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook that reads the voting power of an account from a Soroban governance / token contract.
 *
 * It checks the standard governance token interfaces (e.g. `get_votes(account, ledger)` or
 * `get_voting_power(account)` / `get_past_votes(account, sequence)`) via Soroban RPC simulation.
 *
 * @param options - Configuration options for reading voting power
 * @returns {VotingPowerState}
 *
 * @example
 * ```tsx
 * const { votingPower, formatted, isLoading, error } = useVotingPower({
 *   contractId: "CA3D5KRY...",
 *   accountAddress: publicKey,
 *   ledger: 1042300,
 * });
 * ```
 */
export function useVotingPower(options: UseVotingPowerOptions): VotingPowerState {
  const {
    contractId,
    accountAddress,
    ledger,
    enabled = true,
    refetchInterval = 0,
    decimals = 7,
    cacheTTL = 30_000,
  } = options;

  const { config } = useStellarContext();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchGenRef = useRef(0);
  const refetchRef = useRef<(force?: boolean) => Promise<void>>(() => Promise.resolve());

  const [state, dispatch] = useReducer(reducer, {
    votingPower: null,
    formatted: null,
    ledger: null,
    isLoading: false,
    error: null,
    lastFetchedAt: null,
    refetch: () => refetchRef.current(true),
  });

  const fetchPower = useCallback(
    async (force = false) => {
      if (!contractId || !accountAddress) return;

      const gen = ++fetchGenRef.current;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const ledgerKey = ledger !== undefined && ledger !== null ? ledger : "latest";
      const cacheKey = `voting-power-${contractId}-${accountAddress}-${ledgerKey}-${config.network}`;

      if (!force) {
        const cached = getCache<{ votingPower: bigint; ledger: number | null }>(cacheKey);
        if (cached) {
          if (gen !== fetchGenRef.current) return;
          dispatch({ type: "FETCH_SUCCESS", payload: cached });
          return;
        }
      }

      dispatch({ type: "FETCH_START" });

      try {
        validateContractId(contractId, "contractId");
        validatePublicKey(accountAddress, "accountAddress");

        const server = new rpc.Server(config.sorobanRpcUrl);
        const contract = new Contract(contractId);

        let accountObj: Account;
        try {
          accountObj = await server.getAccount(accountAddress);
        } catch {
          accountObj = new Account(DUMMY_ACCOUNT, "0");
        }

        const addressVal = new Address(accountAddress).toScVal();

        const simulate = async (method: string, args: xdr.ScVal[] = []) => {
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

        let result: bigint | null = null;
        let evaluatedLedger: number | null = ledger ?? null;

        if (ledger !== undefined && ledger !== null) {
          const ledgerVal = nativeToScVal(ledger, { type: "u32" });

          // Try standard historical methods:
          // 1. get_past_votes(account, sequence)
          let res = await simulate("get_past_votes", [addressVal, ledgerVal]);
          if (res === null) {
            // 2. get_votes(account, sequence)
            res = await simulate("get_votes", [addressVal, ledgerVal]);
          }
          if (res === null) {
            // 3. get_voting_power(account, sequence)
            res = await simulate("get_voting_power", [addressVal, ledgerVal]);
          }

          if (res !== null) {
            result = typeof res === "bigint" ? res : BigInt(res);
          }
        } else {
          // Current voting weight methods:
          // 1. get_votes(account)
          let res = await simulate("get_votes", [addressVal]);
          if (res === null) {
            // 2. get_voting_power(account)
            res = await simulate("get_voting_power", [addressVal]);
          }
          if (res === null) {
            // 3. balance(account)
            res = await simulate("balance", [addressVal]);
          }

          if (res !== null) {
            result = typeof res === "bigint" ? res : BigInt(res);
          }

          try {
            const latestLedger = await server.getLatestLedger();
            evaluatedLedger = latestLedger.sequence;
          } catch {
            evaluatedLedger = null;
          }
        }

        if (result === null) {
          result = 0n;
        }

        const payload = { votingPower: result, ledger: evaluatedLedger };
        setCache(cacheKey, payload, cacheTTL);

        if (gen !== fetchGenRef.current) return;
        dispatch({ type: "FETCH_SUCCESS", payload });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (gen !== fetchGenRef.current) return;
        dispatch({
          type: "FETCH_ERROR",
          payload: err instanceof Error ? err : new Error(String(err)),
        });
      }
    },
    [contractId, accountAddress, ledger, config.sorobanRpcUrl, config.networkPassphrase, config.network, cacheTTL]
  );

  useEffect(() => {
    refetchRef.current = fetchPower;
  }, [fetchPower]);

  useEffect(() => {
    if (!enabled || !contractId || !accountAddress) return;
    void fetchPower();

    return () => {
      ++fetchGenRef.current;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [enabled, contractId, accountAddress, ledger, fetchPower]);

  useEffect(() => {
    if (!enabled || !contractId || !accountAddress || refetchInterval <= 0) return;
    intervalRef.current = setInterval(() => void fetchPower(true), refetchInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, contractId, accountAddress, ledger, refetchInterval, fetchPower]);

  const formatted =
    state.votingPower !== null ? formatVotingPower(state.votingPower, decimals) : null;

  return { ...state, formatted };
}
