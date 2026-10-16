# Migration Guide: `@stellar/freighter-api` v1 → v6

`stellar-hooks` ships with `@stellar/freighter-api` **v6** as a direct dependency. If you previously called the Freighter API directly in your app (v1 style), this guide covers every breaking change and shows how each maps to the v6 API — and to the `useFreighter` hook, which already handles all of this for you.

---

## Table of Contents

1. [What changed at a glance](#1-what-changed-at-a-glance)
2. [All functions now return result objects](#2-all-functions-now-return-result-objects)
3. [Function renames](#3-function-renames)
4. [`isConnected` — from boolean to object](#4-isconnected--from-boolean-to-object)
5. [`getPublicKey` → `getAddress`](#5-getpublickey--getaddress)
6. [`getNetworkDetails` → `getNetworkDetails` / `getNetwork`](#6-getnetworkdetails--getnetworkdetails--getnetwork)
7. [`requestAccess` — now returns an object](#7-requestaccess--now-returns-an-object)
8. [`signTransaction` — option key rename](#8-signtransaction--option-key-rename)
9. [`signAuthEntry` — now requires `address`](#9-signauthentry--now-requires-address)
10. [`signBlob` → `signMessage`](#10-signblob--signmessage)
11. [Using `useFreighter` instead](#11-using-usefreighter-instead)

---

## 1. What changed at a glance

| Area | v1 | v6 |
|---|---|---|
| Return style | Raw values (string, boolean) | Result objects `{ value, error }` |
| Get public key | `getPublicKey()` → `string` | `getAddress()` → `{ address, error }` |
| Check connection | `isConnected()` → `boolean` | `isConnected()` → `{ isConnected, error }` |
| Network details | `getNetworkDetails()` → object | unchanged shape, still `{ network, networkPassphrase, … }` |
| Request access | `requestAccess()` → `string` | `requestAccess()` → `{ address, error }` |
| Sign transaction | `accountToSign` option | `address` option |
| Sign auth entry | no `address` required | `address` required |
| Sign blob | `signBlob(blob)` | `signMessage(blob, { address })` → `{ signedMessage, error }` |

---

## 2. All functions now return result objects

The most pervasive change: every async function in v6 returns `{ <value>, error }` instead of throwing or returning a plain value.

**v1**

```ts
// throws on error, returns value on success
const publicKey = await getPublicKey();
const connected = await isConnected(); // boolean
```

**v6**

```ts
// never throws — check error field instead
const { address, error } = await getAddress();
if (error) throw new Error(error.message);

const { isConnected: connected, error: connErr } = await isConnected();
if (connErr || !connected) { /* not installed */ }
```

> **Rule of thumb:** always destructure and check `error` before using the value.

---

## 3. Function renames

| v1 | v6 |
|---|---|
| `getPublicKey` | `getAddress` |
| `signBlob` | `signMessage` |

All other function names are unchanged.

---

## 4. `isConnected` — from boolean to object

**v1**

```ts
import { isConnected } from "@stellar/freighter-api";

const connected: boolean = await isConnected();
if (!connected) {
  // Freighter not installed or not available
}
```

**v6**

```ts
import { isConnected } from "@stellar/freighter-api";

const { isConnected: connected, error } = await isConnected();
if (error || !connected) {
  // Freighter not installed or not available
}
```

The returned `isConnected` boolean has the same meaning — it is still `true` when the extension is installed and accessible. The difference is that errors (e.g. the extension is not installed) are now surfaced via the `error` field rather than throwing.

---

## 5. `getPublicKey` → `getAddress`

**v1**

```ts
import { getPublicKey } from "@stellar/freighter-api";

const publicKey: string = await getPublicKey();
// Empty string if the user has not granted access yet
```

**v6**

```ts
import { getAddress } from "@stellar/freighter-api";

const { address, error } = await getAddress();
// address is null (not empty string) when the user has not granted access
if (!error && address) {
  console.log(address); // G...
}
```

Key differences:
- Function is renamed `getAddress`.
- Returns `null` (not an empty string) when no access has been granted.
- `error` is populated if something goes wrong.

---

## 6. `getNetworkDetails` → `getNetworkDetails` / `getNetwork`

The function name `getNetworkDetails` exists in both versions but the return shape is slightly different. There is also a new `getNetwork` shorthand in v6.

**v1**

```ts
import { getNetworkDetails } from "@stellar/freighter-api";

const details = await getNetworkDetails();
// { network: string, networkPassphrase: string, networkUrl: string, sorobanRpcUrl?: string }
```

**v6**

```ts
import { getNetworkDetails } from "@stellar/freighter-api";

const { network, networkPassphrase, networkUrl, sorobanRpcUrl } =
  await getNetworkDetails();
// Same shape — no error wrapping on this function
```

`getNetworkDetails` is not wrapped in a result object in v6 — it still returns the network data directly. No change needed here beyond the import.

---

## 7. `requestAccess` — now returns an object

**v1**

```ts
import { requestAccess } from "@stellar/freighter-api";

const publicKey: string = await requestAccess();
// Throws if the user denies the request
```

**v6**

```ts
import { requestAccess } from "@stellar/freighter-api";

const { address, error } = await requestAccess();
if (error) throw new Error(error.message);
if (!address) throw new Error("No address returned");
console.log(address); // G...
```

---

## 8. `signTransaction` — option key rename

**v1**

```ts
import { signTransaction } from "@stellar/freighter-api";

// Returns string directly; option key is "accountToSign"
const signedXdr: string = await signTransaction(txXdr, {
  networkPassphrase: "Test SDF Network ; September 2015",
  accountToSign: "GPUBKEY...",
});
```

**v6**

```ts
import { signTransaction } from "@stellar/freighter-api";

// Returns { signedTxXdr, error }; option key is now "address"
const { signedTxXdr, error } = await signTransaction(txXdr, {
  networkPassphrase: "Test SDF Network ; September 2015",
  address: "GPUBKEY...",               // ← was "accountToSign"
});
if (error) throw new Error(error.message);
```

Changes:
- Return type is `{ signedTxXdr, error }` instead of `string`.
- Option key `accountToSign` is renamed to `address`.

---

## 9. `signAuthEntry` — now requires `address`

**v1**

```ts
import { signAuthEntry } from "@stellar/freighter-api";

// No address needed; returns string directly
const signedEntry: string = await signAuthEntry(entryPreimageXdr);
```

**v6**

```ts
import { signAuthEntry } from "@stellar/freighter-api";

// address is now required; returns { signedAuthEntry, error }
const { signedAuthEntry, error } = await signAuthEntry(entryPreimageXdr, {
  address: publicKey,   // ← required in v6
});
if (error) throw new Error(error.message);
if (!signedAuthEntry) throw new Error("No signed auth entry returned");
```

---

## 10. `signBlob` → `signMessage`

The function for signing arbitrary data was renamed from `signBlob` to `signMessage` and now requires an `address`.

**v1**

```ts
import { signBlob } from "@stellar/freighter-api";

// Returns string directly
const signature: string = await signBlob(base64Payload);
```

**v6**

```ts
import { signMessage } from "@stellar/freighter-api";

// Returns { signedMessage, error }; address is required
const { signedMessage, error } = await signMessage(base64Payload, {
  address: publicKey,
});
if (error) throw new Error(error.message);
if (!signedMessage) throw new Error("No signed message returned");

// signedMessage may be a Uint8Array; convert if you need a string
const signature = signedMessage.toString();
```

---

## 11. Using `useFreighter` instead

If you're using `stellar-hooks`, you don't need to call `@stellar/freighter-api` directly at all. `useFreighter` already handles every v1 → v6 difference internally:

- `isConnected()` result object → `state.isInstalled` / `state.isConnected`
- `getAddress()` → `state.publicKey`
- `getNetworkDetails()` → `state.network` / `state.networkPassphrase`
- `requestAccess()` result object → `connect()`
- `signTransaction()` with `address` option → `signTransaction(xdr, opts)`
- `signAuthEntry()` with `address` → `signAuthEntry(entryPreimageXdr)`
- `signMessage()` → exposed as `signBlob(blob, opts?)` for backwards-compatible naming

```tsx
import { useFreighter } from "stellar-hooks";

function WalletButton() {
  const {
    isInstalled,
    isConnected,
    publicKey,
    network,
    isLoading,
    error,
    connect,
    disconnect,
    signTransaction,
    signAuthEntry,
    signBlob,      // wraps signMessage internally
  } = useFreighter();

  if (!isInstalled) return <p>Install Freighter</p>;
  if (!isConnected)
    return <button onClick={connect} disabled={isLoading}>Connect</button>;

  return (
    <div>
      <p>{publicKey} on {network}</p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}
```

The hook surfaces the same logical API as v1 while delegating to the v6 functions under the hood.

---

## Full before/after reference

```ts
// ─── v1 ──────────────────────────────────────────────────────────────────────
import {
  isConnected,
  getPublicKey,
  getNetworkDetails,
  requestAccess,
  signTransaction,
  signAuthEntry,
  signBlob,
} from "@stellar/freighter-api";

const connected = await isConnected();                       // boolean
const pk        = await getPublicKey();                      // string | ""
const net       = await getNetworkDetails();                 // { network, ... }
const pk2       = await requestAccess();                     // string (throws on deny)
const signedTx  = await signTransaction(xdr, {
  accountToSign: pk,
  networkPassphrase: net.networkPassphrase,
});                                                          // string
const signedEntry = await signAuthEntry(entryXdr);          // string
const sig         = await signBlob(payload);                // string


// ─── v6 ──────────────────────────────────────────────────────────────────────
import {
  isConnected,
  getAddress,
  getNetworkDetails,
  requestAccess,
  signTransaction,
  signAuthEntry,
  signMessage,
} from "@stellar/freighter-api";

const { isConnected: connected } = await isConnected();     // { isConnected, error }
const { address: pk }            = await getAddress();      // { address, error }
const net                        = await getNetworkDetails();// unchanged
const { address: pk2 }           = await requestAccess();   // { address, error }
const { signedTxXdr }            = await signTransaction(xdr, {
  address: pk,                                              // ← "address" not "accountToSign"
  networkPassphrase: net.networkPassphrase,
});                                                         // { signedTxXdr, error }
const { signedAuthEntry }        = await signAuthEntry(entryXdr, {
  address: pk,                                             // ← address now required
});                                                        // { signedAuthEntry, error }
const { signedMessage }          = await signMessage(payload, {
  address: pk,                                             // ← address required
});                                                        // { signedMessage, error }
```

---

## Related

- [Migration guide: raw SDK → stellar-hooks](./migration-guide.md)
- [useFreighter source](../src/hooks/useFreighter.ts)
- [Freighter API changelog](https://github.com/stellar/freighter/blob/master/CHANGELOG.md)
