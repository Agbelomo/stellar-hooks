/**
 * @file useTokenTransfer.ts
 * @description Hook that builds, signs and submits a SEP-41 `transfer` call.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { nativeToScVal, StrKey } from "@stellar/stellar-sdk/minimal";
import { useFreighter } from "./useFreighter";
import { useSorobanContract } from "./useSorobanContract";
import type { StellarTransactionError, TransactionStatus } from "../types";

export interface UseTokenTransferOptions {
  /** SEP-41 token contract address (C...). */
  contractId: string;
  /** Called with the transaction hash once the transfer is confirmed. */
  onSuccess?: (hash: string) => void;
  /** Called when validation, signing, submission or execution fails. */
  onError?: (error: StellarTransactionError) => void;
}

export interface TokenTransferParams {
  /** Recipient (G... or C...). */
  to: string;
  /** Amount in the token's base units. Must be greater than zero. */
  amount: bigint;
}

export interface UseTokenTransferReturn {
  /** Validate, then simulate → sign → submit → poll `transfer(from, to, amount)`. */
  transfer: (params: TokenTransferParams) => Promise<void>;
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
 * Transfer a SEP-41 token from the connected wallet. Input is validated before
 * anything is simulated or signed, so mistakes cost no fee and no wallet prompt.
 *
 * @example
 * ```tsx
 * const { transfer, status, error } = useTokenTransfer({ contractId: "CTOKEN..." });
 * await transfer({ to: "GDEST...", amount: 10_000_000n }); // 1 token at 7 decimals
 * ```
 */
export function useTokenTransfer({
  contractId,
  onSuccess,
  onError,
}: UseTokenTransferOptions): UseTokenTransferReturn {
  const { publicKey } = useFreighter();
  const contract = useSorobanContract<unknown>(contractId, { method: "transfer" });
  const [validationError, setValidationError] = useState<StellarTransactionError | null>(null);

  const fail = useCallback(
    (message: string, resultCode: string) => {
      const error: StellarTransactionError = { type: "transaction", resultCode, message };
      setValidationError(error);
      onError?.(error);
    },
    [onError],
  );

  const transfer = useCallback(
    async ({ to, amount }: TokenTransferParams): Promise<void> => {
      setValidationError(null);

      if (!publicKey) {
        fail("No wallet connected. Connect a wallet before transferring.", "no_wallet");
        return;
      }
      if (!to || !isAddress(to)) {
        fail(`"${to}" is not a valid Stellar address.`, "invalid_recipient");
        return;
      }
      if (typeof amount !== "bigint" || amount <= 0n) {
        fail("Transfer amount must be greater than zero.", "invalid_amount");
        return;
      }
      if (to === publicKey) {
        fail("Sender and recipient must differ.", "same_account");
        return;
      }

      await contract.call({
        method: "transfer",
        args: [
          nativeToScVal(publicKey, { type: "address" }),
          nativeToScVal(to, { type: "address" }),
          nativeToScVal(amount, { type: "i128" }),
        ],
        onError,
      });
    },
    [publicKey, contract, fail, onError],
  );

  // The hash only exists in state once the transaction is confirmed.
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

  const error = validationError ?? contract.error;
  const status: TransactionStatus = validationError ? "error" : contract.status;

  return {
    transfer,
    status,
    hash: contract.hash,
    error,
    isLoading: !validationError && contract.isLoading,
    isSuccess: !validationError && contract.isSuccess,
    isError: !!validationError || contract.isError,
    reset,
  };
}
