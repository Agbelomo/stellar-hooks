/**
 * @file signAuthEntry.ts
 * @description Sign individual Soroban authorization entries with a WebAuthn passkey.
 * @package stellar-hooks
 * @license MIT
 */

import { hash, xdr } from "@stellar/stellar-sdk";
import { derToCompactSignature, fromBase64Url, toBase64Url } from "./webauthn";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Raw pieces of a WebAuthn assertion needed to build a smart account signature. */
export interface PasskeyAssertion {
  /** Credential ID that produced the assertion */
  credentialId: Uint8Array;
  /** `AuthenticatorAssertionResponse.authenticatorData` */
  authenticatorData: Uint8Array;
  /** `AuthenticatorAssertionResponse.clientDataJSON` */
  clientDataJSON: Uint8Array;
  /** DER-encoded ECDSA signature from `AuthenticatorAssertionResponse.signature` */
  signature: Uint8Array;
}

export interface SignAuthEntryOptions {
  /** Base64url credential ID of the passkey to sign with */
  credentialId: string;
  /** Network passphrase the entry will be submitted on */
  networkPassphrase: string;
  /** Last ledger (inclusive) at which the signature is valid */
  validUntilLedgerSeq: number;
  /** WebAuthn relying party ID. Defaults to the current origin's host. */
  rpId?: string;
  /** Milliseconds to wait for the user. Defaults to `60000`. */
  timeout?: number;
  /**
   * Override the WebAuthn assertion ceremony. Defaults to
   * `navigator.credentials.get()`; mainly useful for tests and custom signers.
   */
  getAssertion?: (challenge: Buffer, credentialId: Buffer) => Promise<PasskeyAssertion>;
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

/**
 * Compute the 32-byte payload a smart account's `__check_auth` receives for
 * `entry`: `sha256(HashIdPreimage::SorobanAuthorization)`.
 *
 * The entry must use address credentials.
 */
export function hashAuthEntry(
  entry: xdr.SorobanAuthorizationEntry,
  networkPassphrase: string,
  validUntilLedgerSeq: number
): Buffer {
  const credentials = entry.credentials();
  if (credentials.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
    throw new Error("Only address-credential authorization entries can be signed by a passkey");
  }
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(networkPassphrase)),
      nonce: credentials.address().nonce(),
      signatureExpirationLedger: validUntilLedgerSeq,
      invocation: entry.rootInvocation(),
    })
  );
  return hash(preimage.toXDR());
}

/**
 * Returns `true` when `clientDataJSON` is a `webauthn.get` assertion whose
 * challenge equals `expectedHash`.
 */
export function verifyClientDataChallenge(
  clientDataJSON: Uint8Array,
  expectedHash: Uint8Array
): boolean {
  try {
    const clientData = JSON.parse(Buffer.from(clientDataJSON).toString("utf8")) as {
      type?: string;
      challenge?: string;
    };
    return (
      clientData.type === "webauthn.get" &&
      typeof clientData.challenge === "string" &&
      fromBase64Url(clientData.challenge).equals(Buffer.from(expectedHash))
    );
  } catch {
    return false;
  }
}

// ─── Signature formatting ────────────────────────────────────────────────────

/**
 * Format a WebAuthn assertion into the smart account signature struct:
 *
 * ```rust
 * pub struct Signature {
 *     pub authenticator_data: Bytes,
 *     pub client_data_json: Bytes,
 *     pub id: Bytes,
 *     pub signature: BytesN<64>,
 * }
 * ```
 *
 * Map keys are emitted in sorted order, as required for `ScMap`.
 */
export function formatPasskeySignature(assertion: PasskeyAssertion): xdr.ScVal {
  const field = (key: string, val: xdr.ScVal) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });

  return xdr.ScVal.scvMap([
    field("authenticator_data", xdr.ScVal.scvBytes(Buffer.from(assertion.authenticatorData))),
    field("client_data_json", xdr.ScVal.scvBytes(Buffer.from(assertion.clientDataJSON))),
    field("id", xdr.ScVal.scvBytes(Buffer.from(assertion.credentialId))),
    field("signature", xdr.ScVal.scvBytes(derToCompactSignature(assertion.signature))),
  ]);
}

// ─── WebAuthn ceremony ───────────────────────────────────────────────────────

async function navigatorGetAssertion(
  challenge: Buffer,
  credentialId: Buffer,
  rpId: string | undefined,
  timeout: number
): Promise<PasskeyAssertion> {
  if (typeof navigator === "undefined" || !navigator.credentials?.get) {
    throw new Error("WebAuthn is not available in this environment");
  }
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      timeout,
      userVerification: "required",
      allowCredentials: [{ type: "public-key", id: credentialId }],
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey assertion was cancelled");

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    credentialId: new Uint8Array(credential.rawId),
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON: new Uint8Array(response.clientDataJSON),
    signature: new Uint8Array(response.signature),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Sign a single `SorobanAuthorizationEntry` with a passkey.
 *
 * Hashes the entry, prompts the WebAuthn assertion ceremony with that hash as
 * the challenge, verifies the returned `clientDataJSON` commits to it, and
 * returns a copy of the entry carrying the formatted smart account signature
 * and expiration ledger.
 */
export async function signAuthEntry(
  entry: xdr.SorobanAuthorizationEntry,
  options: SignAuthEntryOptions
): Promise<xdr.SorobanAuthorizationEntry> {
  const { credentialId, networkPassphrase, validUntilLedgerSeq, rpId, timeout = 60_000 } = options;

  const signed = xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());
  const payload = hashAuthEntry(signed, networkPassphrase, validUntilLedgerSeq);
  const id = fromBase64Url(credentialId);

  const assertion = options.getAssertion
    ? await options.getAssertion(payload, id)
    : await navigatorGetAssertion(payload, id, rpId, timeout);

  if (!verifyClientDataChallenge(assertion.clientDataJSON, payload)) {
    throw new Error(
      `Passkey assertion challenge does not match authorization entry hash ${toBase64Url(payload)}`
    );
  }

  const addressCredentials = signed.credentials().address();
  addressCredentials.signatureExpirationLedger(validUntilLedgerSeq);
  addressCredentials.signature(formatPasskeySignature(assertion));
  return signed;
}
