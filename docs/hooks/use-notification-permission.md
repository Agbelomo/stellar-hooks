# useNotificationPermission

Wrap the browser Notification permission flow with an explicit
`granted` / `denied` / `default` state (or `unsupported`).

## Import

```tsx
import { useNotificationPermission } from 'stellar-hooks'
```

## Usage

```tsx
const { isGranted, isDenied, isUnsupported, isRequesting, request } =
  useNotificationPermission()

if (isUnsupported) return null
if (isGranted) return <span>Alerts are on</span>

return (
  <button onClick={request} disabled={isRequesting || isDenied}>
    {isDenied ? 'Alerts are blocked in browser settings' : 'Turn on alerts'}
  </button>
)
```

Call `request` from a click handler: browsers ignore prompts without a user
gesture and Safari rejects them.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `requestOnMount` | `boolean` | `false` | Ask as soon as the hook mounts (usually dismissed by browsers). |
| `onPermissionChange` | `(state) => void` | – | Called after a request settles. |

## Returns

`permission`, `isGranted`, `isDenied`, `isDefault`, `isUnsupported`,
`isRequesting`, `error`, `request()`.
