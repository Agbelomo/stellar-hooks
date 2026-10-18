/**
 * @file usePasskeyRegister.ts
 * @description Hook for WebAuthn passkey registration and passkey smart account deployment.
 * @package stellar-hooks
 * @license MIT
 */

import { useState, useCallback, useRef } from "react";
import { Address, rpc, xdr } from "@stellar/stellar-sdk";
import { useOptionalStellarContext } from "../context";
import {
  COSE_ALG_ES256,
  deriveSmartAccountAddress,
  deriveSmartAccountSalt,
  extractP256PublicKey,
  toBase64Url,
} from "../utils/passkey/webauthn";
import {
  buildInvokeTransaction,
  prepareAndSubmit,
  type PasskeyFeePayer,
} from "../utils/passkey/invoke";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A registered passkey and its P-256 public key. */
export interface PasskeyCredential {
  /** Base64url-encoded WebAuthn credential ID */
  id: string;
  /** Raw credential ID bytes */
  rawId: Uint8Array;
  /** 65-byte uncompressed SEC1 P-256 public key */
  publicKey: Uint8Array;
}

export interface PasskeyRegisterParams {
  /** Account name shown in the platform passkey UI, e.g. an email or handle */
  userName: string;
  /** Friendly display name. Defaults to `userName`. */
  displayName?: string;
}

export interface PasskeyRegisterResult {
  credential: PasskeyCredential;
  /** `C…` address of the smart account */
  contractAddress: string;
  /** Deployment transaction hash, or `null` when `deploy` is `false` */
  transactionHash: string | null;
}

export interface UsePasskeyRegisterOptions {
  /** Factory contract that deploys passkey smart accounts */
  factoryContractId: string;
  /** Network passphrase. Defaults to the `<StellarProvider>` network. */
  networkPassphrase?: string;
  /** Soroban RPC URL. Defaults to the `<StellarProvider>` network. */
  rpcUrl?: string;
  /** Pre-built RPC server; takes precedence over `rpcUrl`. */
  sorobanRpcServer?: rpc.Server;
  /** Account that pays for and submits the deployment transaction. Required when `deploy` is `true`. */
  feePayer?: PasskeyFeePayer;
  /** Relying party name shown in the passkey prompt. Defaults to `document.title`. */
  rpName?: string;
  /** Relying party ID. Defaults to the current origin's host. */
  rpId?: string;
  /** Deploy the smart account immediately after registration. Defaults to `true`. */
  deploy?: boolean;
  /** Factory function name. Defaults to `"deploy"`. */
  deployMethod?: string;
  /**
   * Build the factory call arguments. Defaults to
   * `(salt: BytesN<32>, id: Bytes, public_key: BytesN<65>)`.
   */
  buildDeployArgs?: (params: { salt: Uint8Array; credential: PasskeyCredential }) => xdr.ScVal[];
  /** Milliseconds to wait for the user. Defaults to `60000`. */
  timeout?: number;
}

export interface UsePasskeyRegisterReturn {
  /** Run the WebAuthn registration ceremony and (optionally) deploy the smart account */
  register: (params: PasskeyRegisterParams) => Promise<PasskeyRegisterResult>;
  /** True while registration or deployment is in progress */
  isRegistering: boolean;
  /** Smart account address once registration completes */
  contractAddress: string | null;
  /** The registered passkey */
  credential: PasskeyCredential | null;
  /** Deployment transaction hash */
  transactionHash: string | null;
  /** Last error, if any */
  error: Error | null;
  /** Clear all state */
  reset: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function defaultDeployArgs({
  salt,
  credential,
}: {
  salt: Uint8Array;
  credential: PasskeyCredential;
}): xdr.ScVal[] {
  return [
    xdr.ScVal.scvBytes(Buffer.from(salt)),
    xdr.ScVal.scvBytes(Buffer.from(credential.rawId)),
    xdr.ScVal.scvBytes(Buffer.from(credential.publicKey)),
  ];
}

async function createPasskey(
  { userName, displayName }: PasskeyRegisterParams,
  { rpName, rpId, timeout }: { rpName: string; rpId?: string; timeout: number }
): Promise<PasskeyCredential> {
  if (typeof navigator === "undefined" || !navigator.credentials?.create) {
    throw new Error("WebAuthn is not available in this environment");
  }

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: rpName, ...(rpId ? { id: rpId } : {}) },
      user: { id: randomBytes(16), name: userName, displayName: displayName ?? userName },
      pubKeyCredParams: [{ type: "public-key", alg: COSE_ALG_ES256 }],
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      attestation: "none",
      timeout,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey registration was cancelled");

  const response = credential.response as AuthenticatorAttestationResponse;
  if (typeof response.getPublicKeyAlgorithm === "function" && response.getPublicKeyAlgorithm() !== COSE_ALG_ES256) {
    throw new Error("Authenticator did not create an ES256 (P-256) passkey");
  }
  const spki = response.getPublicKey?.();
  if (!spki) throw new Error("Authenticator did not return a public key");

  const rawId = new Uint8Array(credential.rawId);
  return { id: toBase64Url(rawId), rawId, publicKey: extractP256PublicKey(spki) };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Registers a WebAuthn passkey (ES256 / P-256) and deploys a passkey smart
 * account for it through a factory contract.
 *
 * The smart account address is derived deterministically from the factory and
 * `sha256(credentialId)`, so it is known before deployment confirms.
 *
 * @example
 * ```tsx
 * const { register, contractAddress, isRegistering } = usePasskeyRegister({
 *   factoryContractId: "C…",
 *   feePayer,
 * });
 * await register({ userName: "alice@example.com" });
 * ```
 */
export function usePasskeyRegister(options: UsePasskeyRegisterOptions): UsePasskeyRegisterReturn {
  const context = useOptionalStellarContext();
  const [isRegistering, setIsRegistering] = useState(false);
  const [credential, setCredential] = useState<PasskeyCredential | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const networkPassphrase = options.networkPassphrase ?? context?.config.networkPassphrase;
  const rpcUrl = options.rpcUrl ?? context?.config.sorobanRpcUrl;

  const register = useCallback(
    async (params: PasskeyRegisterParams): Promise<PasskeyRegisterResult> => {
      const {
        factoryContractId,
        sorobanRpcServer,
        feePayer,
        rpName = typeof document !== "undefined" && document.title ? document.title : "Stellar",
        rpId,
        deploy = true,
        deployMethod = "deploy",
        buildDeployArgs = defaultDeployArgs,
        timeout = 60_000,
      } = optionsRef.current;

      setIsRegistering(true);
      setError(null);
      try {
        if (!networkPassphrase) throw new Error("networkPassphrase is required");

        const passkey = await createPasskey(params, { rpName, rpId, timeout });
        setCredential(passkey);

        const salt = deriveSmartAccountSalt(passkey.rawId);
        let address = deriveSmartAccountAddress(factoryContractId, salt, networkPassphrase);
        let hash: string | null = null;

        if (deploy) {
          if (!feePayer) throw new Error("feePayer is required to deploy the smart account");
          if (!sorobanRpcServer && !rpcUrl) throw new Error("rpcUrl is required");
          const server =
            sorobanRpcServer ??
            new rpc.Server(rpcUrl!, { allowHttp: rpcUrl!.startsWith("http://") });
          const submitOptions = { server, networkPassphrase, feePayer };

          const tx = await buildInvokeTransaction(
            {
              contractId: factoryContractId,
              method: deployMethod,
              args: buildDeployArgs({ salt, credential: passkey }),
            },
            submitOptions
          );
          const result = await prepareAndSubmit(tx, submitOptions);
          hash = result.hash;
          if (result.returnValue?.switch() === xdr.ScValType.scvAddress()) {
            address = Address.fromScVal(result.returnValue).toString();
          }
        }

        setContractAddress(address);
        setTransactionHash(hash);
        return { credential: passkey, contractAddress: address, transactionHash: hash };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsRegistering(false);
      }
    },
    [networkPassphrase, rpcUrl]
  );

  const reset = useCallback(() => {
    setCredential(null);
    setContractAddress(null);
    setTransactionHash(null);
    setError(null);
  }, []);

  return { register, isRegistering, contractAddress, credential, transactionHash, error, reset };
}
