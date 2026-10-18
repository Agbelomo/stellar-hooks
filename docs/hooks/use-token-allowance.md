# useTokenAllowance

Read how much of an owner's SEP-41 tokens a spender may still spend, and when
that allowance expires.

## Import

```tsx
import { useTokenAllowance } from 'stellar-hooks'
```

## Usage

```tsx
const { allowance, formatted, expirationLedger, isExpired } = useTokenAllowance({
  contractId: 'CTOKEN...',
  owner: publicKey,
  spender: 'CDEX...',
})
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `contractId` | `string` | – | SEP-41 token contract. |
| `owner` | `string` | – | Account that granted the allowance. |
| `spender` | `string` | – | Account allowed to spend. |
| `decimals` | `number` | `7` | Decimals used for `formatted`. |
| `includeExpiration` | `boolean` | `true` | Also look up the expiration ledger. |
| `enabled`, `refetchInterval`, `cacheTTL` | | | Same as [`useTokenBalance`](/hooks/use-token-balance). |

## Returns

`allowance` (`bigint | null`), `formatted`, `expirationLedger`
(`number | null`), `isExpired`, `isLoading`, `isRefetching`, `error`,
`refetch`.

## About the expiration ledger

SEP-41 `allowance(from, spender)` only returns the amount. The expiration is
read from the token's `Allowance({ from, spender })` storage entry, which is
the layout used by Stellar Asset Contracts (`live_until_ledger`) and the
Soroban example token (`expiration_ledger`). For tokens with a different
storage layout, or if the lookup fails, `expirationLedger` is `null` and
`isExpired` is `false`; the amount is still returned.

## Related

- [useTokenBalance](/hooks/use-token-balance)
- [useTokenTransfer](/hooks/use-token-transfer)
