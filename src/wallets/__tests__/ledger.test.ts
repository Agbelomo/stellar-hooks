/**
 * @file ledger.test.ts
 * @description Ledger adapter behaviour with a mocked WebUSB transport and
 *   Stellar app. This is the automated part of the hardware-wallet matrix
 *   (docs/HARDWARE_WALLET_COMPATIBILITY.md); it cannot replace device testing.
 * @package stellar-hooks
 * @license MIT
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const create = vi.fn();
const getPublicKey = vi.fn();
const signTransaction = vi.fn();

vi.mock("@ledgerhq/hw-transport-webusb", () => ({ default: { create } }));
vi.mock("@ledgerhq/hw-app-str", () => ({
  default: vi.fn().mockImplementation(() => ({ getPublicKey, signTransaction })),
}));

import { createLedgerAdapter } from "../ledger";

const PATH = "44'/148'/0'";

beforeEach(() => {
  create.mockReset().mockResolvedValue({ close: vi.fn() });
  getPublicKey.mockReset().mockResolvedValue({ publicKey: "GLEDGERKEY" });
  signTransaction.mockReset().mockResolvedValue({ signature: Buffer.from("sig-bytes") });
});
afterEach(() => vi.unstubAllGlobals());

describe("Ledger wallet adapter", () => {
  it("identifies itself and declares the Stellar app's limits", () => {
    const adapter = createLedgerAdapter();
    expect(adapter.id).toBe("ledger");
    expect(adapter.meta.supportsSignMessage).toBe(false);
    expect(adapter.meta.supportsSignAuthEntry).toBe(false);
  });

  it("is installed only where WebUSB exists", () => {
    vi.stubGlobal("navigator", { usb: {} });
    expect(createLedgerAdapter().isInstalled()).toBe(true);
    vi.stubGlobal("navigator", {});
    expect(createLedgerAdapter().isInstalled()).toBe(false);
  });

  it("connects at the default Stellar derivation path and returns the public key", async () => {
    await expect(createLedgerAdapter().connect()).resolves.toBe("GLEDGERKEY");
    expect(create).toHaveBeenCalledTimes(1);
    expect(getPublicKey).toHaveBeenCalledWith(PATH);
  });

  it("signs the base64 XDR on the device and returns a base64 signature", async () => {
    const xdrBase64 = Buffer.from("transaction-envelope").toString("base64");
    const signature = await createLedgerAdapter().signTransaction(xdrBase64);

    const [path, payload] = signTransaction.mock.calls[0];
    expect(path).toBe(PATH);
    expect(Buffer.from(payload).toString()).toBe("transaction-envelope");
    expect(signature).toBe(Buffer.from("sig-bytes").toString("base64"));
  });

  it("propagates a device rejection to the caller", async () => {
    signTransaction.mockRejectedValue(Object.assign(new Error("Ledger device: Condition of use not satisfied"), { statusCode: 0x6985 }));
    await expect(createLedgerAdapter().signTransaction("AAAA")).rejects.toMatchObject({ statusCode: 0x6985 });
  });

  it("propagates transport failures such as a locked or disconnected device", async () => {
    create.mockRejectedValue(new Error("No device selected"));
    await expect(createLedgerAdapter().connect()).rejects.toThrow("No device selected");
    await expect(createLedgerAdapter().signTransaction("AAAA")).rejects.toThrow("No device selected");
  });
});
