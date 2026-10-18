/**
 * @file useKycStatus.test.ts
 * @description Unit tests for the useKycStatus hook (SEP-12 customer KYC status).
 * @package stellar-hooks
 * @license MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useKycStatus, extractMissingKycFields } from "./useKycStatus";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANCHOR_URL = "https://testanchor.stellar.org/kyc";
const JWT = "eyJhbGciOiJIUzI1NiJ9.test.token";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as Response;
}

const NEEDS_INFO_BODY = {
  id: "cust-1",
  status: "NEEDS_INFO",
  fields: {
    mobile_number: { type: "string", description: "phone number of the customer" },
    email_address: { type: "string", description: "email address", optional: true },
    photo_id_front: { type: "binary", description: "front of photo ID" },
  },
  provided_fields: {
    first_name: { type: "string", status: "ACCEPTED" },
    last_name: { type: "string", status: "REJECTED", error: "Name mismatch" },
  },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("extractMissingKycFields", () => {
  it("returns required fields that have not been provided", () => {
    const missing = extractMissingKycFields(NEEDS_INFO_BODY.fields, {});
    expect(missing.map((f) => f.name)).toEqual(["mobile_number", "photo_id_front"]);
  });

  it("skips required fields that were already accepted", () => {
    const missing = extractMissingKycFields(
      { first_name: { type: "string" } },
      { first_name: { type: "string", status: "ACCEPTED" } }
    );
    expect(missing).toEqual([]);
  });

  it("includes provided fields that were rejected", () => {
    const missing = extractMissingKycFields({}, NEEDS_INFO_BODY.provided_fields);
    expect(missing).toEqual([
      { name: "last_name", type: "string", status: "REJECTED", error: "Name mismatch" },
    ]);
  });
});

describe("useKycStatus", () => {
  it("queries the /customer endpoint with type and id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "ACCEPTED" }));

    renderHook(() =>
      useKycStatus({ anchorUrl: ANCHOR_URL, jwt: JWT, kycType: "sep31-sender", id: "cust-1" })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ANCHOR_URL}/customer?id=cust-1&type=sep31-sender`);
    expect(init.headers).toEqual({ Authorization: `Bearer ${JWT}` });
  });

  it.each(["ACCEPTED", "PROCESSING", "REJECTED"] as const)(
    "resolves %s status with no missing fields",
    async (status) => {
      fetchMock.mockResolvedValue(jsonResponse({ status }));

      const { result } = renderHook(() => useKycStatus({ anchorUrl: ANCHOR_URL, jwt: JWT }));

      await waitFor(() => expect(result.current.status).toBe(status));
      expect(result.current.missingFields).toEqual([]);
      expect(result.current.error).toBeNull();
    }
  );

  it("extracts missing fields when status is NEEDS_INFO", async () => {
    fetchMock.mockResolvedValue(jsonResponse(NEEDS_INFO_BODY));

    const { result } = renderHook(() => useKycStatus({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    await waitFor(() => expect(result.current.status).toBe("NEEDS_INFO"));
    expect(result.current.missingFields.map((f) => f.name)).toEqual([
      "mobile_number",
      "photo_id_front",
      "last_name",
    ]);
    expect(result.current.fields).toEqual(NEEDS_INFO_BODY.fields);
    expect(result.current.providedFields).toEqual(NEEDS_INFO_BODY.provided_fields);
  });

  it("toggles isLoading around the request", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));

    const { result } = renderHook(() => useKycStatus({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    await act(async () => {
      resolve(jsonResponse({ status: "PROCESSING" }));
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toBe("PROCESSING");
  });

  it("surfaces HTTP errors", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" } as Response);

    const { result } = renderHook(() => useKycStatus({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toContain("401");
    expect(result.current.status).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("surfaces network errors", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useKycStatus({ anchorUrl: ANCHOR_URL, jwt: JWT }));

    await waitFor(() => expect(result.current.error?.message).toBe("network down"));
  });

  it("refetch re-queries the anchor", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "PROCESSING" }))
      .mockResolvedValue(jsonResponse({ status: "ACCEPTED" }));

    const { result } = renderHook(() => useKycStatus({ anchorUrl: ANCHOR_URL, jwt: JWT }));
    await waitFor(() => expect(result.current.status).toBe("PROCESSING"));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.status).toBe("ACCEPTED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not fetch without a JWT", async () => {
    const { result } = renderHook(() => useKycStatus({ anchorUrl: ANCHOR_URL, jwt: null }));

    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBeNull();
  });
});
