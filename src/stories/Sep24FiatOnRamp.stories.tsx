/**
 * @file Sep24FiatOnRamp.stories.tsx
 * @description Example: fiat on-ramp via a SEP-24 interactive deposit popup flow.
 *
 * Opens the anchor's interactive deposit window in a popup, polls the SEP-24
 * transaction status until the deposit completes or fails, and shows the resulting
 * balance change using FormattedBalance.
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { useSep24 } from "../hooks/useSep24";
import { useStellarBalance } from "../hooks/useStellarBalance";
import { FormattedBalance } from "../components/FormattedBalance";
import { TransactionStatusBadge } from "../components/TransactionStatusBadge";
import type { Sep24Transaction, Sep24TransactionStatus } from "../hooks/useSep24";
import type { TransactionStatus } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Maps SEP-24 transaction status to the badge's TransactionStatus vocabulary */
function toTxStatus(sep24Status: Sep24TransactionStatus | null): TransactionStatus {
  if (!sep24Status) return "idle";
  if (sep24Status === "completed") return "success";
  if (sep24Status === "error" || sep24Status === "expired") return "error";
  if (sep24Status === "refunded") return "error";
  if (
    sep24Status === "pending_anchor" ||
    sep24Status === "pending_stellar" ||
    sep24Status === "pending_trust" ||
    sep24Status === "pending_user" ||
    sep24Status === "pending_user_transfer_start"
  )
    return "polling";
  return "idle";
}

const POLL_INTERVAL_MS = 5_000;

// ─── Demo component ───────────────────────────────────────────────────────────

interface Sep24OnRampDemoProps {
  /** Stellar public key whose balance is displayed */
  accountPublicKey: string;
  /** Asset code to deposit, e.g. "USDC" */
  assetCode: string;
  /** Override anchor base URL (defaults to StellarProvider horizonUrl base) */
  anchorUrl?: string;
  /** SEP-24 auth token — in a real app this comes from a SEP-10 auth flow */
  authToken: string;
  /** Configurable Stellar expert explorer base URL */
  explorerUrl?: string;
}

function Sep24OnRampDemo({
  accountPublicKey,
  assetCode,
  anchorUrl,
  authToken,
  explorerUrl = "https://stellar.expert/explorer/testnet/tx",
}: Sep24OnRampDemoProps) {
  // ── state ──────────────────────────────────────────────────────────────────
  const [depositTx, setDepositTx] = useState<Sep24Transaction | null>(null);
  const [txStatus, setTxStatus] = useState<Sep24TransactionStatus | null>(null);
  const [popupClosed, setPopupClosed] = useState(false);
  const [balanceBefore, setBalanceBefore] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "opening" | "popup" | "polling" | "done">("idle");
  const [stepError, setStepError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── hooks ──────────────────────────────────────────────────────────────────
  const { deposit, getTransaction, isLoading: sep24Loading, error: sep24Error } = useSep24({ anchorUrl });
  const { xlmBalance, assetBalance, refetch: refetchBalance } = useStellarBalance(accountPublicKey, {
    code: assetCode,
    issuer: "",
  });

  const currentBalance = assetBalance ?? xlmBalance;

  // ── open popup ─────────────────────────────────────────────────────────────
  const openOnRamp = useCallback(async () => {
    setStep("opening");
    setStepError(null);
    setDepositTx(null);
    setTxStatus(null);
    setPopupClosed(false);

    // Snapshot balance before deposit so we can show the delta
    setBalanceBefore(currentBalance?.balance ?? null);

    try {
      const tx = await deposit({
        assetCode,
        authToken,
        amount: undefined, // let the anchor's UI handle the amount
      });

      setDepositTx(tx);
      setStep("popup");

      if (tx.more_info_url) {
        const popup = window.open(
          tx.more_info_url,
          "stellar-sep24-deposit",
          "width=500,height=700,resizable=yes,scrollbars=yes",
        );
        popupRef.current = popup;

        // Watch for the popup being closed by the user
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            setPopupClosed(true);
            startPolling(tx.id);
          }
        }, 500);
      } else {
        // No popup URL — go straight to polling
        startPolling(tx.id);
      }
    } catch (err) {
      setStep("idle");
      setStepError(err instanceof Error ? err.message : String(err));
    }
  }, [assetCode, authToken, deposit, currentBalance]);

  // ── polling ────────────────────────────────────────────────────────────────
  const startPolling = useCallback(
    (txId: string) => {
      setStep("polling");
      if (pollRef.current) clearInterval(pollRef.current);

      const poll = async () => {
        try {
          const updated = await getTransaction(txId, authToken);
          setTxStatus(updated.status);

          const terminal: Sep24TransactionStatus[] = ["completed", "error", "expired", "refunded"];
          if (terminal.includes(updated.status)) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setStep("done");
            if (updated.status === "completed") {
              await refetchBalance();
            }
          }
        } catch {
          // keep polling; transient failures are normal
        }
      };

      // First check immediately, then on interval
      void poll();
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    },
    [authToken, getTransaction, refetchBalance],
  );

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── cancel / reset ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    popupRef.current?.close();
    setStep("idle");
    setDepositTx(null);
    setTxStatus(null);
    setPopupClosed(false);
    setBalanceBefore(null);
    setStepError(null);
  }, []);

  // ── derived values ─────────────────────────────────────────────────────────
  const txStatusForBadge = toTxStatus(txStatus);
  const balanceDelta =
    txStatus === "completed" && balanceBefore != null && currentBalance
      ? (parseFloat(currentBalance.balance) - parseFloat(balanceBefore)).toFixed(7)
      : null;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 520, fontFamily: "sans-serif" }}>
      <h3 style={{ marginTop: 0 }}>SEP-24 Fiat On-Ramp</h3>
      <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
        Deposit fiat currency to your Stellar account via an anchor's interactive
        deposit flow. The popup guides you through KYC / payment, and this demo
        polls the anchor for status updates.
      </p>

      {/* Current balance */}
      <div
        style={{
          padding: "0.75rem 1rem",
          background: "#f8fafc",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          marginBottom: "1rem",
        }}
      >
        <span style={{ color: "#64748b", fontSize: "0.8125rem" }}>Current balance: </span>
        <FormattedBalance
          amount={currentBalance}
          assetCode={assetCode}
          trimTrailingZeros
          style={{ fontWeight: 600, color: "#0f172a" }}
        />
      </div>

      {/* Action button */}
      {step === "idle" && (
        <button
          onClick={openOnRamp}
          disabled={sep24Loading}
          style={{
            padding: "0.625rem 1.25rem",
            background: "#0ea5e9",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.9375rem",
          }}
        >
          {sep24Loading ? "Starting…" : `Deposit ${assetCode}`}
        </button>
      )}

      {/* Popup open prompt */}
      {step === "popup" && !popupClosed && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            marginBottom: "0.75rem",
            fontSize: "0.875rem",
            color: "#1d4ed8",
          }}
        >
          🪟 The anchor's deposit window is open. Complete the form there —
          this page will update automatically when the popup closes.
        </div>
      )}

      {/* Polling */}
      {(step === "polling" || step === "done") && depositTx && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <TransactionStatusBadge
            status={txStatusForBadge}
            hash={depositTx.id}
            explorerUrl={explorerUrl}
            error={
              txStatusForBadge === "error"
                ? { message: `Anchor status: ${txStatus ?? "error"}` }
                : null
            }
            labels={{
              polling: `Anchor processing… (${txStatus ?? "pending"})`,
              success: "Deposit completed ✓",
            }}
          />

          {/* Balance delta */}
          {balanceDelta && parseFloat(balanceDelta) > 0 && (
            <div style={{ color: "#16a34a", fontWeight: 600, fontSize: "0.9375rem" }}>
              +{" "}
              <FormattedBalance
                amount={balanceDelta}
                assetCode={assetCode}
                trimTrailingZeros
              />{" "}
              deposited
            </div>
          )}
        </div>
      )}

      {/* Errors */}
      {(stepError ?? sep24Error?.message) && (
        <p style={{ color: "#dc2626", fontSize: "0.875rem", marginTop: "0.5rem" }}>
          ⚠️ {stepError ?? sep24Error?.message}
        </p>
      )}

      {/* Reset */}
      {step !== "idle" && (
        <button
          onClick={reset}
          style={{
            marginTop: "0.75rem",
            padding: "0.375rem 0.875rem",
            background: "transparent",
            color: "#64748b",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: "0.8125rem",
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
}

// ─── Storybook meta ───────────────────────────────────────────────────────────

const meta: Meta<typeof Sep24OnRampDemo> = {
  title: "Examples/Sep24FiatOnRamp",
  component: Sep24OnRampDemo,
  tags: ["autodocs"],
  argTypes: {
    accountPublicKey: { control: "text" },
    assetCode: { control: "text" },
    anchorUrl: { control: "text" },
    authToken: { control: "text" },
    explorerUrl: { control: "text" },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Opens an anchor's SEP-24 interactive deposit window as a popup, polls " +
          "transaction status, and shows the resulting balance change. " +
          "Wire up a real SEP-10 `authToken` and `anchorUrl` to run against a testnet anchor.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Sep24OnRampDemo>;

export const Default: Story = {
  args: {
    accountPublicKey: "GA2C5RFPE6GCKMY3US5PAB6VVVRIGXZHYTXP25WZDPB26DKP42YX5W53",
    assetCode: "USDC",
    anchorUrl: "https://testanchor.stellar.org",
    authToken: "REPLACE_WITH_SEP10_JWT",
    explorerUrl: "https://stellar.expert/explorer/testnet/tx",
  },
};
