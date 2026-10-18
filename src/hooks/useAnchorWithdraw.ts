/**
 * @file useAnchorWithdraw.ts
 * @description Hook for SEP-24 interactive withdrawals and building the payment to the anchor.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useRef, useState } from "react";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Operation,
  TransactionBuilder,
  type Transaction,
} from "@stellar/stellar-sdk";
import { useOptionalStellarContext } from "../context";
import {
  postSep24Interactive,
  sep24Request,
  sep24Url,
  toSep24Body,
  type Sep24InteractiveParams,
  type Sep24InteractiveResponse,
} from "../utils/sep24";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AnchorWithdrawParams = Sep24InteractiveParams;

/** Subset of a SEP-24 withdrawal transaction needed to pay the anchor. */
export interface AnchorWithdrawTransaction {
  id: string;
  kind?: string;
  status: string;
  amount_in?: string;
  /** SEP-38 asset identifier, e.g. `"stellar:USDC:G…"` */
  amount_in_asset?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: "text" | "id" | "hash";
  /** Legacy / non-standard aliases some anchors return */
  account_id?: string;
  memo?: string;
  memo_type?: "text" | "id" | "hash";
  [key: string]: unknown;
}

export interface BuildWithdrawalPaymentParams {
  /** Anchor transaction ID returned by `withdraw` */
  transactionId: string;
  /** Amount to send. Defaults to the anchor's `amount_in`. */
  amount?: string;
  /** Asset to send. Defaults to the anchor's `amount_in_asset`. */
  asset?: Asset;
  /** Base fee in stroops. Defaults to `BASE_FEE`. */
  fee?: string;
  /** Transaction timeout in seconds. Defaults to `300`. */
  timeoutSeconds?: number;
}

export interface WithdrawalPayment {
  /** Unsigned payment transaction, ready for signing */
  transaction: Transaction;
  /** Base64 XDR of `transaction` */
  xdr: string;
  /** Anchor account receiving the payment */
  destination: string;
  amount: string;
  asset: Asset;
  memo: Memo;
  /** The anchor transaction record the payment was built from */
  anchorTransaction: AnchorWithdrawTransaction;
}

export interface UseAnchorWithdrawOptions {
  /** Anchor's `TRANSFER_SERVER_SEP0024` URL (see `useAnchorInfo`) */
  anchorUrl: string | null | undefined;
  /** SEP-10 JWT (see `useWebAuth`) */
  jwt: string | null | undefined;
  /** `G…` account that will send the withdrawal payment */
  walletAccount: string | null | undefined;
  /** Network passphrase. Defaults to the `<StellarProvider>` network. */
  networkPassphrase?: string;
  /** Horizon URL. Defaults to the `<StellarProvider>` network. */
  horizonUrl?: string;
  /** Pre-built Horizon server; takes precedence over `horizonUrl`. */
  horizonServer?: Horizon.Server;
}

export interface UseAnchorWithdrawReturn {
  /** Start an interactive withdrawal; resolves with the anchor's response */
  withdraw: (params: AnchorWithdrawParams) => Promise<Sep24InteractiveResponse>;
  /**
   * Fetch the anchor transaction and build the payment to the anchor's
   * account with its memo. Requires the transaction to be in
   * `pending_user_transfer_start`.
   */
  buildWithdrawalPayment: (params: BuildWithdrawalPaymentParams) => Promise<WithdrawalPayment>;
  /** Interactive flow URL from the last successful `withdraw` */
  url: string | null;
  /** Anchor transaction ID from the last successful `withdraw` */
  transactionId: string | null;
  /** True while a request is in flight */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Clear `url`, `transactionId`, and `error` */
  reset: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a SEP-38 `stellar:CODE:ISSUER` (or `stellar:native`) identifier. */
export function parseSep38Asset(identifier: string): Asset {
  const [scheme, code, issuer] = identifier.split(":");
  if (scheme !== "stellar" || !code) {
    throw new Error(`Unsupported asset identifier "${identifier}"`);
  }
  if (code === "native") return Asset.native();
  if (!issuer) throw new Error(`Asset identifier "${identifier}" is missing an issuer`);
  return new Asset(code, issuer);
}

/** Build a Stellar memo from SEP-24 `withdraw_memo` / `withdraw_memo_type`. */
export function sep24Memo(memo: string | undefined, memoType: string | undefined): Memo {
  if (!memo) return Memo.none();
  switch (memoType ?? "text") {
    case "id":
      return Memo.id(memo);
    case "hash":
      // SEP-24 encodes hash memos as base64.
      return Memo.hash(Buffer.from(memo, "base64"));
    case "text":
      return Memo.text(memo);
    default:
      throw new Error(`Unsupported memo type "${memoType}"`);
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Initiates SEP-24 interactive withdrawals via
 * `POST /transactions/withdraw/interactive`, then builds the Stellar payment
 * to the anchor once the user completes the interactive flow.
 *
 * @example
 * ```tsx
 * const { withdraw, buildWithdrawalPayment, url, transactionId } = useAnchorWithdraw({
 *   anchorUrl: transferServer,
 *   jwt,
 *   walletAccount: publicKey,
 * });
 *
 * await withdraw({ assetCode: "USDC" });   // open `url` for the user
 * // …once the anchor reports pending_user_transfer_start:
 * const { xdr } = await buildWithdrawalPayment({ transactionId });
 * const signed = await signTransaction(xdr);
 * ```
 */
export function useAnchorWithdraw(options: UseAnchorWithdrawOptions): UseAnchorWithdrawReturn {
  const { anchorUrl, jwt, walletAccount } = options;
  const context = useOptionalStellarContext();
  const [url, setUrl] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const networkPassphrase = options.networkPassphrase ?? context?.config.networkPassphrase;
  const horizonUrl = options.horizonUrl ?? context?.config.horizonUrl;

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const withdraw = useCallback(
    (params: AnchorWithdrawParams) =>
      run(async () => {
        if (!anchorUrl) throw new Error("anchorUrl is required");
        if (!jwt) throw new Error("jwt is required");

        const body = toSep24Body({ ...params, account: params.account ?? walletAccount ?? undefined });
        const response = await postSep24Interactive(anchorUrl, jwt, "withdraw", body);
        setUrl(response.url);
        setTransactionId(response.id);
        return response;
      }),
    [run, anchorUrl, jwt, walletAccount]
  );

  const buildWithdrawalPayment = useCallback(
    (params: BuildWithdrawalPaymentParams) =>
      run(async (): Promise<WithdrawalPayment> => {
        if (!anchorUrl) throw new Error("anchorUrl is required");
        if (!jwt) throw new Error("jwt is required");
        if (!walletAccount) throw new Error("walletAccount is required");
        if (!networkPassphrase) throw new Error("networkPassphrase is required");

        const { transaction: tx } = await sep24Request<{ transaction: AnchorWithdrawTransaction }>(
          `${sep24Url(anchorUrl, "/transaction")}?id=${encodeURIComponent(params.transactionId)}`,
          jwt
        );
        if (!tx) throw new Error("Anchor response did not include a transaction");
        if (tx.kind && tx.kind !== "withdrawal" && tx.kind !== "withdraw") {
          throw new Error(`Transaction ${tx.id} is a ${tx.kind}, not a withdrawal`);
        }
        if (tx.status !== "pending_user_transfer_start") {
          throw new Error(
            `Transaction ${tx.id} is "${tx.status}"; expected "pending_user_transfer_start"`
          );
        }

        const destination = tx.withdraw_anchor_account ?? tx.account_id;
        if (!destination) throw new Error("Anchor did not provide a withdrawal account");

        const amount = params.amount ?? tx.amount_in;
        if (!amount) throw new Error("amount is required; the anchor did not provide amount_in");

        let asset = params.asset;
        if (!asset) {
          if (!tx.amount_in_asset) {
            throw new Error("asset is required; the anchor did not provide amount_in_asset");
          }
          asset = parseSep38Asset(tx.amount_in_asset);
        }

        const memo = sep24Memo(tx.withdraw_memo ?? tx.memo, tx.withdraw_memo_type ?? tx.memo_type);

        const { horizonServer } = optionsRef.current;
        if (!horizonServer && !horizonUrl) throw new Error("horizonUrl is required");
        const server =
          horizonServer ??
          new Horizon.Server(horizonUrl!, { allowHttp: horizonUrl!.startsWith("http://") });
        const source = await server.loadAccount(walletAccount);

        const transaction = new TransactionBuilder(source, {
          fee: params.fee ?? BASE_FEE,
          networkPassphrase,
        })
          .addOperation(Operation.payment({ destination, asset, amount }))
          .addMemo(memo)
          .setTimeout(params.timeoutSeconds ?? 300)
          .build();

        return {
          transaction,
          xdr: transaction.toXDR(),
          destination,
          amount,
          asset,
          memo,
          anchorTransaction: tx,
        };
      }),
    [run, anchorUrl, jwt, walletAccount, networkPassphrase, horizonUrl]
  );

  const reset = useCallback(() => {
    setUrl(null);
    setTransactionId(null);
    setError(null);
  }, []);

  return { withdraw, buildWithdrawalPayment, url, transactionId, isLoading, error, reset };
}
