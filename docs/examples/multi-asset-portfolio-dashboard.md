# Multi-Asset Portfolio Dashboard

Example app combining balance, price-oracle, and transaction history hooks into a single portfolio overview page.

## Overview

The Multi-Asset Portfolio Dashboard demonstrates integrating multiple `stellar-hooks` into a unified fintech dashboard:
- Querying all account asset balances with `useStellarBalance`
- Real-time USD valuations using `useCurrencyDisplay` paired with Soroban price oracle feeds
- Paginated transaction records with `useTransactionHistory`
- Wallet connection with `useFreighter`

## Core Integration Example

```tsx
import {
  useFreighter,
  useStellarBalance,
  useCurrencyDisplay,
  useTransactionHistory,
} from "stellar-hooks";

function PortfolioOverview({ publicKey }: { publicKey: string }) {
  // 1. Fetch account balances
  const { balances, xlmBalance, isLoading: balancesLoading } = useStellarBalance(publicKey);

  // 2. Format values with oracle price
  const { combinedText, fiatValue } = useCurrencyDisplay({
    amount: xlmBalance?.balance,
    assetCode: "XLM",
    fiatRate: 0.125, // From Soroban oracle
    fiatCurrency: "USD",
  });

  // 3. Paginated transaction history
  const { transactions, loadMore, hasNext, isLoading: txLoading } = useTransactionHistory(
    publicKey,
    { limit: 10, includeFailed: true }
  );

  return (
    <div>
      <h2>Portfolio Net Worth: {fiatValue ? `$${fiatValue.toFixed(2)}` : "—"}</h2>
      <p>XLM Balance: {combinedText}</p>
      
      <h3>Recent Transactions</h3>
      <ul>
        {transactions.map(tx => (
          <li key={tx.id}>Hash: {tx.hash} (Ledger {tx.ledger_attr})</li>
        ))}
      </ul>
      {hasNext && <button onClick={loadMore}>Load More</button>}
    </div>
  );
}
```

## Running the Example

```bash
cd examples/multi-asset-portfolio-dashboard
npm install
npm run dev
```

See the full source in [`examples/multi-asset-portfolio-dashboard`](https://github.com/dark-princezz/stellar-hooks/tree/main/examples/multi-asset-portfolio-dashboard).
