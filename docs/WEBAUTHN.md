# WebAuthn & Passkey Compatibility

Passkey smart accounts rely on the browser's WebAuthn API (`navigator.credentials.create()` / `.get()`) and an authenticator that can produce **ES256 (COSE `-7`, ECDSA P-256 / secp256r1)** signatures. Soroban verifies those signatures on-chain with `secp256r1_verify`. This page summarises where that works today, the platform quirks to design around, and what to fall back to.

> Browser and OS support changes quickly. The versions below are approximate minimums for the features listed. Confirm against [passkeys.dev/device-support](https://passkeys.dev/device-support/) and [caniuse.com/webauthn](https://caniuse.com/webauthn) before relying on a specific version.

## Browser support

| Browser | WebAuthn | Synced passkeys | Platform authenticator | Cross-device (QR / hybrid) | Notes |
|---------|----------|-----------------|------------------------|----------------------------|-------|
| **Chrome** (desktop) | ✅ | ✅ Google Password Manager; iCloud Keychain on macOS 14+ | Windows Hello, macOS Touch ID | ✅ | Linux has no built-in platform authenticator; uses Google Password Manager, a phone, or a security key. |
| **Chrome** (Android) | ✅ | ✅ Google Password Manager or a third-party provider (Android 14+) | Android biometrics / screen lock | ✅ | Needs Google Play services; Android 9+ for passkeys. |
| **Safari** (macOS) | ✅ | ✅ iCloud Keychain (Safari 16+ / macOS 13+) | Touch ID | ✅ | Strict user-gesture requirement (see caveats). |
| **Safari** (iOS / iPadOS) | ✅ | ✅ iCloud Keychain (iOS 16+) | Face ID / Touch ID | ✅ | **Every iOS browser uses WebKit**, so Chrome, Firefox, and Edge on iOS behave like Safari. |
| **Firefox** (desktop) | ✅ | ✅ via the OS (Windows Hello, macOS iCloud Keychain on recent versions) | Windows Hello, macOS Touch ID | ⚠️ Varies by OS | Weaker on Linux: security keys only. |
| **Firefox** (Android) | ⚠️ | ⚠️ Partial | Partial | ⚠️ | Passkey support lags Chrome; test before you rely on it. |
| **Edge** (desktop) | ✅ | ✅ Microsoft / Windows passkeys | Windows Hello, macOS Touch ID | ✅ | Chromium-based, so it behaves like Chrome. |
| **Samsung Internet** | ✅ | ✅ Google Password Manager / Samsung Pass | Android biometrics | ✅ | Chromium-based. |

## Authenticator support

| Authenticator | Type | ES256 (`-7`) | Synced | Notes |
|---------------|------|--------------|--------|-------|
| **macOS Touch ID** | Platform | ✅ | ✅ iCloud Keychain | On Macs without Touch ID, passkeys fall back to the login password or a nearby iPhone. |
| **iOS Face ID / Touch ID** | Platform | ✅ | ✅ iCloud Keychain | Also acts as a cross-device authenticator for other machines over QR + Bluetooth. |
| **Windows Hello** (face, fingerprint, PIN) | Platform | ✅ | ✅ on recent Windows 11 builds; device-bound on older versions | Windows 10 1903+. Older builds may prefer RS256 if offered, so request only `-7`. |
| **Android biometrics / screen lock** | Platform | ✅ | ✅ Google Password Manager | Also acts as a cross-device authenticator over QR + Bluetooth. |
| **YubiKey 5 / Security Key series** | Roaming (USB, NFC, Lightning) | ✅ | ❌ Device-bound | FIDO2 firmware required. Limited slots for discoverable credentials (25 on firmware < 5.7, 100 on 5.7+). |
| **Other FIDO2 security keys** (Feitian, SoloKeys, Google Titan) | Roaming | ✅ (FIDO2 models) | ❌ Device-bound | U2F-only (FIDO1) keys **cannot** create passkeys. |
| **Password managers** (1Password, Bitwarden, Dashlane) | Synced provider | ✅ | ✅ Provider vault | Works through the browser extension or the OS credential-provider APIs (iOS 17+, Android 14+). |

## Known caveats & platform constraints

### Secure context

WebAuthn is only available on **HTTPS** origins or `http://localhost`. It is `undefined` on plain-HTTP LAN addresses (e.g. `http://192.168.x.x`), which commonly breaks mobile testing. Use a tunnel or a local TLS certificate.

### User gesture

Safari, and increasingly other browsers, require `create()` / `get()` to run during **transient user activation**: synchronously from a click or tap, before activation expires. Awaiting a network request between the click and the WebAuthn call can make the prompt fail with `NotAllowedError`.

- Fetch challenges, ledger sequence numbers, and simulation results **before** the user clicks.
- Keep the WebAuthn call as close to the click handler as possible.

### Iframes

- In a **cross-origin iframe**, `get()` needs the embedding page to delegate permission: `<iframe allow="publickey-credentials-get *">`.
- `create()` in a cross-origin iframe needs `allow="publickey-credentials-create *"`. Support is newer and less consistent across browsers.
- Some wallets and dApp browsers inside native apps (in-app WebViews) don't expose WebAuthn at all. Detect support and offer an "open in browser" path.

### Relying party ID binding

Passkeys are bound to the **RP ID** (your registrable domain, e.g. `example.com`). A passkey created on `app.example.com` with RP ID `example.com` works on any subdomain, but **not** on a different domain. Changing domains strands existing smart accounts unless you register a recovery signer or use Related Origin Requests (Chromium only).

### Signature format

Authenticators return **DER-encoded** ECDSA signatures and may produce high-S values. Soroban expects a raw 64-byte `r || s` with **low-S**, so signatures must be normalised before submission.

### Signature counters

Synced passkeys report a signature counter of `0`. Don't use the counter for clone detection in smart account contracts.

### Discoverable credential limits

Hardware keys have a small number of slots for discoverable (resident) credentials. Use `residentKey: "preferred"` rather than `"required"` so registration still succeeds on full keys. Store the credential ID so the app can pass it in `allowCredentials`.

### Account recovery

A device-bound passkey (hardware key, older Windows Hello) is lost with the device. Encourage users to add a second passkey or a recovery signer.

## Feature detection

```ts
async function getPasskeySupport() {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !window.isSecureContext) {
    return { webauthn: false, platform: false, conditionalUi: false };
  }
  const [platform, conditionalUi] = await Promise.all([
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
    PublicKeyCredential.isConditionalMediationAvailable?.() ?? Promise.resolve(false),
  ]);
  return { webauthn: true, platform, conditionalUi };
}
```

- **`platform: true`:** offer "Create passkey" as the primary path.
- **`platform: false`, `webauthn: true`:** passkeys still work through a phone (QR / hybrid) or a security key. Explain that a second device may be needed.
- **`webauthn: false`:** use a fallback below.

## Fallback recommendations

1. **Cross-device sign-in:** on desktops without a platform authenticator (Linux, older Windows), the browser's QR flow lets users authenticate with their phone.
2. **Hardware security key:** a FIDO2 key works almost everywhere WebAuthn exists, including Linux and Firefox.
3. **Wallet extension:** fall back to `useFreighter()` / `useWalletKit()` for users who already have a Stellar wallet, or where WebAuthn is unavailable (in-app WebViews, insecure contexts).
4. **Recovery signers:** register at least one recovery signer (a second passkey or a `G…` key held by the user or a guardian) so losing a device doesn't lose the account.
5. **Clear error copy:** map `NotAllowedError` (cancelled or timed out), `InvalidStateError` (credential already registered on this authenticator), and `SecurityError` (RP ID or origin mismatch) to actionable messages.
