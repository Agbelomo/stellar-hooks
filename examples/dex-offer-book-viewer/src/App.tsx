/**
 * examples/dex-offer-book-viewer/src/App.tsx
 *
 * Stellar DEX Offer Book Viewer
 *
 * Visualizes live bids and asks for any asset pair using Horizon's order book endpoint via `useOrderBook`.
 */

import React, { useState, useMemo } from "react";
import { Asset } from "@stellar/stellar-sdk";
import {
  StellarProvider,
  useOrderBook,
  type OrderBookLevel,
  type StellarNetwork,
} from "stellar-hooks";

interface PresetPair {
  id: string;
  name: string;
  baseCode: string;
  baseIssuer?: string;
  counterCode: string;
  counterIssuer?: string;
  testnetCounterIssuer?: string;
}

const PRESET_PAIRS: PresetPair[] = [
  {
    id: "xlm-usdc",
    name: "XLM / USDC",
    baseCode: "XLM",
    counterCode: "USDC",
    counterIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    testnetCounterIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
  {
    id: "xlm-aqua",
    name: "XLM / AQUA",
    baseCode: "XLM",
    counterCode: "AQUA",
    counterIssuer: "GBNZILSTVQZ4ROOF2M4VQKXB6QPHNXDMIF64CSPF5GFQTGQBNO55QERK",
  },
  {
    id: "xlm-eurc",
    name: "XLM / EURC",
    baseCode: "XLM",
    counterCode: "EURC",
    counterIssuer: "GDZCEWJ5TVXUTFH6WMCH72LMTKGEWAVEIFHPHWOIFTVTXU2BKWOANZTV",
  },
];

function formatNumber(num: number | string, decimals = 4): string {
  const val = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(val)) return "0.00";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

function OrderBookTable({
  bids,
  asks,
  baseSymbol,
  counterSymbol,
  isLoading,
  error,
}: {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  baseSymbol: string;
  counterSymbol: string;
  isLoading: boolean;
  error: Error | null;
}) {
  const maxBidVolume = useMemo(() => {
    return bids.reduce((max, b) => Math.max(max, parseFloat(b.amount)), 0) || 1;
  }, [bids]);

  const maxAskVolume = useMemo(() => {
    return asks.reduce((max, a) => Math.max(max, parseFloat(a.amount)), 0) || 1;
  }, [asks]);

  if (error) {
    return (
      <div className="error-banner">
        <strong>Error fetching order book:</strong> {error.message}
      </div>
    );
  }

  return (
    <div className="orderbook-container">
      {/* Asks (Sells) */}
      <div className="orderbook-side asks-side">
        <div className="side-header">
          <h3>
            <span className="dot dot-red"></span> Asks (Sell Orders)
          </h3>
          <span className="count-badge">{asks.length} levels</span>
        </div>
        <div className="table-wrapper">
          <table className="order-table">
            <thead>
              <tr>
                <th>Price ({counterSymbol})</th>
                <th>Amount ({baseSymbol})</th>
                <th>Total ({counterSymbol})</th>
              </tr>
            </thead>
            <tbody>
              {asks.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-row">
                    {isLoading ? "Loading asks..." : "No sell offers currently available"}
                  </td>
                </tr>
              ) : (
                asks.map((ask, idx) => {
                  const price = parseFloat(ask.price);
                  const amount = parseFloat(ask.amount);
                  const total = price * amount;
                  const depthPct = Math.min(100, (amount / maxAskVolume) * 100);

                  return (
                    <tr key={`ask-${idx}`} className="order-row ask-row">
                      <td className="price-cell text-red">
                        <span className="depth-bar ask-depth" style={{ width: `${depthPct}%` }} />
                        <span className="relative-z">{formatNumber(price, 6)}</span>
                      </td>
                      <td className="relative-z">{formatNumber(amount, 2)}</td>
                      <td className="relative-z text-dim">{formatNumber(total, 2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bids (Buys) */}
      <div className="orderbook-side bids-side">
        <div className="side-header">
          <h3>
            <span className="dot dot-green"></span> Bids (Buy Orders)
          </h3>
          <span className="count-badge">{bids.length} levels</span>
        </div>
        <div className="table-wrapper">
          <table className="order-table">
            <thead>
              <tr>
                <th>Price ({counterSymbol})</th>
                <th>Amount ({baseSymbol})</th>
                <th>Total ({counterSymbol})</th>
              </tr>
            </thead>
            <tbody>
              {bids.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-row">
                    {isLoading ? "Loading bids..." : "No buy offers currently available"}
                  </td>
                </tr>
              ) : (
                bids.map((bid, idx) => {
                  const price = parseFloat(bid.price);
                  const amount = parseFloat(bid.amount);
                  const total = price * amount;
                  const depthPct = Math.min(100, (amount / maxBidVolume) * 100);

                  return (
                    <tr key={`bid-${idx}`} className="order-row bid-row">
                      <td className="price-cell text-green">
                        <span className="depth-bar bid-depth" style={{ width: `${depthPct}%` }} />
                        <span className="relative-z">{formatNumber(price, 6)}</span>
                      </td>
                      <td className="relative-z">{formatNumber(amount, 2)}</td>
                      <td className="relative-z text-dim">{formatNumber(total, 2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OrderBookViewerInner({ network }: { network: StellarNetwork }) {
  const [selectedPairId, setSelectedPairId] = useState<string>("xlm-usdc");
  const [customBase, setCustomBase] = useState<{ isNative: boolean; code: string; issuer: string }>({
    isNative: true,
    code: "XLM",
    issuer: "",
  });
  const [customCounter, setCustomCounter] = useState<{ isNative: boolean; code: string; issuer: string }>({
    isNative: false,
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  });
  const [limit, setLimit] = useState<number>(20);
  const [pollingInterval, setPollingInterval] = useState<number>(5000);

  // Construct Stellar SDK Assets
  const { baseAsset, counterAsset, baseSymbol, counterSymbol } = useMemo(() => {
    if (selectedPairId !== "custom") {
      const preset = PRESET_PAIRS.find((p) => p.id === selectedPairId)!;
      const base = preset.baseCode === "XLM" ? Asset.native() : new Asset(preset.baseCode, preset.baseIssuer!);
      const issuer =
        network === "testnet" && preset.testnetCounterIssuer
          ? preset.testnetCounterIssuer
          : preset.counterIssuer!;
      const counter = new Asset(preset.counterCode, issuer);
      return {
        baseAsset: base,
        counterAsset: counter,
        baseSymbol: preset.baseCode,
        counterSymbol: preset.counterCode,
      };
    }

    const base = customBase.isNative
      ? Asset.native()
      : new Asset(customBase.code || "CUSTOM", customBase.issuer);
    const counter = customCounter.isNative
      ? Asset.native()
      : new Asset(customCounter.code || "CUSTOM", customCounter.issuer);

    return {
      baseAsset: base,
      counterAsset: counter,
      baseSymbol: customBase.isNative ? "XLM" : customBase.code || "CUSTOM",
      counterSymbol: customCounter.isNative ? "XLM" : customCounter.code || "CUSTOM",
    };
  }, [selectedPairId, network, customBase, customCounter]);

  // Hook query
  const { bids, asks, isLoading, error, lastFetchedAt, refetch } = useOrderBook(
    baseAsset,
    counterAsset,
    {
      limit,
      refetchInterval: pollingInterval,
      enabled: true,
    }
  );

  // Derived market statistics
  const bestBid = bids[0] ? parseFloat(bids[0].price) : null;
  const bestAsk = asks[0] ? parseFloat(asks[0].price) : null;
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;
  const spreadPct = spread !== null && bestAsk !== null && bestAsk > 0 ? (spread / bestAsk) * 100 : null;
  const midPrice = bestAsk !== null && bestBid !== null ? (bestAsk + bestBid) / 2 : null;

  const totalBidAmount = useMemo(
    () => bids.reduce((acc, b) => acc + parseFloat(b.amount), 0),
    [bids]
  );
  const totalAskAmount = useMemo(
    () => asks.reduce((acc, a) => acc + parseFloat(a.amount), 0),
    [asks]
  );

  return (
    <div className="viewer-container">
      {/* Top Controls Bar */}
      <div className="controls-card">
        <div className="controls-row">
          <div className="control-group">
            <label>Trading Pair</label>
            <div className="pair-chips">
              {PRESET_PAIRS.map((pair) => (
                <button
                  key={pair.id}
                  className={`chip-button ${selectedPairId === pair.id ? "active" : ""}`}
                  onClick={() => setSelectedPairId(pair.id)}
                >
                  {pair.name}
                </button>
              ))}
              <button
                className={`chip-button ${selectedPairId === "custom" ? "active" : ""}`}
                onClick={() => setSelectedPairId("custom")}
              >
                Custom Pair
              </button>
            </div>
          </div>

          <div className="control-group">
            <label>Auto-Refresh</label>
            <select
              value={pollingInterval}
              onChange={(e) => setPollingInterval(Number(e.target.value))}
              className="select-input"
            >
              <option value={2000}>2s (Realtime)</option>
              <option value={5000}>5s (Recommended)</option>
              <option value={10000}>10s</option>
              <option value={0}>Paused</option>
            </select>
          </div>

          <div className="control-group">
            <label>Depth Limit</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="select-input"
            >
              <option value={10}>10 Levels</option>
              <option value={20}>20 Levels</option>
              <option value={50}>50 Levels</option>
            </select>
          </div>

          <div className="control-group action-group">
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="refresh-button"
              title="Manual Refetch"
            >
              {isLoading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* Custom Pair Configuration */}
        {selectedPairId === "custom" && (
          <div className="custom-pair-panel">
            <div className="custom-pair-half">
              <h4>Base Asset (Selling)</h4>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={customBase.isNative}
                  onChange={(e) =>
                    setCustomBase((prev) => ({ ...prev, isNative: e.target.checked }))
                  }
                />
                Native XLM
              </label>
              {!customBase.isNative && (
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="Code (e.g. USDC)"
                    value={customBase.code}
                    onChange={(e) =>
                      setCustomBase((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Issuer Public Key (G...)"
                    value={customBase.issuer}
                    onChange={(e) =>
                      setCustomBase((prev) => ({ ...prev, issuer: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>

            <div className="custom-pair-half">
              <h4>Counter Asset (Buying)</h4>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={customCounter.isNative}
                  onChange={(e) =>
                    setCustomCounter((prev) => ({ ...prev, isNative: e.target.checked }))
                  }
                />
                Native XLM
              </label>
              {!customCounter.isNative && (
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="Code (e.g. EURC)"
                    value={customCounter.code}
                    onChange={(e) =>
                      setCustomCounter((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Issuer Public Key (G...)"
                    value={customCounter.issuer}
                    onChange={(e) =>
                      setCustomCounter((prev) => ({ ...prev, issuer: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Metrics Banner */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Best Bid</span>
          <span className="metric-value text-green">
            {bestBid !== null ? formatNumber(bestBid, 6) : "—"}
          </span>
          <span className="metric-sub">{counterSymbol}</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Mid-Market Price</span>
          <span className="metric-value">
            {midPrice !== null ? formatNumber(midPrice, 6) : "—"}
          </span>
          <span className="metric-sub">{counterSymbol}</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Best Ask</span>
          <span className="metric-value text-red">
            {bestAsk !== null ? formatNumber(bestAsk, 6) : "—"}
          </span>
          <span className="metric-sub">{counterSymbol}</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Bid-Ask Spread</span>
          <span className="metric-value">
            {spread !== null ? `${formatNumber(spread, 6)} (${formatNumber(spreadPct!, 2)}%)` : "—"}
          </span>
          <span className="metric-sub">
            {totalBidAmount > 0 || totalAskAmount > 0
              ? `Depth: ${formatNumber(totalBidAmount, 0)} ${baseSymbol} bid / ${formatNumber(totalAskAmount, 0)} ${baseSymbol} ask`
              : "No depth data"}
          </span>
        </div>
      </div>

      {/* Live Order Book Display */}
      <OrderBookTable
        bids={bids}
        asks={asks}
        baseSymbol={baseSymbol}
        counterSymbol={counterSymbol}
        isLoading={isLoading}
        error={error}
      />

      {/* Footer Info */}
      <div className="viewer-footer">
        <span>
          Horizon Endpoint: Order Book API (<code>/order_book</code>)
        </span>
        <span>
          Last updated: {lastFetchedAt ? lastFetchedAt.toLocaleTimeString() : "Pending"}
        </span>
      </div>
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
            <h1>DEX Offer Book Viewer</h1>
            <p className="header-subtitle">
              Live visualization of bids & asks from Stellar Horizon order book endpoint via <code>useOrderBook</code>
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
          <OrderBookViewerInner network={network} />
        </main>
      </div>
    </StellarProvider>
  );
}
