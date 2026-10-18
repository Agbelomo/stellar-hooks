# useTokenBalance

Read the balance of a SEP-41 token (`balance(id) -> i128`) for one account.

## Import

```tsx
import { useTokenBalance } from 'stellar-hooks'
```

## Usage

```tsx
const { balance, formatted, isLoading, error, refetch } = useTokenBalance({
  contractId: 'CTOKEN...',
  account: publicKey,
})
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `contractId` | `string` | – | SEP-41 token contract (`C...`). |
| `account` | `string` | – | Account to read (`G...` or `C...`). Fetching waits until it is set. |
| `decimals` | `number` | `7` | Decimals used for `formatted`. |
| `enabled` | `boolean` | `true` | Set `false` to skip fetching. |
| `refetchInterval` | `number` | `0` | Poll every N ms (`0` disables). |
| `cacheTTL` | `number` | `30000` | Cache lifetime in ms. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `balance` | `bigint \| null` | Raw balance in base units. |
| `formatted` | `string \| null` | Decimal string using `decimals`, e.g. `"12.3456789"`. |
| `decimals` | `number` | Decimals used for formatting. |
| `isLoading` / `isRefetching` | `boolean` | Initial fetch / background refresh. |
| `error` | `Error \| null` | Simulation or parsing error. |
| `refetch` | `() => Promise<void>` | Manual refresh. |

The balance is read by simulation, so no wallet connection or fee is needed.
Use [`formatTokenAmount` / `parseTokenAmount`](/hooks/use-token-transfer) to convert between
decimal strings and base units.

## Related

- [useTokenTransfer](/hooks/use-token-transfer)
- [useTokenAllowance](/hooks/use-token-allowance)
- [useSorobanTokenBalance](/hooks/use-soroban-token-balance)
