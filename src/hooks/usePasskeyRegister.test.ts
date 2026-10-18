/**
 * @file usePasskeyRegister.test.ts
 * @description Unit tests for the usePasskeyRegister hook (WebAuthn registration + smart account deploy).
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { generateKeyPairSync } from "node:crypto";
import { Account, Address, Keypair, Networks, rpc, xdr } from "@stellar/stellar-sdk";
import { usePasskeyRegister } from "./usePasskeyRegister";
import {
  COSE_ALG_ES256,
  deriveSmartAccountAddress,
  deriveSmartAccountSalt,
  toBase64Url,
} from "../utils/passkey/webauthn";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FACTORY = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const PASSPHRASE = Networks.TESTNET;
const RAW_ID = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const FEE_PAYER = Keypair.random();
const TX_HASH = "a".repeat(64);

const SPKI = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({
  type: "spki",
  format: "der",
});

const EXPECTED_ADDRESS = deriveSmartAccountAddress(
  FACTORY,
  deriveSmartAccountSalt(RAW_ID),
  PASSPHRASE
);

const createMock = vi.fn();

function mockServer(returnValue?: xdr.ScVal) {
  return {
    getAccount: vi.fn().mockResolvedValue(new Account(FEE_PAYER.publicKey(), "1")),
    prepareTransaction: vi.fn(async (tx) => tx),
    sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: TX_HASH }),
    getTransaction: vi.fn().mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      returnValue,
    }),
  };
}

const feePayer = {
  publicKey: FEE_PAYER.publicKey(),
  signTransaction: vi.fn(async (txXdr: string) => txXdr),
};

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({
    rawId: RAW_ID.buffer,
    response: {
      getPublicKey: () => SPKI,
      getPublicKeyAlgorithm: () => COSE_ALG_ES256,
    },
  });
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { create: createMock },
  });
});

afterEach(() => {
  delete (navigator as { credentials?: unknown }).credentials;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("usePasskeyRegister", () => {
  it("requests an ES256 passkey with user verification", async () => {
    const { result } = renderHook(() =>
      usePasskeyRegister({ factoryContractId: FACTORY, networkPassphrase: PASSPHRASE, deploy: false })
    );

    await act(async () => {
      await result.current.register({ userName: "alice@example.com" });
    });

    const { publicKey } = createMock.mock.calls[0][0] as CredentialCreationOptions;
    expect(publicKey!.pubKeyCredParams).toEqual([{ type: "public-key", alg: -7 }]);
    expect(publicKey!.authenticatorSelection?.userVerification).toBe("required");
    expect(publicKey!.user.name).toBe("alice@example.com");
    expect((publicKey!.challenge as Uint8Array).byteLength).toBe(32);
  });

  it("derives the smart account address from the factory and credential ID", async () => {
    const { result } = renderHook(() =>
      usePasskeyRegister({ factoryContractId: FACTORY, networkPassphrase: PASSPHRASE, deploy: false })
    );

    let registered: Awaited<ReturnType<typeof result.current.register>> | undefined;
    await act(async () => {
      registered = await result.current.register({ userName: "alice" });
    });

    expect(registered!.contractAddress).toBe(EXPECTED_ADDRESS);
    expect(result.current.contractAddress).toBe(EXPECTED_ADDRESS);
    expect(result.current.credential?.id).toBe(toBase64Url(RAW_ID));
    expect(result.current.credential?.publicKey).toHaveLength(65);
    expect(result.current.transactionHash).toBeNull();
  });

  it("deploys the smart account through the factory", async () => {
    const server = mockServer(new Address(EXPECTED_ADDRESS).toScVal());
    const { result } = renderHook(() =>
      usePasskeyRegister({
        factoryContractId: FACTORY,
        networkPassphrase: PASSPHRASE,
        sorobanRpcServer: server as unknown as rpc.Server,
        feePayer,
      })
    );

    await act(async () => {
      await result.current.register({ userName: "alice" });
    });

    expect(server.prepareTransaction).toHaveBeenCalledTimes(1);
    const tx = server.prepareTransaction.mock.calls[0][0];
    expect(tx.source).toBe(FEE_PAYER.publicKey());

    const invoke = tx.operations[0].func.invokeContract();
    expect(Address.fromScAddress(invoke.contractAddress()).toString()).toBe(FACTORY);
    expect(invoke.functionName().toString()).toBe("deploy");
    const [salt, id, pk] = invoke.args();
    expect(Buffer.from(salt.bytes()).equals(deriveSmartAccountSalt(RAW_ID))).toBe(true);
    expect(Buffer.from(id.bytes()).equals(Buffer.from(RAW_ID))).toBe(true);
    expect(pk.bytes()).toHaveLength(65);

    expect(feePayer.signTransaction).toHaveBeenCalled();
    expect(result.current.transactionHash).toBe(TX_HASH);
    expect(result.current.contractAddress).toBe(EXPECTED_ADDRESS);
    expect(result.current.isRegistering).toBe(false);
  });

  it("prefers the address returned by the factory", async () => {
    const other = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
    const server = mockServer(new Address(other).toScVal());
    const { result } = renderHook(() =>
      usePasskeyRegister({
        factoryContractId: FACTORY,
        networkPassphrase: PASSPHRASE,
        sorobanRpcServer: server as unknown as rpc.Server,
        feePayer,
      })
    );

    await act(async () => {
      await result.current.register({ userName: "alice" });
    });
    expect(result.current.contractAddress).toBe(other);
  });

  it("surfaces a cancelled ceremony as an error", async () => {
    createMock.mockResolvedValue(null);
    const { result } = renderHook(() =>
      usePasskeyRegister({ factoryContractId: FACTORY, networkPassphrase: PASSPHRASE, deploy: false })
    );

    await act(async () => {
      await expect(result.current.register({ userName: "alice" })).rejects.toThrow(/cancelled/);
    });
    expect(result.current.error?.message).toMatch(/cancelled/);
    expect(result.current.contractAddress).toBeNull();
  });

  it("rejects non-ES256 credentials", async () => {
    createMock.mockResolvedValue({
      rawId: RAW_ID.buffer,
      response: { getPublicKey: () => SPKI, getPublicKeyAlgorithm: () => -257 },
    });
    const { result } = renderHook(() =>
      usePasskeyRegister({ factoryContractId: FACTORY, networkPassphrase: PASSPHRASE, deploy: false })
    );

    await act(async () => {
      await expect(result.current.register({ userName: "alice" })).rejects.toThrow(/ES256/);
    });
  });

  it("requires a fee payer to deploy", async () => {
    const { result } = renderHook(() =>
      usePasskeyRegister({
        factoryContractId: FACTORY,
        networkPassphrase: PASSPHRASE,
        sorobanRpcServer: mockServer() as unknown as rpc.Server,
      })
    );

    await act(async () => {
      await expect(result.current.register({ userName: "alice" })).rejects.toThrow(/feePayer/);
    });
  });
});
