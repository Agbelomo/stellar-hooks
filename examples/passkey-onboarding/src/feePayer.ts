import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import type { PasskeyFeePayer } from "stellar-hooks";

/**
 * Demo-only fee sponsor.
 *
 * Passkey smart accounts are contracts, so someone else must be the source of
 * the outer transaction and pay its fee. In production this is a relayer or
 * sponsorship service; here we generate a throwaway testnet key and fund it
 * with Friendbot. The user never sees or handles this key — their authority
 * comes entirely from the passkey.
 */
export function createDemoFeePayer(): PasskeyFeePayer & { fund: () => Promise<void> } {
  const keypair = Keypair.random();

  return {
    publicKey: keypair.publicKey(),
    async signTransaction(txXdr, { networkPassphrase }) {
      const tx = TransactionBuilder.fromXDR(txXdr, networkPassphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
    async fund() {
      const res = await fetch(`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`);
      if (!res.ok) throw new Error(`Friendbot failed with ${res.status}`);
    },
  };
}
