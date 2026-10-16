/**
 * Content script bridging page window.__STELLAR_HOOKS_DEVTOOLS__ events to extension background.
 */
window.addEventListener("message", function (event) {
  if (
    event.source === window &&
    event.data &&
    event.data.source === "stellar-hooks-devtools" &&
    event.data.type === "HOOK_ACTIVITY_UPDATE"
  ) {
    try {
      chrome.runtime.sendMessage({
        source: "stellar-hooks-content-script",
        type: "HOOK_ACTIVITY_UPDATE",
        payload: event.data.payload,
      });
    } catch {
      // Extension context invalidated or not connected
    }
  }
});
