/**
 * @file useNftTransfer.ts
 * @description Hook wrapping the NFT transfer call with an ownership pre-check
 *   so users get a clear error before paying fees on a doomed transaction.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useReducer } from "react";
import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk/minimal";
import * as rpc from "@stellar/stellar-sdk/rpc";
import { useStellarContext } from "../context";
import { useFreighter } from "./useFreighter";
import { unsafeAsXdrString } from "../types";
import type { TransactionStatus, StellarTransactionError } from "../types";
import { asTxHash } from "../types";
import { sleep, backoff } from "../utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseNftTransferOptions {
  /**
   * Soroban NFT contract address (C-prefix).
   * Required.
   */
  contractId: string;
  /**
   * Fee in stroops. Default: BASE_FEE (100)
   */
  fee?: string | number;
  /**
   * Transaction build + polling timeout in seconds. Default: 30
   */
  timeoutSeconds?: number;
  /** Callback fired when the transfer transaction is confirmed. */
  onSuccess?: (hash: string) => void;
  /** Callback fired when any error occurs (pre-check or on-chain). */
  onError?: (error: StellarTransactionError) => void;
}

export interface NftTransferParams {
  /** Token ID to transfer. */
  tokenId: string | number;
  /** Recipient account public key (G...). */
  to: string;
  /**
   * Sender account public key. Defaults to the connected wallet when omitted.
   */
  from?: string;
}

export interface UseNftTransferReturn {
  /**
   * Run the ownership pre-check and, if the caller owns the token, submit the
   * transfer transaction.
   *
   * Throws (and sets `error`) if:
   * - No wallet is connected
   * - The ownership pre-check fails (caller does not own the token)
   * - The transaction fails on-chain
   */
  transfer: (params: NftTransferParams) => Promise<void>;
  /** Current lifecycle status. */
  status: TransactionStatus;
  /** Transaction hash once confirmed on-chain. */
  hash: string | null;
  /** Error object if the transfer failed at any stage. */
  error: StellarTransactionError | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  /** Reset state back to idle. */
  reset: () => void;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

interface State {
  status: TransactionStatus;
  hash: string | null;
  error: StellarTransactionError | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

type Action =
  | { type: "RESET" }
  | { type: "STATUS"; payload: TransactionStatus }
  | { type: "SUCCESS"; hash: string }
  | { type: "ERROR"; payload: StellarTransactionError };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "RESET":
      return { status: "idle", hash: null, error: null, isLoading: false, isSuccess: false, isError: false };
    case "STATUS":
      return { ...state, status: action.payload, isLoading: true, isSuccess: false, isError: false };
    case "SUCCESS":
      return { status: "success", hash: action.hash, error: null, isLoading: false, isSuccess: true, isError: false };
    case "ERROR":
      return { ...state, status: "error", error: action.payload, isLoading: false, isSuccess: false, isError: true };
    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Transfer an NFT via a Soroban contract that exposes a standard
 * `transfer_from(from, to, token_id)` method.
 *
 * Before building and submitting the transaction, the hook simulates a
 * `balance_of(from, token_id)` call to verify ownership.  If the caller does
 * not own the token, an error is returned immediately — no fee is charged and
 * no wallet prompt appears.
 *
 * @example
 * ```tsx
 * const { transfer, status, hash, isLoading, error } = useNftTransfer({
 *   contractId: "CABC...XYZ",
 *   onSuccess: (hash) => toast(`Transferred! tx: ${hash}`),
 * });
 *
 * async function handleTransfer() {
 *   await transfer({
 *     tokenId: 42,
 *     to: "GDEST...",
 *   });
 * }
 * ```
 */
export function useNftTransfer(options: UseNftTransferOptions): UseNftTransferReturn {
  const {
    contractId,
    fee = BASE_FEE,
    timeoutSeconds = 30,
    onSuccess,
    onError,
  } = options;

  const { config } = useStellarContext();
  const { publicKey, signTransaction } = useFreighter();

  const [state, dispatch] = useReducer(reducer, {
    status: "idle",
    hash: null,
    error: null,
    isLoading: false,
    isSuccess: false,
    isError: false,
  });

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const transfer = useCallback(
    async (params: NftTransferParams): Promise<void> => {
      const { tokenId, to, from } = params;
      const sender = from ?? publicKey;

      if (!sender) {
        const err: StellarTransactionError = {
          type: "network",
          message: "No wallet connected. Call useFreighter().connect() first.",
        };
        dispatch({ type: "ERROR", payload: err });
        onError?.(err);
        return;
      }

      dispatch({ type: "STATUS", payload: "building" });

      try {
        const server = new rpc.Server(config.sorobanRpcUrl);
        const contract = new Contract(contractId);

        // ── 1. Ownership pre-check (simulation, no fee) ───────────────────────
        let ownerAccount: rpc.Api.Account;
        try {
          ownerAccount = await server.getAccount(sender);
        } catch {
          const err: StellarTransactionError = {
            type: "network",
            message: `Could not load account "${sender}" from the Soroban RPC.`,
          };
          dispatch({ type: "ERROR", payload: err });
          onError?.(err);
          return;
        }

        const checkTx = new TransactionBuilder(ownerAccount, {
          fee: "100",
          networkPassphrase: config.networkPassphrase,
        })
          .addOperation(
            contract.call(
              "balance_of",
              nativeToScVal(sender, { type: "address" }),
              nativeToScVal(Number(tokenId), { type: "u32" }),
            ),
          )
          .setTimeout(30)
          .build();

        const checkSim = await server.simulateTransaction(checkTx);

        if (rpc.Api.isSimulationError(checkSim)) {
          // Treat simulation error as ownership unknown — surface it clearly
          const err: StellarTransactionError = {
            type: "network",
            message: `Ownership pre-check simulation failed: ${checkSim.error}`,
          };
          dispatch({ type: "ERROR", payload: err });
          onError?.(err);
          return;
        }

        const retval = checkSim.result?.retval ?? xdr.ScVal.scvVoid();
        const balance = scValToNative(retval);
        const owns = balance === true || balance === 1 || Number(balance) > 0;

        if (!owns) {
          const err: StellarTransactionError = {
            type: "transaction",
            resultCode: "ownership_check_failed",
            message: `Account "${sender}" does not own token #${tokenId} on contract "${contractId}". Transfer aborted before fee payment.`,
          };
          dispatch({ type: "ERROR", payload: err });
          onError?.(err);
          return;
        }

        // ── 2. Build transfer transaction ─────────────────────────────────────
        dispatch({ type: "STATUS", payload: "building" });

        // Re-fetch account to get a fresh sequence number
        const sourceAccount = await server.getAccount(sender);

        const transferTx = new TransactionBuilder(sourceAccount, {
          fee: String(fee),
          networkPassphrase: config.networkPassphrase,
        })
          .addOperation(
            contract.call(
              "transfer_from",
              nativeToScVal(sender, { type: "address" }),   // spender / operator
              nativeToScVal(sender, { type: "address" }),   // from
              nativeToScVal(to, { type: "address" }),       // to
              nativeToScVal(Number(tokenId), { type: "u32" }),
            ),
          )
          .setTimeout(timeoutSeconds)
          .build();

        // ── 3. Simulate to get auth entries & resource fee ────────────────────
        const transferSim = await server.simulateTransaction(transferTx);

        if (rpc.Api.isSimulationError(transferSim)) {
          const err: StellarTransactionError = {
            type: "network",
            message: `Transfer simulation failed: ${transferSim.error}`,
          };
          dispatch({ type: "ERROR", payload: err });
          onError?.(err);
          return;
        }

        const preparedTx = rpc.assembleTransaction(transferTx, transferSim).build();

        // ── 4. Sign ───────────────────────────────────────────────────────────
        dispatch({ type: "STATUS", payload: "signing" });

        const signedXdr = await signTransaction(
          unsafeAsXdrString(preparedTx.toXDR()),
          { networkPassphrase: config.networkPassphrase },
        );

        // ── 5. Submit ─────────────────────────────────────────────────────────
        dispatch({ type: "STATUS", payload: "submitting" });

        const signedTx = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);
        const sendResult = await server.sendTransaction(signedTx as Parameters<typeof server.sendTransaction>[0]);

        if (sendResult.status === "ERROR") {
          const err: StellarTransactionError = {
            type: "network",
            message: `Transfer submission failed: ${JSON.stringify(sendResult.errorResult)}`,
          };
          dispatch({ type: "ERROR", payload: err });
          onError?.(err);
          return;
        }

        // ── 6. Poll ───────────────────────────────────────────────────────────
        dispatch({ type: "STATUS", payload: "polling" });

        const deadline = Date.now() + timeoutSeconds * 1000;
        let attempt = 0;

        while (Date.now() < deadline) {
          await sleep(backoff(attempt));
          attempt++;

          const getResult = await server.getTransaction(sendResult.hash);

          if (getResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            const txHash = asTxHash(sendResult.hash);
            dispatch({ type: "SUCCESS", hash: txHash });
            onSuccess?.(txHash);
            return;
          }

          if (getResult.status === rpc.Api.GetTransactionStatus.FAILED) {
            const err: StellarTransactionError = {
              type: "transaction",
              resultCode: "unknown",
              message: "NFT transfer transaction failed on-chain.",
            };
            dispatch({ type: "ERROR", payload: err });
            onError?.(err);
            return;
          }
        }

        const timeoutErr: StellarTransactionError = {
          type: "timeout",
          message: `NFT transfer polling timed out after ${timeoutSeconds}s.`,
        };
        dispatch({ type: "ERROR", payload: timeoutErr });
        onError?.(timeoutErr);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const error: StellarTransactionError = {
          type: "network",
          message: `useNftTransfer: unexpected error — ${message}`,
        };
        dispatch({ type: "ERROR", payload: error });
        onError?.(error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contractId, fee, timeoutSeconds, config, publicKey, signTransaction],
  );

  return {
    transfer,
    reset,
    status: state.status,
    hash: state.hash,
    error: state.error,
    isLoading: state.isLoading,
    isSuccess: state.isSuccess,
    isError: state.isError,
  };
}
