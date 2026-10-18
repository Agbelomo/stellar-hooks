# useTokenMetadata

Read a SEP-41 token's `name`, `symbol` and `decimals` with one hook call.

## Import

```tsx
import { useTokenMetadata } from 'stellar-hooks'
```

## Usage

```tsx
const { name, symbol, decimals, isLoading, error } = useTokenMetadata({
  contractId: 'CTOKEN...',
})
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `contractId` | `string` | – | SEP-41 token contract. |
| `enabled` | `boolean` | `true` | Set `false` to skip fetching. |
| `cacheTTL` | `number` | 24 hours | Metadata rarely changes, so it is cached per contract and network. |

## Returns

`metadata` (`{ name, symbol, decimals } | null`), `name`, `symbol`,
`decimals`, `isLoading`, `error`, and `refetch()` (bypasses the cache).

## How it reads

A Soroban transaction holds one contract invocation, so the three values
cannot come from a single simulation. The hook starts the three simulations
at the same time and caches the combined result, so a token costs three
parallel RPC requests once rather than three sequential, separately cached
reads. Contracts whose `name`, `symbol` or `decimals` return unexpected types
produce an error instead of partial data.

## Related

- [useTokenBalance](/hooks/use-token-balance)
