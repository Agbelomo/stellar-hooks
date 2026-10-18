# useAnchorQuote

Request [SEP-38](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0038.md)
indicative prices and firm quotes from an anchor.

## Import

```tsx
import { useAnchorQuote } from 'stellar-hooks'
```

## Usage

```tsx
const { quoteServer } = useAnchorInfo({ domain: 'testanchor.stellar.org' })
const { getPrice, getQuote, price, quote, isExpired, error } = useAnchorQuote({
  quoteServer,
  jwt, // from useWebAuth; only needed for firm quotes
})

// Indicative price: GET /price, no commitment
await getPrice({
  sellAsset: 'iso4217:USD',
  buyAsset: 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  sellAmount: '100',
  context: 'sep6',
})

// Firm quote: POST /quote, honoured until quote.expiresAt
await getQuote({ /* same fields */ })
```

## Options

| Option | Type | Description |
| --- | --- | --- |
| `quoteServer` | `string` | The anchor's `ANCHOR_QUOTE_SERVER`. |
| `jwt` | `string` | SEP-10 token. Required for `getQuote`. |

## Request parameters

`sellAsset` and `buyAsset` are SEP-38 asset identifiers
(`stellar:CODE:ISSUER` or `iso4217:USD`). Provide exactly one of `sellAmount`
and `buyAmount` as a positive decimal string, and a `context` of `sep6`,
`sep24` or `sep31`. Optional: `sellDeliveryMethod`, `buyDeliveryMethod`,
`countryCode`, and `expireAfter` (firm quotes only). Invalid input is rejected
before any request is sent.

## Returns

`getPrice`, `getQuote`, `price`, `quote`, `isLoading`, `error`, `reset`, and
`isExpired`, which becomes true when the latest firm quote's `expiresAt`
passes (it flips on a timer, with no polling).

Prices expose `totalPrice`, `price`, `sellAmount`, `buyAmount` and `fee`.
Quotes add `id`, `expiresAt`, `sellAsset` and `buyAsset`.

## Related

- [useAnchorInfo](/hooks/use-anchor-info)
- [useWebAuth](/hooks/use-web-auth)
