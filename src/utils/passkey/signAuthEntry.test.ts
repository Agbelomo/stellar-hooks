/**
 * @file signAuthEntry.test.ts
 * @description Unit tests for passkey signing of Soroban authorization entries.
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign, verify, createPublicKey } from "node:crypto";
import { Address, Networks, hash, xdr } from "@stellar/stellar-sdk";
import {
  signAuthEntry,
  hashAuthEntry,
  verifyClientDataChallenge,
  formatPasskeySignature,
  type PasskeyAssertion,
} from "./signAuthEntry";
import {
  derToCompactSignature,
  extractP256PublicKey,
  toBase64Url,
  fromBase64Url,
  deriveSmartAccountAddress,
  deriveSmartAccountSalt,
} from "./webauthn";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PASSPHRASE = Networks.TESTNET;
const SMART_ACCOUNT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const TARGET = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const CREDENTIAL_ID = Buffer.from("test-credential-id");
const EXPIRY = 123_456;

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

function makeEntry(): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(SMART_ACCOUNT).toScAddress(),
        nonce: xdr.Int64.fromString("42"),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      })
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(TARGET).toScAddress(),
          functionName: "transfer",
          args: [],
        })
      ),
      subInvocations: [],
    }),
  });
}

/** Simulate an authenticator: sign `authenticatorData || sha256(clientDataJSON)`. */
function fakeAssertion(challenge: Buffer, type = "webauthn.get"): PasskeyAssertion {
  const authenticatorData = Buffer.alloc(37, 1);
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type, challenge: toBase64Url(challenge), origin: "https://example.com" })
  );
  const signature = sign("sha256", Buffer.concat([authenticatorData, hash(clientDataJSON)]), privateKey);
  return { credentialId: CREDENTIAL_ID, authenticatorData, clientDataJSON, signature };
}

function mapToObject(val: xdr.ScVal): Record<string, Buffer> {
  return Object.fromEntries(
    val.map()!.map((e) => [e.key().sym().toString(), Buffer.from(e.val().bytes())])
  );
}

// ─── Encoding ─────────────────────────────────────────────────────────────────

describe("webauthn encoding helpers", () => {
  it("round-trips base64url without padding", () => {
    const bytes = Buffer.from([0xfb, 0xff, 0xfe, 0x01]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(fromBase64Url(encoded).equals(bytes)).toBe(true);
  });

  it("extracts the uncompressed P-256 key from SPKI DER", () => {
    const spki = publicKey.export({ type: "spki", format: "der" });
    const raw = extractP256PublicKey(spki);
    expect(raw).toHaveLength(65);
    expect(raw[0]).toBe(0x04);
  });

  it("converts DER signatures to 64-byte low-S r||s", () => {
    const message = Buffer.from("hello");
    for (let i = 0; i < 20; i++) {
      const compact = derToCompactSignature(sign("sha256", message, privateKey));
      expect(compact).toHaveLength(64);

      const s = BigInt("0x" + compact.subarray(32).toString("hex"));
      const halfN = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551") >> 1n;
      expect(s <= halfN).toBe(true);

      expect(
        verify("sha256", message, { key: publicKey, dsaEncoding: "ieee-p1363" }, compact)
      ).toBe(true);
    }
  });

  it("derives a deterministic smart account address from factory + credential", () => {
    const salt = deriveSmartAccountSalt(CREDENTIAL_ID);
    const a = deriveSmartAccountAddress(TARGET, salt, PASSPHRASE);
    expect(a).toMatch(/^C[A-Z2-7]{55}$/);
    expect(deriveSmartAccountAddress(TARGET, salt, PASSPHRASE)).toBe(a);
    expect(deriveSmartAccountAddress(TARGET, salt, Networks.PUBLIC)).not.toBe(a);
    expect(deriveSmartAccountAddress(TARGET, deriveSmartAccountSalt(Buffer.from("x")), PASSPHRASE)).not.toBe(a);
  });
});

// ─── Hashing ──────────────────────────────────────────────────────────────────

describe("hashAuthEntry", () => {
  it("hashes the HashIdPreimage::SorobanAuthorization of the entry", () => {
    const entry = makeEntry();
    const expected = hash(
      xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
        new xdr.HashIdPreimageSorobanAuthorization({
          networkId: hash(Buffer.from(PASSPHRASE)),
          nonce: xdr.Int64.fromString("42"),
          signatureExpirationLedger: EXPIRY,
          invocation: entry.rootInvocation(),
        })
      ).toXDR()
    );
    expect(hashAuthEntry(entry, PASSPHRASE, EXPIRY).equals(expected)).toBe(true);
  });

  it("changes when the expiration ledger changes", () => {
    const entry = makeEntry();
    expect(hashAuthEntry(entry, PASSPHRASE, 1).equals(hashAuthEntry(entry, PASSPHRASE, 2))).toBe(false);
  });

  it("rejects source-account credentials", () => {
    const entry = makeEntry();
    entry.credentials(xdr.SorobanCredentials.sorobanCredentialsSourceAccount());
    expect(() => hashAuthEntry(entry, PASSPHRASE, EXPIRY)).toThrow(/address-credential/);
  });
});

describe("verifyClientDataChallenge", () => {
  const challenge = hash(Buffer.from("payload"));

  it("accepts a matching webauthn.get challenge", () => {
    expect(verifyClientDataChallenge(fakeAssertion(challenge).clientDataJSON, challenge)).toBe(true);
  });

  it("rejects a mismatched challenge", () => {
    const other = hash(Buffer.from("other"));
    expect(verifyClientDataChallenge(fakeAssertion(other).clientDataJSON, challenge)).toBe(false);
  });

  it("rejects a webauthn.create client data type", () => {
    expect(
      verifyClientDataChallenge(fakeAssertion(challenge, "webauthn.create").clientDataJSON, challenge)
    ).toBe(false);
  });

  it("rejects malformed JSON", () => {
    expect(verifyClientDataChallenge(Buffer.from("not json"), challenge)).toBe(false);
  });
});

// ─── Formatting ───────────────────────────────────────────────────────────────

describe("formatPasskeySignature", () => {
  it("emits a sorted ScMap matching the smart account Signature struct", () => {
    const assertion = fakeAssertion(hash(Buffer.from("x")));
    const val = formatPasskeySignature(assertion);

    expect(val.switch()).toBe(xdr.ScValType.scvMap());
    const keys = val.map()!.map((e) => e.key().sym().toString());
    expect(keys).toEqual(["authenticator_data", "client_data_json", "id", "signature"]);

    const fields = mapToObject(val);
    expect(fields.id.equals(CREDENTIAL_ID)).toBe(true);
    expect(fields.authenticator_data.equals(Buffer.from(assertion.authenticatorData))).toBe(true);
    expect(fields.client_data_json.equals(Buffer.from(assertion.clientDataJSON))).toBe(true);
    expect(fields.signature).toHaveLength(64);
  });
});

// ─── signAuthEntry ────────────────────────────────────────────────────────────

describe("signAuthEntry", () => {
  it("signs the entry hash and attaches a verifiable signature", async () => {
    const entry = makeEntry();
    let seenChallenge: Buffer | null = null;
    let seenId: Buffer | null = null;

    const signed = await signAuthEntry(entry, {
      credentialId: toBase64Url(CREDENTIAL_ID),
      networkPassphrase: PASSPHRASE,
      validUntilLedgerSeq: EXPIRY,
      getAssertion: async (challenge, id) => {
        seenChallenge = challenge;
        seenId = id;
        return fakeAssertion(challenge);
      },
    });

    const payload = hashAuthEntry(entry, PASSPHRASE, EXPIRY);
    expect(seenChallenge!.equals(payload)).toBe(true);
    expect(seenId!.equals(CREDENTIAL_ID)).toBe(true);

    const creds = signed.credentials().address();
    expect(creds.signatureExpirationLedger()).toBe(EXPIRY);

    // Verify exactly what a smart account's __check_auth would verify.
    const fields = mapToObject(creds.signature());
    const signedMessage = Buffer.concat([fields.authenticator_data, hash(fields.client_data_json)]);
    const rawKey = extractP256PublicKey(publicKey.export({ type: "spki", format: "der" }));
    const key = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: toBase64Url(rawKey.subarray(1, 33)), y: toBase64Url(rawKey.subarray(33)) },
      format: "jwk",
    });
    expect(
      verify("sha256", signedMessage, { key, dsaEncoding: "ieee-p1363" }, fields.signature)
    ).toBe(true);
    expect(verifyClientDataChallenge(fields.client_data_json, payload)).toBe(true);
  });

  it("does not mutate the input entry", async () => {
    const entry = makeEntry();
    const before = entry.toXDR("base64");
    await signAuthEntry(entry, {
      credentialId: toBase64Url(CREDENTIAL_ID),
      networkPassphrase: PASSPHRASE,
      validUntilLedgerSeq: EXPIRY,
      getAssertion: async (challenge) => fakeAssertion(challenge),
    });
    expect(entry.toXDR("base64")).toBe(before);
  });

  it("rejects an assertion over a different challenge", async () => {
    await expect(
      signAuthEntry(makeEntry(), {
        credentialId: toBase64Url(CREDENTIAL_ID),
        networkPassphrase: PASSPHRASE,
        validUntilLedgerSeq: EXPIRY,
        getAssertion: async () => fakeAssertion(hash(Buffer.from("wrong"))),
      })
    ).rejects.toThrow(/does not match/);
  });

  it("uses navigator.credentials.get by default", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "credentials");
    let options: CredentialRequestOptions | undefined;
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        get: async (opts: CredentialRequestOptions) => {
          options = opts;
          const a = fakeAssertion(Buffer.from(opts.publicKey!.challenge as Uint8Array));
          return {
            rawId: a.credentialId,
            response: {
              authenticatorData: a.authenticatorData,
              clientDataJSON: a.clientDataJSON,
              signature: a.signature,
            },
          };
        },
      },
    });

    try {
      await signAuthEntry(makeEntry(), {
        credentialId: toBase64Url(CREDENTIAL_ID),
        networkPassphrase: PASSPHRASE,
        validUntilLedgerSeq: EXPIRY,
      });
      expect(options?.publicKey?.userVerification).toBe("required");
      expect(options?.publicKey?.allowCredentials?.[0].type).toBe("public-key");
    } finally {
      if (original) Object.defineProperty(navigator, "credentials", original);
      else delete (navigator as { credentials?: unknown }).credentials;
    }
  });
});
