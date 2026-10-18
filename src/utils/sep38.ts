/**
 * @file sep38.ts
 * @description Request helpers for SEP-38 (Anchor RFQ) price and quote endpoints.
 * @package stellar-hooks
 * @license MIT
 */

export type Sep38Context = "sep6" | "sep24" | "sep31";

/** Amount of the fee, expressed in `asset` (a SEP-38 asset identification string). */
export interface Sep38Fee {
  total: string;
  asset: string;
  details?: Array<{ name: string; description?: string; amount: string }>;
}

export interface Sep38Price {
  /** Price the anchor charges, including fees */
  totalPrice: string;
  /** Price excluding fees */
  price: string;
  sellAmount: string;
  buyAmount: string;
  fee?: Sep38Fee;
}

export interface Sep38Quote extends Sep38Price {
  /** Quote ID to reference in SEP-6/24/31 requests */
  id: string;
  /** When the firm quote stops being honoured */
  expiresAt: Date;
  sellAsset: string;
  buyAsset: string;
}

export interface Sep38RequestParams {
  /** SEP-38 asset id of what the user gives, e.g. `stellar:USDC:G...` or `iso4217:USD` */
  sellAsset: string;
  /** SEP-38 asset id of what the user receives */
  buyAsset: string;
  /** Exactly one of `sellAmount` / `buyAmount` must be provided */
  sellAmount?: string;
  buyAmount?: string;
  /** How the quote will be used. Required by the anchor. */
  context: Sep38Context;
  sellDeliveryMethod?: string;
  buyDeliveryMethod?: string;
  countryCode?: string;
}

export interface Sep38FirmQuoteParams extends Sep38RequestParams {
  /** Ask the anchor to hold the quote until at least this time */
  expireAfter?: Date;
}

export function validateSep38Params(params: Sep38RequestParams): void {
  if (!params.sellAsset || !params.buyAsset) {
    throw new Error("sellAsset and buyAsset are required");
  }
  if (params.sellAsset === params.buyAsset) {
    throw new Error("sellAsset and buyAsset must differ");
  }
  const hasSell = params.sellAmount !== undefined && params.sellAmount !== "";
  const hasBuy = params.buyAmount !== undefined && params.buyAmount !== "";
  if (hasSell === hasBuy) {
    throw new Error("Provide exactly one of sellAmount or buyAmount");
  }
  const amount = (hasSell ? params.sellAmount : params.buyAmount) as string;
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    throw new Error("Amount must be a positive decimal number");
  }
  if (!params.context) throw new Error("context is required (sep6, sep24 or sep31)");
}

export function toSep38Query(params: Sep38RequestParams): URLSearchParams {
  const query = new URLSearchParams({
    sell_asset: params.sellAsset,
    buy_asset: params.buyAsset,
    context: params.context,
  });
  if (params.sellAmount) query.set("sell_amount", params.sellAmount);
  if (params.buyAmount) query.set("buy_amount", params.buyAmount);
  if (params.sellDeliveryMethod) query.set("sell_delivery_method", params.sellDeliveryMethod);
  if (params.buyDeliveryMethod) query.set("buy_delivery_method", params.buyDeliveryMethod);
  if (params.countryCode) query.set("country_code", params.countryCode);
  return query;
}

export function toSep38Body(params: Sep38FirmQuoteParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sell_asset: params.sellAsset,
    buy_asset: params.buyAsset,
    context: params.context,
  };
  if (params.sellAmount) body.sell_amount = params.sellAmount;
  if (params.buyAmount) body.buy_amount = params.buyAmount;
  if (params.sellDeliveryMethod) body.sell_delivery_method = params.sellDeliveryMethod;
  if (params.buyDeliveryMethod) body.buy_delivery_method = params.buyDeliveryMethod;
  if (params.countryCode) body.country_code = params.countryCode;
  if (params.expireAfter) body.expire_after = params.expireAfter.toISOString();
  return body;
}

const str = (value: unknown, field: string): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  throw new Error(`Anchor response is missing "${field}"`);
};

export function parseSep38Price(raw: Record<string, unknown>): Sep38Price {
  return {
    totalPrice: str(raw.total_price, "total_price"),
    price: str(raw.price, "price"),
    sellAmount: str(raw.sell_amount, "sell_amount"),
    buyAmount: str(raw.buy_amount, "buy_amount"),
    fee: raw.fee as Sep38Fee | undefined,
  };
}

export function parseSep38Quote(raw: Record<string, unknown>): Sep38Quote {
  const expires = new Date(str(raw.expires_at, "expires_at"));
  if (Number.isNaN(expires.getTime())) throw new Error('Anchor response has an invalid "expires_at"');
  return {
    ...parseSep38Price(raw),
    id: str(raw.id, "id"),
    expiresAt: expires,
    sellAsset: str(raw.sell_asset, "sell_asset"),
    buyAsset: str(raw.buy_asset, "buy_asset"),
  };
}

/** Fetch JSON from a SEP-38 endpoint, surfacing the anchor's `error` field. */
export async function sep38Request(url: string, init: RequestInit, jwt?: string | null): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...init.headers },
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // keep {} and fall back to the status text
  }
  if (!res.ok) {
    const detail = typeof json.error === "string" ? json.error : text.slice(0, 200);
    throw new Error(`SEP-38 request failed (${res.status}): ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }
  return json;
}
