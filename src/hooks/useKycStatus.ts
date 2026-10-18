/**
 * @file useKycStatus.ts
 * @description Hook for querying SEP-12 customer KYC status from an anchor.
 * @package stellar-hooks
 * @license MIT
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Customer verification status as defined by SEP-12 `GET /customer`. */
export type KycStatus = "ACCEPTED" | "PROCESSING" | "NEEDS_INFO" | "REJECTED";

/** A field the anchor requires (or optionally accepts) from the customer. */
export interface KycField {
  /** Data type of the field, e.g. `"string"`, `"binary"`, `"number"`, `"date"` */
  type: string;
  /** Human-readable description of the field */
  description?: string;
  /** Allowed values, if the field is an enum */
  choices?: string[];
  /** Whether the field may be omitted */
  optional?: boolean;
}

/** A field the customer has already supplied. */
export interface KycProvidedField extends KycField {
  /** Verification status of the supplied value */
  status?: "ACCEPTED" | "PROCESSING" | "REJECTED" | "VERIFICATION_REQUIRED";
  /** Reason the value was rejected, if applicable */
  error?: string;
}

/** Raw SEP-12 `GET /customer` response body. */
export interface KycCustomerResponse {
  id?: string;
  status: KycStatus;
  fields?: Record<string, KycField>;
  provided_fields?: Record<string, KycProvidedField>;
  message?: string;
}

/** A required field that still needs to be submitted. */
export interface KycMissingField extends KycField {
  /** SEP-9 field name, e.g. `"first_name"` */
  name: string;
}

export interface UseKycStatusOptions {
  /** Base URL of the anchor's SEP-12 `KYC_SERVER` */
  anchorUrl: string | null | undefined;
  /** SEP-10 JWT used to authenticate with the anchor. Fetching is disabled while falsy. */
  jwt: string | null | undefined;
  /** Optional SEP-12 customer `type`, e.g. `"sep31-sender"` */
  kycType?: string;
  /** Optional anchor-assigned customer ID */
  id?: string;
}

export interface UseKycStatusReturn {
  /** Customer verification status, or `null` before the first response */
  status: KycStatus | null;
  /** Required fields that have not yet been provided (populated when `NEEDS_INFO`) */
  missingFields: KycMissingField[];
  /** Fields the anchor requests, keyed by SEP-9 name */
  fields: Record<string, KycField>;
  /** Fields the customer has already supplied, keyed by SEP-9 name */
  providedFields: Record<string, KycProvidedField>;
  /** Optional message from the anchor explaining the status */
  message: string | null;
  /** True while a request is in flight */
  isLoading: boolean;
  /** Last error encountered, if any */
  error: Error | null;
  /** Re-query the anchor */
  refetch: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the required (non-optional) fields in `fields`, plus any provided
 * fields the anchor rejected or still needs verified.
 */
export function extractMissingKycFields(
  fields: Record<string, KycField> = {},
  providedFields: Record<string, KycProvidedField> = {}
): KycMissingField[] {
  const missing: KycMissingField[] = [];

  for (const [name, field] of Object.entries(fields)) {
    if (field.optional) continue;
    const provided = providedFields[name];
    if (provided && provided.status !== "REJECTED") continue;
    missing.push({ name, ...field });
  }

  for (const [name, provided] of Object.entries(providedFields)) {
    if (name in fields) continue;
    if (provided.status === "REJECTED" || provided.status === "VERIFICATION_REQUIRED") {
      missing.push({ name, ...provided });
    }
  }

  return missing;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Queries a SEP-12 anchor's `GET /customer` endpoint and surfaces the
 * customer's verification status along with any required fields that still
 * need to be submitted.
 *
 * @example
 * ```tsx
 * const { status, missingFields, isLoading } = useKycStatus({
 *   anchorUrl: "https://testanchor.stellar.org/kyc",
 *   jwt,
 *   kycType: "sep31-sender",
 * });
 * ```
 */
export function useKycStatus({
  anchorUrl,
  jwt,
  kycType,
  id,
}: UseKycStatusOptions): UseKycStatusReturn {
  const [data, setData] = useState<KycCustomerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async (): Promise<void> => {
    if (!anchorUrl || !jwt) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(`${anchorUrl.replace(/\/+$/, "")}/customer`);
      if (id) url.searchParams.set("id", id);
      if (kycType) url.searchParams.set("type", kycType);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Anchor responded with ${res.status}: ${res.statusText}`);
      }
      const body = (await res.json()) as KycCustomerResponse;
      if (controller.signal.aborted) return;
      setData(body);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  }, [anchorUrl, jwt, kycType, id]);

  useEffect(() => {
    setData(null);
    void fetchStatus();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [fetchStatus]);

  const fields = data?.fields ?? {};
  const providedFields = data?.provided_fields ?? {};
  const missingFields =
    data?.status === "NEEDS_INFO" ? extractMissingKycFields(fields, providedFields) : [];

  return {
    status: data?.status ?? null,
    missingFields,
    fields,
    providedFields,
    message: data?.message ?? null,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}
