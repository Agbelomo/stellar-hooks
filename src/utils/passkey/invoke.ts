/**
 * @file invoke.ts
 * @description Build, authorise, and submit Soroban invocations on behalf of a passkey smart account.
 * @package stellar-hooks
 * @license MIT
 */

import {
  Address,
  Operation,
  TransactionBuilder,
  rpc,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Account that pays fees and is the source of the outer transaction.
 *
 * Passkey smart accounts are contracts and cannot be transaction sources, so a
 * relayer, sponsor, or app-managed key must submit on their behalf. The user's
 * authority comes solely from the passkey-signed authorization entries.
 */
export interface PasskeyFeePayer {
  /** `G…` public key of the fee-paying account */
  publicKey: string;
  /** Sign the transaction XDR and return the signed XDR */
  signTransaction: (txXdr: string, opts: { networkPassphrase: string }) => Promise<string>;
}

export interface InvokeContractParams {
  /** Contract to invoke */
  contractId: string;
  /** Contract function name */
  method: string;
  /** Function arguments */
  args?: xdr.ScVal[];
}

export interface SubmitSorobanOptions {
  server: rpc.Server;
  networkPassphrase: string;
  feePayer: PasskeyFeePayer;
  /** Base fee in stroops before resource fees. Defaults to `"100000"`. */
  fee?: string;
  /** Seconds to wait for confirmation. Defaults to `60`. */
  timeoutSeconds?: number;
}

export interface SubmitSorobanResult {
  hash: string;
  returnValue?: xdr.ScVal;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build an unsigned `invokeContract` transaction sourced from the fee payer. */
export async function buildInvokeTransaction(
  params: InvokeContractParams,
  { server, networkPassphrase, feePayer, fee = "100000" }: SubmitSorobanOptions,
  auth: xdr.SorobanAuthorizationEntry[] = []
): Promise<Transaction> {
  const source = await server.getAccount(feePayer.publicKey);
  return new TransactionBuilder(source, { fee, networkPassphrase })
    .addOperation(
      Operation.invokeContractFunction({
        contract: params.contractId,
        function: params.method,
        args: params.args ?? [],
        auth,
      })
    )
    .setTimeout(300)
    .build();
}

/** Returns the auth entries in `tx` that require `address` to sign. */
export function authEntriesFor(
  entries: xdr.SorobanAuthorizationEntry[],
  address: string
): xdr.SorobanAuthorizationEntry[] {
  return entries.filter((entry) => {
    const credentials = entry.credentials();
    if (credentials.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
      return false;
    }
    return Address.fromScAddress(credentials.address().address()).toString() === address;
  });
}

/**
 * Prepare (simulate + assemble), sign with the fee payer, submit, and poll
 * until the transaction is confirmed.
 */
export async function prepareAndSubmit(
  tx: Transaction,
  { server, networkPassphrase, feePayer, timeoutSeconds = 60 }: SubmitSorobanOptions
): Promise<SubmitSorobanResult> {
  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await feePayer.signTransaction(prepared.toXDR(), { networkPassphrase });
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new Error(`Transaction submission failed with status ${sent.status}`);
  }

  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { hash: sent.hash, returnValue: result.returnValue };
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction ${sent.hash} failed on-chain`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for transaction ${sent.hash}`);
}
