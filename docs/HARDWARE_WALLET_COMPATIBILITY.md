# Hardware Wallet Compatibility

Which hardware wallets have been checked against the `stellar-hooks` wallet
adapters, and how that is kept honest.

**Read the Status column literally.** `verified` means a person signed a
transaction with the real device and recorded the firmware and app versions
below. `unverified` means the adapter exists and its logic is covered by
automated tests with a mocked transport, but nobody has recorded a run on that
model. Nothing in this repository can test a physical device automatically.

## Matrix

<!-- matrix:start -->
| Wallet | Model | Adapter | Firmware | Stellar app | Status | Verified by | Verified on | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ledger | Nano S | ledger | – | – | unverified | – | – | Discontinued model. |
| Ledger | Nano S Plus | ledger | – | – | unverified | – | – | – |
| Ledger | Nano X | ledger | – | – | unverified | – | – | WebUSB only; the adapter does not use Bluetooth. |
| Ledger | Stax | ledger | – | – | unverified | – | – | – |
| Ledger | Flex | ledger | – | – | unverified | – | – | – |
| Trezor | Model One | – | – | – | no-adapter | – | – | stellar-hooks has no Trezor adapter yet. |
| Trezor | Model T | – | – | – | no-adapter | – | – | stellar-hooks has no Trezor adapter yet. |
| Trezor | Safe 3 | – | – | – | no-adapter | – | – | stellar-hooks has no Trezor adapter yet. |
| Trezor | Safe 5 | – | – | – | no-adapter | – | – | stellar-hooks has no Trezor adapter yet. |
<!-- matrix:end -->

The table is generated from [`hardware-wallet-matrix.json`](./hardware-wallet-matrix.json).
Edit the JSON, then run:

```bash
node scripts/check-hardware-matrix.mjs --write
```

| Status | Meaning |
| --- | --- |
| `verified` | Tested end-to-end on the device (connect + sign) with the listed firmware and Stellar app. |
| `unverified` | Adapter exists; no recorded device run. |
| `known-issue` | A run found a problem; see Notes. |
| `no-adapter` | `stellar-hooks` has no adapter for this wallet, so nothing can be verified. |

## What is automated

The `Hardware Wallet Matrix` workflow runs on every change to the matrix, the
Ledger adapter or the check script:

1. `scripts/check-hardware-matrix.mjs` validates the JSON (required fields,
   known statuses, a `verified` entry must carry firmware, Stellar app, tester
   and date, named adapters must exist under `src/wallets/`) and fails if the
   table above is out of date.
2. `src/wallets/__tests__/ledger.test.ts` runs the Ledger adapter against a
   mocked WebUSB transport and Stellar app: connect path, signing payload and
   encoding, and error propagation.

These checks catch regressions in the adapter and stale documentation. They do
not prove a model or firmware works.

## Verifying a device

You need the physical device, Chrome or Edge (WebUSB), and a testnet account.

1. Update the device firmware and install or update the **Stellar** app. Note
   both versions from Ledger Live (Manager) or the device settings.
2. Install the optional packages in a scratch app:
   `npm install @ledgerhq/hw-transport-webusb @ledgerhq/hw-app-str`.
3. Open the Stellar app on the device, then in the scratch app:
   - call `useWallet()` with the `ledger` adapter and `connect()`; confirm the
     public key matches the one shown in Ledger Live,
   - build a small testnet payment, call `signTransaction`, confirm on the
     device, submit it, and check it on a testnet explorer,
   - reject one signing request on the device and confirm your app receives an
     error instead of hanging.
4. Edit the matching entry in `hardware-wallet-matrix.json`: set `status` to
   `verified`, fill in `firmware`, `stellarApp`, `verifiedBy` (GitHub handle),
   `verifiedOn` (`YYYY-MM-DD`), and put anything surprising in `notes`. Use
   `known-issue` if a step failed and explain it.
5. Run `node scripts/check-hardware-matrix.mjs --write` and open a pull request.

## Known limits of the Ledger adapter

- WebUSB only (Chromium browsers). Bluetooth and WebHID are not used.
- `signMessage` and `signAuthEntry` are not supported by the Stellar Ledger app,
  so Soroban authorization entries cannot be signed with a Ledger.
- The derivation path is fixed at `44'/148'/0'`.

## Trezor

There is no Trezor adapter in `stellar-hooks`, so the Trezor rows are
`no-adapter`. Trezor devices can sign Stellar transactions through Trezor
Connect; building an adapter is tracked separately and the rows will be updated
when one lands.
