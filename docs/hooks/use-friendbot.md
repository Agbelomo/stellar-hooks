# useFriendbot

Fund a testnet or futurenet account with Friendbot and report whether it was
funded, was already funded, or failed.

## Import

```tsx
import { useFriendbot } from 'stellar-hooks'
```

## Usage

```tsx
const { fund, status, isFunding, isFunded, isAlreadyFunded, error } =
  useFriendbot({ account: publicKey })

<button onClick={() => fund()} disabled={isFunding}>
  Fund with Friendbot
</button>
```

## Options

| Option | Type | Description |
| --- | --- | --- |
| `account` | `string` | Default account for `fund()`. |
| `friendbotUrl` | `string` | Override the Friendbot URL. Required on `custom` networks. |
| `onFunded` | `(account) => void` | Called after a successful funding. |
| `onError` | `(error) => void` | Called on failure (not for already-funded accounts). |

## Returns

| Field | Description |
| --- | --- |
| `fund(account?)` | Request funds; resolves with the final status. A second call while one is in flight is ignored. |
| `status` | `idle`, `funding`, `funded`, `already_funded` or `error`. |
| `isFunding`, `isFunded`, `isAlreadyFunded` | Convenience flags. `isFunded` is true for both `funded` and `already_funded`. |
| `hash` | Funding transaction hash, when Friendbot returned one. |
| `error` | `Error` for invalid input, mainnet use, HTTP errors and network failures. |
| `reset()` | Back to `idle`. |

Friendbot is only available on testnet (`friendbot.stellar.org`) and
futurenet (`friendbot-futurenet.stellar.org`). On mainnet the hook returns an
error without sending a request.
