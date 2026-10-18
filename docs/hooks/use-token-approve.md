# useTokenApprove

Approve a spender to move your SEP-41 tokens until an expiration ledger.

## Import

```tsx
import { useTokenApprove } from 'stellar-hooks'
```

## Usage

```tsx
const { approve, status, hash, error, isLoading } = useTokenApprove({
  contractId: 'CTOKEN...',
  onSuccess: (hash) => console.log('approved', hash),
})

await approve({
  spender: 'CDEX...',
  amount: 50_000_000n,          // base units; 0n revokes
  expirationLedger: latestLedger + 17_280, // ~1 day
})
```

## Validation

`approve` checks its input before simulating or opening the wallet. A failure
sets `error` (`type: "transaction"`) with one of these `resultCode`s and never
signs anything:

| `resultCode` | Cause |
| --- | --- |
| `no_wallet` | No wallet connected. |
| `invalid_spender` | Spender is not a valid `G...` or `C...` address. |
| `same_account` | Spender is the connected account. |
| `invalid_amount` | Amount is negative. |
| `invalid_expiration` | `expirationLedger` is missing, fractional, negative or larger than 32 bits. |
| `expiration_in_past` | `amount > 0` and `expirationLedger` is not after the current ledger. |

An `amount` of `0n` revokes the allowance and skips the ledger check. If the
RPC cannot report the current ledger, the contract simulation makes the final
call instead of blocking the user.

## Returns

`approve`, `status`, `hash`, `error`, `isLoading`, `isSuccess`, `isError`,
`reset`.

## Related

- [useTokenAllowance](/hooks/use-token-allowance)
- [useTokenTransfer](/hooks/use-token-transfer)
