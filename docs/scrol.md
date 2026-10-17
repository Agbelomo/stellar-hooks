# Compatibility Matrix

This document outlines the compatibility matrix for **`stellar-hooks`** across major versions of `@stellar/stellar-sdk`, React, wallet extensions, and Node.js runtimes. It also documents known incompatibilities and migration strategies across Stellar SDK major releases.

---

## 1. Supported Versions Matrix

| `stellar-hooks` | `@stellar/stellar-sdk` | `react` / `react-dom` | `@stellar/freighter-api` | Node.js | Support Status |
|:---|:---|:---|:---|:---|:---|
| **0.2.x** (Current) | **^13.0.0** (13.0 - 13.3+) | `^18.0.0 \|\| ^19.0.0` | `>=6.0.0` | `>=18.0.0` | **Tier 1: Full Support** (Active target) |
| **0.2.x** | **^12.0.0** (12.0 - 12.4) | `^18.0.0 \|\| ^19.0.0` | `>=5.0.0` | `>=18.0.0` | **Tier 2: Compatible** (Minor limitations) |
| **0.2.x** | **^11.0.0** (11.0 - 11.3) | `^18.0.0` | `>=4.0.0` | `>=16.0.0` | **Tier 3: Deprecated** (Not recommended) |
| **0.2.x** | **<= 10.x** | Any | Any | Any | **Incompatible** (Unsupported) |
| **0.1.x** | `^11.0.0 \|\| ^12.0.0` | `^18.0.0` | `^5.0.0` | `>=18.0.0` | **Maintenance Only** |

---

## 2. `@stellar/stellar-sdk` Major Version Breakdown

### Tier 1: `@stellar/stellar-sdk` v13.x (Recommended & Default)
- **Status:** Full official support and continuous integration testing.
- **Key Features Enabled:**
  - Modern Soroban RPC v21+ simulation and transaction submission APIs (`@stellar/stellar-sdk/rpc`).
  - Tree-shakeable minimal subpath exports (`@stellar/stellar-sdk/minimal`).
  - Full support for state restoration footprints and temporary storage TTL management.
  - Native `nativeToScVal` and `scValToNative` type converters for custom contract types.
- **Incompatibilities / Caveats:** None.

### Tier 2: `@stellar/stellar-sdk` v12.x
- **Status:** Backwards-compatible for standard dApp operations.
- **Limitations:**
  - Subpath exports: Bundlers using strict package export resolution may need path mapping if importing `@stellar/stellar-sdk/minimal`. `stellar-hooks` falls back gracefully to root package imports.
  - Simulation cost estimation: Newer RPC fee fields added in v13 may return `null` under v12 endpoints.
- **Recommended Action:** Upgrade to `@stellar/stellar-sdk` `^13.0.0` for optimal bundle size and complete Soroban RPC coverage.

### Tier 3: `@stellar/stellar-sdk` v11.x (Deprecated)
- **Status:** Experimental Soroban protocol support only.
- **Limitations:**
  - Pre-Protocol 20 / early Testnet RPC specifications.
  - Incompatible transaction envelope XDR structures for certain Soroban contract calls.
  - Missing `@stellar/stellar-sdk/minimal` entry point.
- **Recommended Action:** Upgrade immediately to v12+ or v13+.

### Tier 4: `@stellar/stellar-sdk` <= v10.x (Incompatible)
- **Status:** Completely incompatible with `stellar-hooks`.
- **Reason:** Stellar SDK v10 was released prior to the integration of Soroban smart contracts into the SDK. It lacks `rpc.Server`, `Contract`, `nativeToScVal`, and contract event APIs. Attempting to use `stellar-hooks` with `stellar-sdk` <= 10 will result in module resolution and runtime symbol failures.

---

## 3. Feature Compatibility by SDK Major

| Capability | v13.x | v12.x | v11.x | v10.x & older |
|:---|:---:|:---:|:---:|:---:|
| Classic Horizon payments & balances (`usePayment`, `useStellarBalance`) | ✅ Full | ✅ Full | ✅ Full | ⚠️ Partial |
| Account operations (`useAccountMerge`, `useTrustline`, `useManageData`) | ✅ Full | ✅ Full | ✅ Full | ⚠️ Partial |
| Soroban Contract read/write (`useSorobanContract`, `useSorobanRead`) | ✅ Full | ✅ Full | ⚠️ Experimental | ❌ Incompatible |
| Soroban Event Streaming (`useContractEvents`, `useSorobanEvents`) | ✅ Full | ✅ Full | ⚠️ Unstable | ❌ Incompatible |
| Multi-sig & Signers (`useMultiSig`, `useMultiSigThreshold`) | ✅ Full | ✅ Full | ✅ Full | ⚠️ Partial |
| Tree-shaking via `@stellar/stellar-sdk/minimal` | ✅ Full | ⚠️ Partial | ❌ None | ❌ None |
| Freighter v6 Wallet Integration (`useFreighter`) | ✅ Full | ✅ Full | ✅ Full | ⚠️ Legacy v1 |

---

## 4. Known Incompatibilities & Troubleshooting

### 1. Module Resolution with `@stellar/stellar-sdk/minimal`
**Problem:** In environments with strict CJS/bundler configurations (e.g. older Webpack 4 or legacy Jest setups), importing subpaths such as `@stellar/stellar-sdk/minimal` may fail to resolve.  
**Solution:** Ensure your `tsconfig.json` specifies `"moduleResolution": "bundler"` or `"node16"`. `stellar-hooks` provides dual ESM (`.mjs`) and CommonJS (`.js`) builds with mapped exports.

### 2. Horizon Server vs Soroban RPC URLs
**Problem:** Passing a Soroban RPC URL to a Horizon server hook or vice-versa will fail with 404 or serialization errors.  
**Solution:** `stellar-hooks` isolates Horizon and Soroban RPC endpoints:
```tsx
<StellarProvider
  network="testnet"
  customNetworkConfig={{
    network: "custom",
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  }}
>
```

### 3. BigInt Serialization in JSON / State
**Problem:** Certain Soroban return types produce native JavaScript `BigInt` values (`i64`, `u128`, `i128`), which fail when serialized via `JSON.stringify()`.  
**Solution:** Use `scValToNative()` or format balance helpers provided in `stellar-hooks/utils`.

---

## 5. Automated Compatibility Testing

`stellar-hooks` includes automated compatibility tests under `src/__tests__/compatibility.test.ts`.

To verify your environment's installed SDK compatibility, ensure `@stellar/stellar-sdk` meets the peer requirements:

```bash
npm list @stellar/stellar-sdk
```
Expected output:
```
stellar-hooks@0.2.0
└── @stellar/stellar-sdk@13.3.0
```
