/**
 * @file sep24.ts
 * @description Shared request helpers for SEP-24 interactive deposit/withdrawal hooks.
 * @package stellar-hooks
 * @license MIT
 */

/** Response to `POST /transactions/{deposit,withdraw}/interactive`. */
export interface Sep24InteractiveResponse {
  type: "interactive_customer_info_needed";
  /** URL of the anchor's interactive flow, to open in a popup or iframe */
  url: string;
  /** Anchor transaction ID */
  id: string;
}

/** Fields common to SEP-24 interactive deposit and withdrawal requests. */
export interface Sep24InteractiveParams {
  /** Asset code, e.g. `"USDC"`. Use `"native"` for XLM. */
  assetCode: string;
  /** Asset issuer, when the anchor supports multiple assets with the same code */
  assetIssuer?: string;
  /** Amount, used to pre-fill the interactive flow */
  amount?: string;
  /** Stellar or muxed account. Defaults to the account in the SEP-10 JWT. */
  account?: string;
  /** Preferred language (RFC 4646), e.g. `"en"` */
  lang?: string;
  /** Wallet name shown in the anchor's UI */
  walletName?: string;
  /** Wallet URL shown in the anchor's UI */
  walletUrl?: string;
  /** Pre-filled SEP-9 KYC fields or anchor-specific extras */
  extraFields?: Record<string, string | boolean | number>;
}

/** Convert hook params to the SEP-24 snake_case request body. */
export function toSep24Body(params: Sep24InteractiveParams): Record<string, unknown> {
  const body: Record<string, unknown> = { ...params.extraFields, asset_code: params.assetCode };
  if (params.assetIssuer) body.asset_issuer = params.assetIssuer;
  if (params.amount) body.amount = params.amount;
  if (params.account) body.account = params.account;
  if (params.lang) body.lang = params.lang;
  if (params.walletName) body.wallet_name = params.walletName;
  if (params.walletUrl) body.wallet_url = params.walletUrl;
  return body;
}

/** Join an anchor base URL and path without doubling slashes. */
export function sep24Url(anchorUrl: string, path: string): string {
  return `${anchorUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * Perform an authenticated SEP-24 request and parse the JSON response,
 * surfacing the anchor's `error` field on failure.
 */
export async function sep24Request<T>(
  url: string,
  jwt: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${jwt}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      detail = json.error || json.message || "";
    } catch {
      detail = text.slice(0, 200);
    }
    throw new Error(
      `SEP-24 request failed (${res.status}): ${res.statusText}${detail ? ` — ${detail}` : ""}`
    );
  }
  return (await res.json()) as T;
}

/** POST an interactive deposit/withdraw request and validate the response. */
export async function postSep24Interactive(
  anchorUrl: string,
  jwt: string,
  kind: "deposit" | "withdraw",
  body: Record<string, unknown>
): Promise<Sep24InteractiveResponse> {
  const response = await sep24Request<Partial<Sep24InteractiveResponse>>(
    sep24Url(anchorUrl, `/transactions/${kind}/interactive`),
    jwt,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (response.type !== "interactive_customer_info_needed" || !response.url || !response.id) {
    throw new Error("Anchor returned an unexpected SEP-24 interactive response");
  }
  return response as Sep24InteractiveResponse;
}
