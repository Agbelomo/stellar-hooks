# Stellar DEX Offer Book Viewer

An example application visualizing live bids and asks for any asset pair using Horizon's order book endpoint via `useOrderBook` from `stellar-hooks`.

## Features

- ⚡️ **Live Order Book Queries**: Query bids and asks directly from Horizon via the `useOrderBook` hook
- 📊 **Real-time Depth Visualization**: Visual cumulative depth bars for buy and sell order levels
- 📈 **Key Market Metrics**: Real-time Best Bid, Best Ask, Mid-Market Price, Spread ($ and %), and aggregate liquidity depth
- 🔄 **Configurable Auto-Refresh**: Switch between realtime (2s), standard (5s, 10s), or paused updates
- 🪙 **Trading Pair Selector**: Instant switching between presets (XLM/USDC, XLM/AQUA, XLM/EURC) or custom asset pairs with custom issuers
- 🌐 **Network Switcher**: Seamlessly toggle between Testnet and Mainnet Horizon servers

## Hooks Demonstrated

- [`useOrderBook`](https://github.com/dark-princezz/stellar-hooks): Fetches DEX order book data with polling, depth limits, and clean typed bids/asks return shapes
- [`StellarProvider`](https://github.com/dark-princezz/stellar-hooks): Provides network and Horizon RPC context across the application

## Running Locally

```bash
cd examples/dex-offer-book-viewer
npm install
npm run dev
```

Open [http://localhost:3004](http://localhost:3004) in your browser.
