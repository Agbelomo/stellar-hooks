/**
 * @file webauthn.ts
 * @description Low-level WebAuthn / P-256 encoding helpers for passkey smart accounts.
 * @package stellar-hooks
 * @license MIT
 */

import { hash, StrKey, xdr, Address } from "@stellar/stellar-sdk";

// ─── Constants ───────────────────────────────────────────────────────────────

/** COSE algorithm identifier for ECDSA w/ SHA-256 on P-256 (ES256). */
export const COSE_ALG_ES256 = -7;

/** Order of the P-256 curve, used to normalise signatures to low-S form. */
const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const P256_HALF_N = P256_N >> BigInt(1);

// ─── Base64url ───────────────────────────────────────────────────────────────

/** Encode bytes as unpadded base64url, as used by WebAuthn `clientDataJSON.challenge`. */
export function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  return Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode an (optionally unpadded) base64url string into bytes. */
export function fromBase64Url(value: string): Buffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64 + "=".repeat((4 - (base64.length % 4)) % 4), "base64");
}

// ─── Public key ──────────────────────────────────────────────────────────────

/**
 * Extract the 65-byte uncompressed SEC1 P-256 public key (`0x04 || X || Y`)
 * from the SubjectPublicKeyInfo DER returned by
 * `AuthenticatorAttestationResponse.getPublicKey()`.
 */
export function extractP256PublicKey(spki: Uint8Array | ArrayBuffer): Buffer {
  const bytes = Buffer.from(spki instanceof ArrayBuffer ? new Uint8Array(spki) : spki);
  // The uncompressed point is always the trailing 65 bytes of a P-256 SPKI.
  const key = bytes.subarray(bytes.length - 65);
  if (key.length !== 65 || key[0] !== 0x04) {
    throw new Error("Passkey public key is not an uncompressed P-256 point");
  }
  return Buffer.from(key);
}

// ─── Signature ───────────────────────────────────────────────────────────────

function readDerInteger(der: Uint8Array, offset: number): { value: Uint8Array; next: number } {
  if (der[offset] !== 0x02) throw new Error("Invalid DER signature: expected INTEGER");
  const length = der[offset + 1];
  const start = offset + 2;
  return { value: der.subarray(start, start + length), next: start + length };
}

function toFixed32(value: bigint): Buffer {
  return Buffer.from(value.toString(16).padStart(64, "0"), "hex");
}

/**
 * Convert an ASN.1 DER-encoded ECDSA signature (as returned by WebAuthn) into
 * the raw 64-byte `r || s` form expected by Soroban's `secp256r1_verify`.
 *
 * `s` is normalised to its low-S form because the Soroban host rejects
 * high-S signatures.
 */
export function derToCompactSignature(der: Uint8Array | ArrayBuffer): Buffer {
  const bytes = der instanceof ArrayBuffer ? new Uint8Array(der) : der;
  if (bytes[0] !== 0x30) throw new Error("Invalid DER signature: expected SEQUENCE");

  const r = readDerInteger(bytes, 2);
  const s = readDerInteger(bytes, r.next);

  const rInt = BigInt("0x" + Buffer.from(r.value).toString("hex"));
  let sInt = BigInt("0x" + Buffer.from(s.value).toString("hex"));
  if (sInt > P256_HALF_N) sInt = P256_N - sInt;

  return Buffer.concat([toFixed32(rInt), toFixed32(sInt)]);
}

// ─── Addresses ───────────────────────────────────────────────────────────────

/**
 * Derive the contract salt for a passkey smart account from its WebAuthn
 * credential ID: `sha256(credentialId)`.
 */
export function deriveSmartAccountSalt(credentialId: Uint8Array | ArrayBuffer): Buffer {
  return hash(Buffer.from(credentialId instanceof ArrayBuffer ? new Uint8Array(credentialId) : credentialId));
}

/**
 * Derive the `C…` address a factory contract will deploy a smart account to,
 * per the Soroban `HashIdPreimage::ContractId` spec:
 *
 *   sha256(HashIdPreimage::ContractId { networkId, ContractIdPreimage::FromAddress(factory, salt) })
 */
export function deriveSmartAccountAddress(
  factoryContractId: string,
  salt: Uint8Array,
  networkPassphrase: string
): string {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(networkPassphrase)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(factoryContractId).toScAddress(),
          salt: Buffer.from(salt),
        })
      ),
    })
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}
