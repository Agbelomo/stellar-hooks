import { StrKey } from "@stellar/stellar-sdk";
import { StellarHookError, ErrorCode } from "./errors";

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
      `Invalid ${label}: "${String(value)}" is not a valid Stellar public key (G...).`
    );
  }
}

export function validateContractId(
  value: string | null | undefined,
  label = "contractId"
): asserts value is string {
  if (!value || !StrKey.isValidContract(value)) {
    throw new ValidationError(
      `Invalid ${label}: "${String(value)}" is not a valid Stellar contract ID (C...).`
    );
  }
}

export function validateOptionalPublicKey(
  value: string | null | undefined,
  label = "publicKey"
): void {
  if (value != null && !StrKey.isValidEd25519PublicKey(value)) {
    throw new ValidationError(
      `Invalid ${label}: "${value}" is not a valid Stellar public key (G...).`
    );
  }
}

export function validateOptionalContractId(
  value: string | null | undefined,
  label = "contractId"
): void {
  if (value != null && !StrKey.isValidContract(value)) {
    throw new ValidationError(
      `Invalid ${label}: "${value}" is not a valid Stellar contract ID (C...).`
    );
  }
}
