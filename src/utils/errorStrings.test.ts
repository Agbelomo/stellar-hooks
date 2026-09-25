import { describe, it, expect, beforeEach } from "vitest";
import {
  getErrorString,
  setErrorStrings,
  resetErrorStrings,
  getErrorStrings,
  DEFAULT_ERROR_STRINGS,
  formatErrorTemplate,
} from "./errorStrings";
import {
  FreighterNotInstalledError,
  WalletNotConnectedError,
  WalletNotInstalledError,
  TransactionTimeoutError,
  NetworkError,
  StellarHookError,
  ErrorCode,
} from "./errors";
import { validatePublicKey, ValidationError } from "./validation";

describe("errorStrings i18n module", () => {
  beforeEach(() => {
    resetErrorStrings();
  });

  it("returns default English error strings", () => {
    expect(getErrorString("walletNotConnected")).toBe(
      DEFAULT_ERROR_STRINGS.walletNotConnected
    );
    expect(getErrorString("freighterNotInstalled")).toBe(
      DEFAULT_ERROR_STRINGS.freighterNotInstalled
    );
  });

  it("resolves strings by ErrorCode enum values", () => {
    expect(getErrorString(ErrorCode.WALLET_NOT_CONNECTED)).toBe(
      DEFAULT_ERROR_STRINGS.walletNotConnected
    );
    expect(getErrorString(ErrorCode.TRANSACTION_TIMEOUT)).toBe(
      DEFAULT_ERROR_STRINGS.transactionTimeout
    );
    expect(getErrorString(ErrorCode.NETWORK_ERROR)).toBe(
      DEFAULT_ERROR_STRINGS.networkError
    );
  });

  it("formats template strings with provided parameter placeholders", () => {
    const template = 'Invalid {label}: "{value}" is not valid.';
    const result = formatErrorTemplate(template, {
      label: "publicKey",
      value: "bad-key",
    });
    expect(result).toBe('Invalid publicKey: "bad-key" is not valid.');
  });

  it("allows consuming apps to customize and localize error strings", () => {
    setErrorStrings({
      walletNotConnected: "Portefeuille non connecté. Appelez connect() d'abord.",
      freighterNotInstalled: "Freighter n'est pas installé dans cet environnement.",
    });

    expect(getErrorString("walletNotConnected")).toBe(
      "Portefeuille non connecté. Appelez connect() d'abord."
    );
    expect(getErrorString(ErrorCode.WALLET_NOT_CONNECTED)).toBe(
      "Portefeuille non connecté. Appelez connect() d'abord."
    );

    // Unmodified strings remain at defaults
    expect(getErrorString("transactionTimeout")).toBe(
      DEFAULT_ERROR_STRINGS.transactionTimeout
    );
  });

  it("instantiates error classes with localized default messages", () => {
    setErrorStrings({
      walletNotConnected: "Wallet nicht verbunden.",
      freighterNotInstalled: "Freighter nicht installiert.",
    });

    const walletErr = new WalletNotConnectedError();
    expect(walletErr.message).toBe("Wallet nicht verbunden.");

    const freighterErr = new FreighterNotInstalledError();
    expect(freighterErr.message).toBe("Freighter nicht installiert.");
  });

  it("allows explicit messages in error constructors to override defaults", () => {
    setErrorStrings({
      walletNotConnected: "Wallet nicht verbunden.",
    });

    const customErr = new WalletNotConnectedError("Custom override message");
    expect(customErr.message).toBe("Custom override message");
  });

  it("localizes validation error messages with parameters", () => {
    setErrorStrings({
      invalidPublicKey: "Clave pública inválida para {label}: {value}",
    });

    expect(() => validatePublicKey("bad-key", "recipient")).toThrowError(
      ValidationError
    );
    expect(() => validatePublicKey("bad-key", "recipient")).toThrow(
      "Clave pública inválida para recipient: bad-key"
    );
  });

  it("resetErrorStrings restores the default English strings", () => {
    setErrorStrings({
      walletNotConnected: "Custom localized message",
    });
    expect(getErrorString("walletNotConnected")).toBe("Custom localized message");

    resetErrorStrings();
    expect(getErrorString("walletNotConnected")).toBe(
      DEFAULT_ERROR_STRINGS.walletNotConnected
    );
  });

  it("returns unknownError for unmapped keys", () => {
    expect(getErrorString("completely_random_key_that_does_not_exist")).toBe(
      DEFAULT_ERROR_STRINGS.unknownError
    );
  });

  it("uses getErrorString in StellarHookError.from fallback message", () => {
    setErrorStrings({
      unknownError: "Ein unbekannter Fehler ist aufgetreten",
    });

    const err = StellarHookError.from(undefined);
    expect(err.message).toBe("Ein unbekannter Fehler ist aufgetreten");
  });
});
