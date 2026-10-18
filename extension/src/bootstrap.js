import { createController } from "./controller.js";
import { liveAdapter } from "./live-adapter.js";
import { loadSettings } from "./settings.js";
import { resolveLanguage } from "./i18n.js";

export function startApp({
  chrome,
  window: view,
  document: doc,
  adapter = liveAdapter,
  clipboard = view.navigator.clipboard
}) {
  let controller = null;
  let settings = { enabled: true, language: "auto" };

  async function restart() {
    stopWatching();
    controller?.stop();
    controller = null;
    settings = await loadSettings(chrome.storage?.local);
    if (!settings.enabled) {
      stopWatching();
      doc.querySelectorAll("[data-dcp-ui]").forEach((node) => node.remove());
      return { active: false, reason: "disabled" };
    }
    const uiLanguage = chrome.i18n?.getUILanguage?.() || view.navigator.language || "en";
    controller = createController({
      adapter,
      document: doc,
      window: view,
      clipboard,
      getLanguage: () => resolveLanguage(settings.language, uiLanguage)
    });
    const result = controller.start();
    if (!result.active && result.reason === "dot-landmarks-missing") watchForDotLandmarks();
    else stopWatching();
    return result;
  }

  let landmarkObserver = null;
  let landmarkPending = false;

  function stopWatching() {
    landmarkObserver?.disconnect();
    landmarkObserver = null;
    landmarkPending = false;
  }

  function watchForDotLandmarks() {
    stopWatching();
    const root = doc.documentElement;
    if (!root || typeof view.MutationObserver !== "function") return;
    landmarkObserver = new view.MutationObserver(() => {
      if (landmarkPending || !landmarkObserver) return;
      landmarkPending = true;
      const schedule = typeof view.requestAnimationFrame === "function"
        ? view.requestAnimationFrame.bind(view)
        : (callback) => callback();
      schedule(() => {
        landmarkPending = false;
        if (!landmarkObserver || !adapter.detect(doc).active) return;
        stopWatching();
        controller?.start();
      });
    });
    landmarkObserver.observe(root, { childList: true, subtree: true });
  }

  chrome.storage?.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) restart();
  });

  if (view.navigation && typeof view.navigation.addEventListener === "function") {
    view.navigation.addEventListener("navigatesuccess", () => restart());
  }
  view.addEventListener("popstate", () => restart());
  view.addEventListener("pagehide", () => {
    stopWatching();
    controller?.stop();
  });

  return restart();
}
