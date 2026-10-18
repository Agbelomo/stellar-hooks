/**
 * @file useFriendbot.ts
 * @description Hook that funds a testnet/futurenet account through Friendbot.
 * @package stellar-hooks
 * @license MIT
 */

import { useCallback, useRef, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk/minimal";
import { useStellarContext } from "../context";

export type FriendbotStatus = "idle" | "funding" | "funded" | "already_funded" | "error";

export interface UseFriendbotOptions {
  /** Account to fund when `fund()` is called without an argument. */
  account?: string | null;
  /**
   * Friendbot base URL. Defaults to the public Friendbot for the active
   * network; required on `custom` networks.
   */
  friendbotUrl?: string;
  /** Called after a successful funding, with the funded account. */
  onFunded?: (account: string) => void;
  /** Called when funding fails (not when the account was already funded). */
  onError?: (error: Error) => void;
}

export interface UseFriendbotReturn {
  /** Ask Friendbot to fund `account`. Resolves with the final status. */
  fund: (account?: string) => Promise<FriendbotStatus>;
  status: FriendbotStatus;
  isFunding: boolean;
  /** True after a successful funding or when the account already existed. */
  isFunded: boolean;
  isAlreadyFunded: boolean;
  error: Error | null;
  /** Hash of the funding transaction, when Friendbot returned one. */
  hash: string | null;
  reset: () => void;
}

const FRIENDBOT_URLS: Record<string, string> = {
  testnet: "https://friendbot.stellar.org",
  futurenet: "https://friendbot-futurenet.stellar.org",
};

/** Friendbot reports "already funded" in a few different shapes over time. */
function isAlreadyFundedBody(body: unknown, rawText: string): boolean {
  const haystack = JSON.stringify(body ?? {}) + rawText;
  return /createAccountAlreadyExist|op_already_exists|already[ _]funded/i.test(haystack);
}

/**
 * Request test funds from Friendbot for an account and report success,
 * already-funded and failure states. Only available on testnet and
 * futurenet (or a custom network with a `friendbotUrl`).
 *
 * @example
 * ```tsx
 * const { fund, status, isFunding, error } = useFriendbot({ account: publicKey });
 * <button onClick={() => fund()} disabled={isFunding}>Fund account</button>
 * ```
 */
export function useFriendbot({
  account,
  friendbotUrl,
  onFunded,
  onError,
}: UseFriendbotOptions = {}): UseFriendbotReturn {
  const { config } = useStellarContext();
  const [status, setStatus] = useState<FriendbotStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fund = useCallback(
    async (target?: string): Promise<FriendbotStatus> => {
      const address = target ?? account ?? undefined;
      const fail = (message: string): FriendbotStatus => {
        const err = new Error(message);
        setError(err);
        setStatus("error");
        onError?.(err);
        return "error";
      };

      if (inFlight.current) return "funding";
      setError(null);
      setHash(null);

      if (!address || !StrKey.isValidEd25519PublicKey(address)) {
        return fail(`"${address ?? ""}" is not a valid Stellar public key.`);
      }
      const base = friendbotUrl ?? FRIENDBOT_URLS[config.network];
      if (!base) {
        return fail(
          config.network === "mainnet"
            ? "Friendbot is only available on test networks, not mainnet."
            : `No Friendbot URL for the "${config.network}" network. Pass friendbotUrl.`,
        );
      }

      inFlight.current = true;
      setStatus("funding");
      try {
        const response = await fetch(`${base.replace(/\/+$/, "")}?addr=${encodeURIComponent(address)}`);
        const text = await response.text();
        let body: unknown = null;
        try {
          body = JSON.parse(text);
        } catch {
          // non-JSON body; the raw text is still searched below
        }

        if (response.ok) {
          const txHash = (body as { hash?: unknown } | null)?.hash;
          if (typeof txHash === "string") setHash(txHash);
          setStatus("funded");
          onFunded?.(address);
          return "funded";
        }
        if (isAlreadyFundedBody(body, text)) {
          setStatus("already_funded");
          return "already_funded";
        }
        const detail = (body as { detail?: unknown; title?: unknown } | null);
        const reason =
          (typeof detail?.detail === "string" && detail.detail) ||
          (typeof detail?.title === "string" && detail.title) ||
          response.statusText;
        return fail(`Friendbot request failed (${response.status}): ${reason}`);
      } catch (err) {
        return fail(`Could not reach Friendbot: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        inFlight.current = false;
      }
    },
    [account, friendbotUrl, config.network, onFunded, onError],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setHash(null);
  }, []);

  return {
    fund,
    status,
    isFunding: status === "funding",
    isFunded: status === "funded" || status === "already_funded",
    isAlreadyFunded: status === "already_funded",
    error,
    hash,
    reset,
  };
}
