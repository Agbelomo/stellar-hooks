/**
 * @file FormattedBalance.stories.tsx
 * @description Storybook stories for the FormattedBalance component (#997).
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { FormattedBalance } from "../components/FormattedBalance";

const meta: Meta<typeof FormattedBalance> = {
  title: "Components/FormattedBalance",
  component: FormattedBalance,
  tags: ["autodocs"],
  argTypes: {
    amount: { control: "text" },
    assetCode: { control: "text" },
    assetPosition: { control: "select", options: ["suffix", "prefix", "none"] },
    minimumFractionDigits: { control: "number" },
    maximumFractionDigits: { control: "number" },
    trimTrailingZeros: { control: "boolean" },
    compact: { control: "boolean" },
    locale: { control: "text" },
    fallback: { control: "text" },
    as: { control: "select", options: ["span", "p", "div", "strong", "dd"] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Renders a Stellar asset amount with locale-aware formatting, configurable " +
          "decimal precision, optional compact notation for large values, and flexible " +
          "asset code placement. Accepts raw strings, numbers, or `StellarBalance` objects.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof FormattedBalance>;

export const Default: Story = {
  args: {
    amount: "1234567.89",
    assetCode: "XLM",
  },
};

export const CompactLargeValue: Story = {
  name: "Compact – large value",
  args: {
    amount: "5200000",
    assetCode: "XLM",
    compact: true,
  },
};

export const USDCWithTrimming: Story = {
  name: "USDC – trim trailing zeros",
  args: {
    amount: "100.5000000",
    assetCode: "USDC",
    trimTrailingZeros: true,
  },
};

export const PrefixPlacement: Story = {
  name: "Asset code – prefix",
  args: {
    amount: "250.25",
    assetCode: "USDC",
    assetPosition: "prefix",
  },
};

export const GermanLocale: Story = {
  name: "German locale (de-DE)",
  args: {
    amount: "1234567.89",
    assetCode: "XLM",
    locale: "de-DE",
  },
};

export const ZeroFallback: Story = {
  name: "Null amount – fallback",
  args: {
    amount: null,
    assetCode: "XLM",
    fallback: "—",
  },
};

export const AllVariants: Story = {
  name: "All variants",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontFamily: "sans-serif" }}>
      <div><strong>Standard:</strong> <FormattedBalance amount="1234.5600000" assetCode="XLM" trimTrailingZeros /></div>
      <div><strong>Compact:</strong> <FormattedBalance amount={5_200_000} assetCode="XLM" compact /></div>
      <div><strong>Prefix:</strong> <FormattedBalance amount="99.99" assetCode="USDC" assetPosition="prefix" /></div>
      <div><strong>No code:</strong> <FormattedBalance amount="42" assetPosition="none" /></div>
      <div><strong>de-DE:</strong> <FormattedBalance amount="9876.543" assetCode="EURC" locale="de-DE" /></div>
      <div><strong>Fallback:</strong> <FormattedBalance amount={null} assetCode="XLM" fallback="—" /></div>
    </div>
  ),
};
