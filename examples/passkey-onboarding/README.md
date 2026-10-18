# Passkey Onboarding Example

An extensionless wallet onboarding flow built with `usePasskeyRegister` and `usePasskeySign`. Users create a Stellar smart account with a device passkey (Touch ID, Face ID, Windows Hello, or a security key) and send their first payment — no Freighter, no seed phrase, no secret key.

## Flow

1. **No extension needed:** explains what the user does *not* need.
2. **Create passkey:** `usePasskeyRegister` runs the WebAuthn registration ceremony (ES256 / P-256) and deploys a passkey smart account through a factory contract.
3. **Fund account:** a demo sponsor transfers testnet XLM to the smart account via the native asset contract.
4. **First payment:** `usePasskeySign.invoke` simulates a `transfer` from the smart account, signs the resulting `SorobanAuthorizationEntry` with the passkey, and submits it.

## Setup

```bash
cd examples/passkey-onboarding
cp .env.example .env   # set VITE_FACTORY_CONTRACT_ID
npm install
npm run dev
```

Open `http://localhost:3000`. WebAuthn requires a secure context, so `localhost` or HTTPS is required.

### Factory contract

`VITE_FACTORY_CONTRACT_ID` must point to a testnet factory whose `deploy` function accepts `(salt: BytesN<32>, id: Bytes, public_key: BytesN<65>)` and returns the new account `Address`. The smart account's `__check_auth` must verify the signature struct produced by `signAuthEntry`:

```rust
pub struct Signature {
    pub authenticator_data: Bytes,
    pub client_data_json: Bytes,
    pub id: Bytes,
    pub signature: BytesN<64>,
}
```

Factories with a different signature can be used via the `deployMethod` and `buildDeployArgs` options of `usePasskeyRegister`.

## About the fee sponsor

Smart accounts are contracts and cannot be transaction sources, so another account must submit and pay fees. `src/feePayer.ts` generates a throwaway testnet key funded by Friendbot for demo purposes. In production, replace it with a relayer or fee-sponsorship service. The user's authority comes only from the passkey-signed authorization entries; the sponsor cannot move the user's funds.
