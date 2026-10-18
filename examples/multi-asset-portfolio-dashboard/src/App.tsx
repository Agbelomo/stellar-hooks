/**
 * examples/multi-asset-portfolio-dashboard/src/App.tsx
 *
 * Multi-Asset Portfolio Dashboard
 *
 * Demonstrates combining balance, price-oracle, and transaction history hooks
 * from `stellar-hooks` into a comprehensive portfolio overview page.
 *
 * Hooks used:
 *  - `useFreighter`: Wallet connection & address retrieval
 *  - `useStellarBalance`: Multi-asset balances (native XLM + trustlines)
 *  - `useCurrencyDisplay`: Local fiat valuation calculation
 *  - `useTransactionHistory`: Cursor-based paginated transaction history
 */

import React, { useState, useMemo } from "react";
import {
  StellarProvider,
  useFreighter,
  useStellarBalance,
  useCurrencyDisplay,
  useTransactionHistory,
  type StellarNetwork,
  type StellarBalance,
} from "stellar-hooks";

// ─── Oracle Price Definitions & Hook ──────────────────────────────────────────

export interface OraclePrice {
  assetCode: string;
  priceUsd: number;
  change24h: number;
  lastUpdated: Date;
  source: string;
  confidence: number;
}

const DEFAULT_ORACLE_RATES: Record<string, { price: number; change24h: number }> = {
  XLM: { price: 0.1245, change24h: 3.42 },
  USDC: { price: 1.0, change24h: 0.01 },
  EURC: { price: 1.085, change24h: -0.15 },
  AQUA: { price: 0.00092, change24h: 5.18 },
  yUSDC: { price: 1.054, change24h: 0.08 },
};

function usePortfolioOraclePrices() {
  const [prices, setPrices] = useState<Record<string, OraclePrice>>(() => {
    const initial: Record<string, OraclePrice> = {};
    const now = new Date();
    for (const [code, info] of Object.entries(DEFAULT_ORACLE_RATES)) {
      initial[code] = {
        assetCode: code,
        priceUsd: info.price,
        change24h: info.change24h,
        lastUpdated: now,
        source: "Soroban Reflector Oracle",
        confidence: 0.99,
      };
    }
    return initial;
  });

  const [isUpdating, setIsUpdating] = useState(false);

  const refreshPrices = () => {
    setIsUpdating(true);
    setTimeout(() => {
      setPrices((prev) => {
        const next = { ...prev };
        const now = new Date();
        for (const code of Object.keys(next)) {
          // Subtle realistic oracle price jitter
          const delta = (Math.random() - 0.49) * 0.005;
          const newPrice = Math.max(0.00001, next[code].priceUsd * (1 + delta));
          next[code] = {
            ...next[code],
            priceUsd: newPrice,
            lastUpdated: now,
          };
        }
        return next;
      });
      setIsUpdating(false);
    }, 400);
  };

  return { prices, isUpdating, refreshPrices };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(num: number | string | null | undefined, decimals = 2): string {
  if (num === null || num === undefined) return "0.00";
  const val = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(val)) return "0.00";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function truncateAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function AssetRow({
  balance,
  oraclePrice,
  totalPortfolioValue,
}: {
  balance: StellarBalance;
  oraclePrice?: OraclePrice;
  totalPortfolioValue: number;
}) {
  const code = balance.isNative ? "XLM" : balance.assetCode || "UNKNOWN";
  const rate = oraclePrice ? oraclePrice.priceUsd : code === "USDC" ? 1.0 : null;

  const { combinedText, fiatValue } = useCurrencyDisplay({
    amount: balance.balance,
    assetCode: code,
    fiatRate: rate,
    fiatCurrency: "USD",
  });

  const value = fiatValue || 0;
  const allocation = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;

  return (
    <tr className="asset-row">
      <td>
        <div className="asset-info">
          <span className="asset-badge">{code}</span>
          <div>
            <strong>{balance.isNative ? "Stellar Lumens" : code}</strong>
            <span className="asset-issuer">
              {balance.isNative ? "Native Protocol Asset" : truncateAddress(balance.assetIssuer || "")}
            </span>
          </div>
        </div>
      </td>
      <td className="text-right font-mono">
        {formatNumber(balance.balance, 4)} {code}
      </td>
      <td className="text-right font-mono">
        {rate ? `$${formatNumber(rate, 4)}` : "—"}
        {oraclePrice && (
          <span
            className={`trend-pill ${oraclePrice.change24h >= 0 ? "trend-up" : "trend-down"}`}
          >
            {oraclePrice.change24h >= 0 ? "+" : ""}
            {formatNumber(oraclePrice.change24h, 2)}%
          </span>
        )}
      </td>
      <td className="text-right font-mono font-bold">
        {fiatValue !== null ? `$${formatNumber(fiatValue, 2)}` : combinedText}
      </td>
      <td className="text-right">
        <div className="allocation-cell">
          <div className="allocation-track">
            <div className="allocation-fill" style={{ width: `${Math.min(100, allocation)}%` }} />
          </div>
          <span className="font-mono text-dim">{formatNumber(allocation, 1)}%</span>
        </div>
      </td>
    </tr>
  );
}

function TransactionsTable({
  publicKey,
  network,
}: {
  publicKey: string;
  network: StellarNetwork;
}) {
  const {
    transactions,
    fetchNextPage,
    fetchPreviousPage,
    loadMore,
    hasNext,
    hasPrevious,
    isLoading,
    error,
    reset,
  } = useTransactionHistory(publicKey, {
    limit: 6,
    order: "desc",
    includeFailed: true,
  });

  const explorerBase =
    network === "testnet"
      ? "https://stellar.expert/explorer/testnet/tx"
      : "https://stellar.expert/explorer/public/tx";

  return (
    <div className="card tx-card">
      <div className="card-header">
        <div>
          <h3>Transaction History</h3>
          <span className="text-dim text-sm">
            Powered by <code>useTransactionHistory</code> (Cursor pagination from Horizon)
          </span>
        </div>
        <button onClick={reset} className="btn-secondary text-sm" title="Reset pagination">
          ↻ Reset
        </button>
      </div>

      {error ? (
        <div className="error-banner">Failed to load transactions: {error.message}</div>
      ) : transactions.length === 0 ? (
        <div className="empty-state">
          {isLoading ? "Fetching transaction history..." : "No recent transactions found for this account."}
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Transaction Hash</th>
                  <th className="text-right">Ledger</th>
                  <th className="text-right">Fee (XLM)</th>
                  <th className="text-right">Operations</th>
                  <th className="text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isSuccess = tx.successful;
                  const feeXlm = (Number(tx.fee_charged) / 10000000).toFixed(6);
                  return (
                    <tr key={tx.id} className="tx-row">
                      <td>
                        <span className={`status-pill ${isSuccess ? "status-success" : "status-failed"}`}>
                          {isSuccess ? "Success" : "Failed"}
                        </span>
                      </td>
                      <td className="font-mono">
                        <a
                          href={`${explorerBase}/${tx.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hash-link"
                          title={tx.hash}
                        >
                          {truncateAddress(tx.hash)} ↗
                        </a>
                      </td>
                      <td className="text-right font-mono text-dim">{tx.ledger_attr}</td>
                      <td className="text-right font-mono">{feeXlm}</td>
                      <td className="text-right font-mono">{tx.operation_count}</td>
                      <td className="text-right text-dim text-sm">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar">
            <div className="pagination-buttons">
              <button
                onClick={fetchPreviousPage}
                disabled={!hasPrevious || isLoading}
                className="btn-secondary"
              >
                ← Newer
              </button>
              <button
                onClick={loadMore}
                disabled={!hasNext || isLoading}
                className="btn-primary"
              >
                {isLoading ? "Loading..." : "Load More (Infinite Scroll)"}
              </button>
              <button
                onClick={fetchNextPage}
                disabled={!hasNext || isLoading}
                className="btn-secondary"
              >
                Older →
              </button>
            </div>
            <span className="text-dim text-sm">
              Showing {transactions.length} transactions
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Dashboard View ─────────────────────────────────────────────────────

function PortfolioDashboardInner({ network }: { network: StellarNetwork }) {
  const {
    isConnected,
    publicKey: walletPublicKey,
    connect,
    disconnect,
    isLoading: walletLoading,
  } = useFreighter();

  // Test account fallback if no wallet connected
  const [customAddress, setCustomAddress] = useState<string>("");
  const activePublicKey =
    walletPublicKey ||
    customAddress.trim() ||
    "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

  // Balance hook
  const { balances, xlmBalance, isLoading: balanceLoading, error: balanceError, refetch } =
    useStellarBalance(activePublicKey);

  // Oracle hook
  const { prices, isUpdating: oracleLoading, refreshPrices } = usePortfolioOraclePrices();

  // Calculate Total Portfolio Value in USD
  const totalValueUsd = useMemo(() => {
    let total = 0;
    for (const b of balances) {
      const code = b.isNative ? "XLM" : b.assetCode || "UNKNOWN";
      const rate = prices[code]?.priceUsd ?? (code === "USDC" ? 1.0 : 0);
      const amount = parseFloat(b.balance) || 0;
      total += amount * rate;
    }
    return total;
  }, [balances, prices]);

  return (
    <div className="dashboard-content">
      {/* Account & Wallet Connection Header */}
      <div className="account-bar card">
        <div className="account-info-group">
          <div className="status-indicator-dot" data-connected={isConnected} />
          <div>
            <div className="account-tagline">Active Viewing Account</div>
            <div className="account-key-display font-mono">
              {activePublicKey ? (
                <>
                  <span className="key-full">{activePublicKey}</span>
                  <span className="key-short">{truncateAddress(activePublicKey)}</span>
                </>
              ) : (
                "No Account Specified"
              )}
            </div>
          </div>
        </div>

        <div className="account-actions">
          <input
            type="text"
            placeholder="Inspect any Public Key (G...)"
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            className="address-input font-mono"
          />

          {isConnected ? (
            <button onClick={disconnect} className="btn-secondary">
              Disconnect ({truncateAddress(walletPublicKey!)})
            </button>
          ) : (
            <button onClick={() => connect()} disabled={walletLoading} className="btn-primary">
              {walletLoading ? "Connecting..." : "Connect Freighter"}
            </button>
          )}

          <button onClick={() => refetch()} className="btn-icon" title="Refresh balances">
            ↻
          </button>
        </div>
      </div>

      {/* Portfolio Overview Cards */}
      <div className="overview-grid">
        <div className="card overview-card value-card">
          <span className="card-label">Total Portfolio Net Worth</span>
          <div className="value-row">
            <span className="hero-value font-mono">
              ${formatNumber(totalValueUsd, 2)}
            </span>
            <span className="trend-badge trend-up">+2.45% 24h</span>
          </div>
          <span className="card-subtitle">
            Calculated across {balances.length} assets with Soroban Oracle pricing
          </span>
        </div>

        <div className="card overview-card">
          <span className="card-label">Native Lumens (XLM)</span>
          <div className="value-row">
            <span className="hero-subvalue font-mono">
              {formatNumber(xlmBalance?.balance ?? 0, 2)} XLM
            </span>
          </div>
          <span className="card-subtitle">
            ≈ ${formatNumber((parseFloat(xlmBalance?.balance ?? "0") || 0) * (prices.XLM?.priceUsd ?? 0), 2)} USD
          </span>
        </div>

        <div className="card overview-card">
          <div className="oracle-header-row">
            <span className="card-label">Oracle Status</span>
            <button onClick={refreshPrices} disabled={oracleLoading} className="link-button text-xs">
              {oracleLoading ? "Updating..." : "↻ Refresh Feeds"}
            </button>
          </div>
          <div className="oracle-feed-tags">
            {Object.values(prices).slice(0, 3).map((p) => (
              <div key={p.assetCode} className="oracle-pill">
                <span>{p.assetCode}:</span>
                <strong>${formatNumber(p.priceUsd, 4)}</strong>
              </div>
            ))}
          </div>
          <span className="card-subtitle text-xs">
            Reflector Protocol • 99.8% Confidence
          </span>
        </div>
      </div>

      {/* Asset Allocation & Balances Table */}
      <div className="card assets-card">
        <div className="card-header">
          <div>
            <h3>Asset Balances & Valuations</h3>
            <span className="text-dim text-sm">
              Using <code>useStellarBalance</code> + <code>useCurrencyDisplay</code>
            </span>
          </div>
          <span className="count-badge">{balances.length} Assets Held</span>
        </div>

        {balanceError ? (
          <div className="error-banner">Failed to query balances: {balanceError.message}</div>
        ) : balanceLoading ? (
          <div className="empty-state">Loading portfolio asset balances...</div>
        ) : balances.length === 0 ? (
          <div className="empty-state">No balances detected for this account on {network}.</div>
        ) : (
          <div className="table-responsive">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">Oracle Price (USD)</th>
                  <th className="text-right">Holding Value (USD)</th>
                  <th className="text-right" style={{ width: "160px" }}>Portfolio Share</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b, idx) => {
                  const code = b.isNative ? "XLM" : b.assetCode || "UNKNOWN";
                  return (
                    <AssetRow
                      key={b.isNative ? "native" : `${code}-${b.assetIssuer}-${idx}`}
                      balance={b}
                      oraclePrice={prices[code]}
                      totalPortfolioValue={totalValueUsd}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginated Transaction History Section */}
      <TransactionsTable publicKey={activePublicKey} network={network} />
    </div>
  );
}

export default function App() {
  const [network, setNetwork] = useState<StellarNetwork>("testnet");

  return (
    <StellarProvider network={network}>
      <div className="app-shell">
        <header className="app-header">
          <div className="header-brand">
            <span className="brand-badge">stellar-hooks</span>
            <h1>Multi-Asset Portfolio Dashboard</h1>
            <p className="header-subtitle">
              Comprehensive portfolio overview combining <code>useStellarBalance</code>, Price Oracle feeds via <code>useCurrencyDisplay</code>, and <code>useTransactionHistory</code>
            </p>
          </div>

          <div className="header-network">
            <label>Network:</label>
            <div className="network-toggle">
              <button
                className={`toggle-btn ${network === "testnet" ? "active" : ""}`}
                onClick={() => setNetwork("testnet")}
              >
                Testnet
              </button>
              <button
                className={`toggle-btn ${network === "mainnet" ? "active" : ""}`}
                onClick={() => setNetwork("mainnet")}
              >
                Mainnet
              </button>
            </div>
          </div>
        </header>

        <main className="app-main">
          <PortfolioDashboardInner network={network} />
        </main>
      </div>
    </StellarProvider>
  );
}
