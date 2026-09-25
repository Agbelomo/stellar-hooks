# Stellar Hooks Browser DevTools Extension Prototype

This browser extension adds a dedicated **"Stellar Hooks"** tab to browser Developer Tools (Chrome, Brave, Edge, Firefox), allowing developers to inspect active hook instances, query states, transactions, and errors in a React DevTools-style master-detail interface.

---

## Features

- **Active Hook Registry**: Automatically lists mounted hook instances (e.g. `useFreighter`, `useStellarAccount`, `useStellarBalance`, `useSorobanContract`, etc.).
- **Live Status Badges**: Shows lifecycle status (`idle`, `loading`, `success`, `error`) in real time.
- **Detailed Inspector Pane**: Inspects hook identity, error messages, and raw state JSON.
- **Search & Filter**: Filter hook instances by name, error, or status (`all`, `loading`, `success`, `error`, `idle`).
- **Copy Instance State**: One-click copy of instance JSON to clipboard.
- **Zero Config**: Seamlessly hooks into `StellarHooksProvider` and `useHookActivityDebug`.

---

## Installation & Testing

### Google Chrome / Brave / Microsoft Edge
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `devtools/extension` directory from this repository.
5. Open any web application using `stellar-hooks`.
6. Open Developer Tools (`F12` or `Ctrl+Shift+I` / `Cmd+Option+I`).
7. Switch to the **"Stellar Hooks"** panel tab.

### Mozilla Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `devtools/extension/manifest.json`.
4. Open Developer Tools on your test page and select the **"Stellar Hooks"** panel.

---

## Standalone In-App Usage

You can also use the DevTools panel directly within any React app without installing the extension by importing `<DevToolsPanel />`:

```tsx
import { DevToolsPanel } from "stellar-hooks";

function DebugDrawer() {
  return (
    <div style={{ height: 400 }}>
      <DevToolsPanel />
    </div>
  );
}
```
