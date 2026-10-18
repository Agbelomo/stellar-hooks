# useTokenTransfer

Transfer a SEP-41 token from the connected wallet.

## Import

```tsx
import { useTokenTransfer, parseTokenAmount } from 'stellar-hooks'
```

## Usage

```tsx
const { transfer, status, hash, error, isLoading } = useTokenTransfer({
  contractId: 'CTOKEN...',
  onSuccess: (hash) => console.log('confirmed', hash),
})

await transfer({ to: 'GDEST...', amount: parseTokenAmount('1.5') }) // 15_000_000n
```

`transfer` validates the input first. A missing wallet, a malformed
recipient, a non-positive amount, or sending to yourself sets `error`
(`type: "transaction"`, with a `resultCode` of `no_wallet`,
`invalid_recipient`, `invalid_amount` or `same_account`) without simulating or
prompting the wallet. Valid input runs simulate → sign → submit → poll through
[`useSorobanContract`](/hooks/use-soroban-contract).

## Options

| Option | Type | Description |
| --- | --- | --- |
| `contractId` | `string` | SEP-41 token contract (`C...`). |
| `onSuccess` | `(hash: string) => void` | Called once with the hash when confirmed. |
| `onError` | `(error) => void` | Called for validation and transaction errors. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `transfer` | `({ to, amount }) => Promise<void>` | `amount` is a `bigint` in base units. |
| `status` | `TransactionStatus` | `idle`, `building`, `signing`, `submitting`, `polling`, `success` or `error`. |
| `hash` | `string \| null` | Transaction hash after confirmation. |
| `error` | `StellarTransactionError \| null` | Last error. |
| `isLoading` / `isSuccess` / `isError` | `boolean` | Convenience flags. |
| `reset` | `() => void` | Return to `idle`. |

## Amount helpers

```tsx
formatTokenAmount(15_000_000n, 7) // "1.5"
parseTokenAmount('1.5', 7)        // 15_000_000n (throws on too many decimals)
```

## Related

- [useTokenBalance](/hooks/use-token-balance)
- [useTokenAllowance](/hooks/use-token-allowance)
