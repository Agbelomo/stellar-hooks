/**
 * @file useTokenApprove.ts
 * @description Hook wrapping the SEP-41 `approve` call with validation of the
 *   required expiration ledger.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { nativeToScVal, StrKey } from "@stellar/stellar-sdk/minimal";
import * as rpc from "@stellar/stellar-sdk/rpc";
import { useStellarContext } from "../context";
import { useFreighter } from "./useFreighter";
import { useSorobanContract } from "./useSorobanContract";
import type { StellarTransactionError, TransactionStatus } from "../types";

export interface UseTokenApproveOptions {
  /** SEP-41 token contract address (C...). */
  contractId: string;
  /** Called with the transaction hash once the approval is confirmed. */
  onSuccess?: (hash: string) => void;
  /** Called for validation, signing, submission and execution errors. */
  onError?: (error: StellarTransactionError) => void;
}

export interface TokenApproveParams {
  /** Account being allowed to spend (G... or C...). */
  spender: string;
  /** Allowance in base units. `0n` revokes the allowance. */
  amount: bigint;
  /**
   * Last ledger sequence at which the allowance is valid. Required by SEP-41
   * and must be in the future when `amount` is greater than zero.
   */
  expirationLedger: number;
}

export interface UseTokenApproveReturn {
  approve: (params: TokenApproveParams) => Promise<void>;
  status: TransactionStatus;
  hash: string | null;
  error: StellarTransactionError | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
}

const isAddress = (value: string) =>
  StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value);

/**
 * Approve a spender to move up to `amount` of the connected wallet's SEP-41
 * tokens until `expirationLedger`. Inputs are validated before anything is
 * simulated or signed.
 *
 * @example
 * ```tsx
 * const { approve, status, error } = useTokenApprove({ contractId: "CTOKEN..." });
 * await approve({ spender: "CDEX...", amount: 50_000_000n, expirationLedger: latest + 17_280 });
 * ```
 */
export function useTokenApprove({
  contractId,
  onSuccess,
  onError,
}: UseTokenApproveOptions): UseTokenApproveReturn {
  const { config } = useStellarContext();
  const { publicKey } = useFreighter();
  const contract = useSorobanContract<unknown>(contractId, { method: "approve" });
  const [validationError, setValidationError] = useState<StellarTransactionError | null>(null);

  const approve = useCallback(
    async ({ spender, amount, expirationLedger }: TokenApproveParams): Promise<void> => {
      const fail = (message: string, resultCode: string) => {
        const error: StellarTransactionError = { type: "transaction", resultCode, message };
        setValidationError(error);
        onError?.(error);
      };
      setValidationError(null);

      if (!publicKey) return fail("No wallet connected. Connect a wallet before approving.", "no_wallet");
      if (!spender || !isAddress(spender)) return fail(`"${spender}" is not a valid Stellar address.`, "invalid_spender");
      if (spender === publicKey) return fail("You cannot approve your own account as spender.", "same_account");
      if (typeof amount !== "bigint" || amount < 0n) return fail("Allowance amount cannot be negative.", "invalid_amount");
      if (!Number.isSafeInteger(expirationLedger) || expirationLedger < 0 || expirationLedger > 0xffffffff) {
        return fail("expirationLedger is required and must be a non-negative 32-bit ledger sequence.", "invalid_expiration");
      }

      if (amount > 0n) {
        try {
          const { sequence } = await new rpc.Server(config.sorobanRpcUrl).getLatestLedger();
          if (expirationLedger <= sequence) {
            return fail(
              `expirationLedger ${expirationLedger} is not in the future (current ledger ${sequence}).`,
              "expiration_in_past",
            );
          }
        } catch {
          // If the RPC cannot tell us the current ledger, let the contract
          // simulation make the final call rather than blocking the user.
        }
      }

      await contract.call({
        method: "approve",
        args: [
          nativeToScVal(publicKey, { type: "address" }),
          nativeToScVal(spender, { type: "address" }),
          nativeToScVal(amount, { type: "i128" }),
          nativeToScVal(expirationLedger, { type: "u32" }),
        ],
        onError,
      });
    },
    [publicKey, contract, config.sorobanRpcUrl, onError],
  );

  const notifiedHash = useRef<string | null>(null);
  useEffect(() => {
    if (contract.status === "success" && contract.hash && notifiedHash.current !== contract.hash) {
      notifiedHash.current = contract.hash;
      onSuccess?.(contract.hash);
    }
  }, [contract.status, contract.hash, onSuccess]);

  const reset = useCallback(() => {
    notifiedHash.current = null;
    setValidationError(null);
    contract.reset();
  }, [contract]);

  return {
    approve,
    status: validationError ? "error" : contract.status,
    hash: contract.hash,
    error: validationError ?? contract.error,
    isLoading: !validationError && contract.isLoading,
    isSuccess: !validationError && contract.isSuccess,
    isError: !!validationError || contract.isError,
    reset,
  };
}
