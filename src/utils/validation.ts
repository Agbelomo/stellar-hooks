import { StrKey } from "@stellar/stellar-sdk";
import { StellarHookError, ErrorCode } from "./errors";
import { getErrorString } from "./errorStrings";

export class ValidationError extends StellarHookError {
  constructor(message: string, options?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(message, {
      code: ErrorCode.VALIDATION_ERROR,
      cause: options?.cause,
      context: options?.context,
    });
    this.name = "ValidationError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

export function validatePublicKey(
  value: string | null | undefined,
  label = "publicKey"
): asserts value is string {
  if (!value || !StrKey.isValidEd25519PublicKey(value)) {
    throw new ValidationError(
      getErrorString("invalidPublicKey", { label, value: String(value) })
    );
  }
}

export function validateContractId(
  value: string | null | undefined,
  label = "contractId"
): asserts value is string {
  if (!value || !StrKey.isValidContract(value)) {
    throw new ValidationError(
      getErrorString("invalidContractId", { label, value: String(value) })
    );
  }
}

export function validateOptionalPublicKey(
  value: string | null | undefined,
  label = "publicKey"
): void {
  if (value != null && !StrKey.isValidEd25519PublicKey(value)) {
    throw new ValidationError(
      getErrorString("invalidPublicKey", { label, value: String(value) })
    );
  }
}

export function validateOptionalContractId(
  value: string | null | undefined,
  label = "contractId"
): void {
  if (value != null && !StrKey.isValidContract(value)) {
    throw new ValidationError(
      getErrorString("invalidContractId", { label, value: String(value) })
    );
  }
}
