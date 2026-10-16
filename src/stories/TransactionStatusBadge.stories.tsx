/**
 * @file TransactionStatusBadge.stories.tsx
 * @description Storybook stories for the TransactionStatusBadge component (#995).
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { TransactionStatusBadge } from "../components/TransactionStatusBadge";
import { StellarThemeProvider } from "../components/theme";

const meta: Meta<typeof TransactionStatusBadge> = {
  title: "Components/TransactionStatusBadge",
  component: TransactionStatusBadge,
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "select",
      options: ["idle", "submitting", "polling", "success", "error"],
    },
    hash: { control: "text" },
    explorerUrl: { control: "text" },
    showPulse: { control: "boolean" },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Colour-coded badge that reflects the full `TransactionStatus` lifecycle " +
          "(`idle → submitting → polling → success | error`). Renders an optional " +
          "\"View on explorer\" link when a transaction hash and explorer URL are provided. " +
          "All colours are CSS custom properties — see `StellarThemeProvider` for theming.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof TransactionStatusBadge>;

export const Idle: Story = {
  args: { status: "idle" },
};

export const Submitting: Story = {
  args: { status: "submitting" },
};

export const Polling: Story = {
  args: {
    status: "polling",
    showPulse: true,
  },
};

export const Success: Story = {
  args: {
    status: "success",
    hash: "3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889",
    explorerUrl: "https://stellar.expert/explorer/testnet/tx",
  },
};

export const Error: Story = {
  args: {
    status: "error",
    error: { message: "Transaction simulation failed: insufficient balance" },
  },
};

export const AllStates: Story = {
  name: "All states",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontFamily: "sans-serif" }}>
      {(["idle", "submitting", "polling", "success", "error"] as const).map((s) => (
        <TransactionStatusBadge
          key={s}
          status={s}
          hash={s === "success" ? "3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889" : undefined}
          explorerUrl="https://stellar.expert/explorer/testnet/tx"
          error={s === "error" ? { message: "Insufficient balance" } : null}
        />
      ))}
    </div>
  ),
};

export const CustomTheme: Story = {
  name: "Custom CSS-variable theme (#996)",
  render: () => (
    <StellarThemeProvider
      theme={{
        colors: { success: "#10b981", error: "#e11d48", pending: "#8b5cf6" },
        badgeRadius: "rounded",
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <TransactionStatusBadge status="polling" />
        <TransactionStatusBadge
          status="success"
          hash="3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889"
          explorerUrl="https://stellar.expert/explorer/testnet/tx"
        />
        <TransactionStatusBadge
          status="error"
          error={{ message: "Custom theme error colour" }}
        />
      </div>
    </StellarThemeProvider>
  ),
};
