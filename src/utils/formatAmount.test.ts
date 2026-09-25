import { describe, it, expect } from "vitest";
import { formatAssetAmount } from "./formatAmount";
import type { StellarBalance } from "../types";

describe("formatAssetAmount", () => {
  it("formats standard amounts using default en-US grouping and precision", () => {
    const result = formatAssetAmount("1234567.89", { locale: "en-US" });
    expect(result).toBe("1,234,567.89");
  });

  it("formats amounts in German locale (de-DE) with periods for thousands and comma for decimal", () => {
    const result = formatAssetAmount("1234567.89", { locale: "de-DE" });
    expect(result).toBe("1.234.567,89");
  });

  it("handles assetCode with default suffix placement", () => {
    const result = formatAssetAmount("500.25", { locale: "en-US", assetCode: "XLM" });
    expect(result).toBe("500.25 XLM");
  });

  it("handles assetCode with prefix placement", () => {
    const result = formatAssetAmount("500.25", {
      locale: "en-US",
      assetCode: "USDC",
      assetPosition: "prefix",
    });
    expect(result).toBe("USDC 500.25");
  });

  it("omits assetCode when assetPosition is 'none'", () => {
    const result = formatAssetAmount("500.25", {
      locale: "en-US",
      assetCode: "USDC",
      assetPosition: "none",
    });
    expect(result).toBe("500.25");
  });

  it("formats Stellar balance strings preserving precision up to maximumFractionDigits", () => {
    const result = formatAssetAmount("100.1234567", {
      locale: "en-US",
      maximumFractionDigits: 7,
    });
    expect(result).toBe("100.1234567");
  });

  it("enforces minimumFractionDigits", () => {
    const result = formatAssetAmount("100", {
      locale: "en-US",
      minimumFractionDigits: 2,
    });
    expect(result).toBe("100.00");
  });

  it("trims trailing zeros when trimTrailingZeros is true", () => {
    const result = formatAssetAmount("100.5000000", {
      locale: "en-US",
      trimTrailingZeros: true,
      maximumFractionDigits: 7,
    });
    expect(result).toBe("100.5");
  });

  it("trims trailing zeros down to minimumFractionDigits", () => {
    const result = formatAssetAmount("100.5000000", {
      locale: "en-US",
      trimTrailingZeros: true,
      minimumFractionDigits: 2,
      maximumFractionDigits: 7,
    });
    expect(result).toBe("100.50");
  });

  it("trims all trailing zeros if integer and minimumFractionDigits is 0", () => {
    const result = formatAssetAmount("100.0000000", {
      locale: "en-US",
      trimTrailingZeros: true,
      minimumFractionDigits: 0,
    });
    expect(result).toBe("100");
  });

  it("disables grouping when useGrouping is false", () => {
    const result = formatAssetAmount("1000000.5", {
      locale: "en-US",
      useGrouping: false,
    });
    expect(result).toBe("1000000.5");
  });

  it("extracts balance and assetCode from a StellarBalance object", () => {
    const balance: StellarBalance = {
      assetType: "credit_alphanum4",
      assetCode: "USDC",
      assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" as any,
      balance: "250.7500000",
      balanceFloat: 250.75,
      buyingLiabilities: "0",
      sellingLiabilities: "0",
      isNative: false,
    };

    const result = formatAssetAmount(balance, {
      locale: "en-US",
      trimTrailingZeros: true,
    });
    expect(result).toBe("250.75 USDC");
  });

  it("extracts XLM assetCode for native balance from StellarBalance object", () => {
    const balance: StellarBalance = {
      assetType: "native",
      balance: "1500.0000000",
      balanceFloat: 1500,
      buyingLiabilities: "0",
      sellingLiabilities: "0",
      isNative: true,
    };

    const result = formatAssetAmount(balance, {
      locale: "en-US",
      trimTrailingZeros: true,
    });
    expect(result).toBe("1,500 XLM");
  });

  it("handles null, undefined, and NaN with fallback", () => {
    expect(formatAssetAmount(null)).toBe("0");
    expect(formatAssetAmount(undefined)).toBe("0");
    expect(formatAssetAmount("not-a-number", { fallback: "--" })).toBe("--");
    expect(formatAssetAmount(null, { fallback: "0.00", assetCode: "XLM" })).toBe("0.00 XLM");
  });

  it("formats negative amounts properly", () => {
    const result = formatAssetAmount("-1234.56", {
      locale: "en-US",
      assetCode: "XLM",
    });
    expect(result).toBe("-1,234.56 XLM");
  });
});
