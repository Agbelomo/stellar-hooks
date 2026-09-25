/**
 * Creates the "Stellar Hooks" panel in the browser DevTools window.
 */
chrome.devtools.panels.create(
  "Stellar Hooks",
  "icons/icon16.png",
  "panel.html",
  function (panel) {
    // Panel created callback
    panel.onShown.addListener(function (panelWindow) {
      // Trigger update when panel is opened
      chrome.devtools.inspectedWindow.eval(
        "window.__STELLAR_HOOKS_DEVTOOLS__ && window.__STELLAR_HOOKS_DEVTOOLS__.getHookInstances()",
        function (result, isException) {
          if (!isException && result && panelWindow.__updateDevToolsPanel) {
            panelWindow.__updateDevToolsPanel(result);
          }
        }
      );
    });
  }
);
