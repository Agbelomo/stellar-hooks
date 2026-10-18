import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// The Stellar SDK and passkey helpers use Node's Buffer API.
(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
