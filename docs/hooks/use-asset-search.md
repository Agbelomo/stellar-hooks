# useAssetSearch

Search StellarExpert for assets by code, across all issuers. Built for asset pickers.

## Import

```tsx
import { useAssetSearch } from 'stellar-hooks'
```

## Usage

```tsx
const { results, search, isLoading, error } = useAssetSearch({
  exactCode: true, // only assets whose code is exactly the query
  minRating: 5,    // hide poorly rated issuers
  limit: 50,
})

<input onChange={(e) => search(e.target.value)} />
{results.map((a) => <li key={a.asset}>{a.code} — {a.domain ?? a.issuer}</li>)}
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `debounceMs` | `number` | `300` | Debounce before a request is sent. |
| `enabled` | `boolean` | `true` | Set `false` to disable searching. |
| `network` | `"public" \| "testnet"` | `"public"` | StellarExpert network. |
| `limit` | `number` | API default | Records to request (clamped to 1-200). |
| `exactCode` | `boolean` | `false` | Keep only assets whose code equals the query (case-insensitive). |
| `minRating` | `number` | – | Drop assets with an average rating below this. |

## Returns

`results`, `isLoading`, `error`, `search(query)`, `lastFetchedAt`. A 429 response produces a `RateLimitedError`.

## Related

- [useAssets](/hooks/use-assets)
