# Stellar Multi-Asset Portfolio Dashboard

A full-featured portfolio overview dashboard that combines balance, price-oracle, and transaction history hooks from `stellar-hooks` into a single, responsive Web3 portfolio management interface.

## Features

- 💼 **Multi-Asset Balance Tracking**: Surfaces native XLM and issued trustline tokens (USDC, EURC, AQUA) using `useStellarBalance`
- 🔮 **Price Oracle Valuation**: Real-time asset pricing and USD valuations calculated using `useCurrencyDisplay` paired with Soroban Oracle rates
- 📜 **Cursor-based Transaction History**: Live paginated transaction history from Horizon with status tracking, fee calculations, and infinite scroll via `useTransactionHistory`
- 🔐 **Wallet Connection & Public Key Inspection**: Connect via Freighter with `useFreighter` or enter any arbitrary Stellar public key to inspect its portfolio
- 📊 **Asset Allocation**: Dynamic percentage breakdown and progress bars showing portfolio diversification
- 🌐 **Network Support**: Seamlessly toggle between Stellar Testnet and Mainnet

## Hooks Used

- [`useFreighter`](https://github.com/dark-princezz/stellar-hooks): Wallet connection, network matching, and public key detection
- [`useStellarBalance`](https://github.com/dark-princezz/stellar-hooks): Fetches and categorizes all balances on a Stellar account
- [`useCurrencyDisplay`](https://github.com/dark-princezz/stellar-hooks): Local currency conversion and formatting for asset figures
- [`useTransactionHistory`](https://github.com/dark-princezz/stellar-hooks): Horizon transaction paging with forward/backward cursor support
- [`StellarProvider`](https://github.com/dark-princezz/stellar-hooks): Root network and RPC provider

## Running Locally

```bash
cd examples/multi-asset-portfolio-dashboard
npm install
npm run dev
```

Open [http://localhost:3005](http://localhost:3005) in your browser.
