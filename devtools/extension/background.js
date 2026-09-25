/**
 * Background service worker managing DevTools connections and relaying messages.
 */
const ports = new Map();

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name.startsWith("stellar-hooks-panel-")) {
    const tabId = parseInt(port.name.replace("stellar-hooks-panel-", ""), 10);
    ports.set(tabId, port);

    port.onDisconnect.addListener(function () {
      ports.delete(tabId);
    });
  }
});

chrome.runtime.onMessage.addListener(function (message, sender) {
  if (message.source === "stellar-hooks-content-script" && sender.tab && sender.tab.id) {
    const panelPort = ports.get(sender.tab.id);
    if (panelPort) {
      panelPort.postMessage(message);
    }
  }
});
