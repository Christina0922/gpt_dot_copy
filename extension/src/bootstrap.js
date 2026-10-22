import { createController } from "./controller.js";
import { liveAdapter } from "./live-adapter.js";
import { normalizeSettings, readStoredSettings, saveSettings } from "./settings.js";
import { resolveLanguage } from "./i18n.js";

// When a page is still waiting for the Dot landmarks, a line is logged at each of these times.
const STILL_WAITING_MS = [3000, 10000, 30000];

export function startApp({
  chrome,
  window: view,
  document: doc,
  adapter = liveAdapter,
  clipboard = view.navigator.clipboard,
  build = "dev"
}) {
  let controller = null;
  let settings = normalizeSettings(null);
  let storedSettings = null;
  let generation = 0;
  const version = chrome.runtime?.getManifest?.()?.version || "unknown";

  function log(event, detail) {
    console.warn("[Dot Copy Paste]", event, { version, build, ...detail });
  }

  function setCopyFormat(copyFormat) {
    settings = { ...settings, copyFormat };
    const storage = chrome.storage?.local;
    if (!storage || typeof storage.set !== "function") return;
    saveSettings(storage, settings).catch((error) => {
      console.error("[Dot Copy Paste]", error?.name || "Error");
    });
  }

  function startController() {
    const result = controller.start();
    if (result.active) {
      const waitedMs = waitStartedAt === null ? 0 : Math.round(now() - waitStartedAt);
      stopWatching();
      waitStartedAt = null;
      console.info("[Dot Copy Paste]", "started", {
        version,
        build,
        reason: result.reason,
        language: resolveLanguage(settings.language),
        storedSettings,
        waitedMs
      });
    } else if (result.reason === "dot-landmarks-missing") {
      if (!landmarkObserver) {
        waitStartedAt = now();
        log("waiting", { reason: result.reason, missing: missingLandmarks() });
        watchForDotLandmarks();
      }
    } else {
      stopWatching();
      waitStartedAt = null;
    }
    return result;
  }

  function now() {
    return typeof view.performance?.now === "function" ? view.performance.now() : Date.now();
  }

  function missingLandmarks() {
    try {
      return adapter.detect(doc).missing || [];
    } catch {
      return ["detect-failed"];
    }
  }

  async function restart(reason) {
    // Navigation events can fire back to back; only the newest restart may create a controller.
    const current = ++generation;
    stopWatching();
    controller?.stop(reason);
    controller = null;
    const stored = await readStoredSettings(chrome.storage?.local);
    if (current !== generation) return { active: false, reason: "superseded" };
    storedSettings = stored;
    settings = normalizeSettings(stored);
    if (!settings.enabled) {
      doc.querySelectorAll("[data-dcp-ui]").forEach((node) => node.remove());
      log("stopped", { reason: "disabled" });
      return { active: false, reason: "disabled" };
    }
    controller = createController({
      adapter,
      document: doc,
      window: view,
      clipboard,
      getLanguage: () => resolveLanguage(settings.language),
      getCopyFormat: () => settings.copyFormat,
      setCopyFormat
    });
    return startController();
  }

  let landmarkObserver = null;
  let landmarkPending = false;
  let waitStartedAt = null;
  let waitTimers = [];

  function stopWatching() {
    landmarkObserver?.disconnect();
    landmarkObserver = null;
    landmarkPending = false;
    waitTimers.forEach((timer) => view.clearTimeout(timer));
    waitTimers = [];
  }

  function watchForDotLandmarks() {
    stopWatching();
    const root = doc.documentElement;
    if (!root || typeof view.MutationObserver !== "function") return;
    landmarkObserver = new view.MutationObserver(() => {
      if (landmarkPending || !landmarkObserver) return;
      landmarkPending = true;
      // Next frame, or a timer when frames do not run (background tab).
      let done = false;
      const check = () => {
        if (done) return;
        done = true;
        view.clearTimeout(timer);
        landmarkPending = false;
        if (!landmarkObserver || !controller || !adapter.detect(doc).active) return;
        startController();
      };
      const timer = view.setTimeout(check, 500);
      if (typeof view.requestAnimationFrame === "function") view.requestAnimationFrame(check);
    });
    // Attributes too: the composer can turn editable after it is inserted, which adds no child nodes.
    landmarkObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["contenteditable", "role", "data-role"]
    });
    // A page that never shows the landmarks stays waiting; these lines say what is still missing.
    waitTimers = STILL_WAITING_MS.map((delay) => view.setTimeout(() => {
      if (!landmarkObserver) return;
      const detection = adapter.detect(doc);
      if (detection.active) {
        startController();
        return;
      }
      log("still-waiting", { reason: detection.reason, missing: detection.missing || [], waitedMs: delay, path: doc.location?.pathname || "" });
    }, delay));
  }

  chrome.storage?.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    const next = normalizeSettings(changes.settings.newValue);
    // A format change alone only relabels the buttons, so a "Copied" status is not wiped by a restart.
    if (controller && next.enabled === settings.enabled && next.language === settings.language) {
      settings = next;
      controller.refreshCopyLabels();
      return;
    }
    restart("settings");
  });

  if (view.navigation && typeof view.navigation.addEventListener === "function") {
    view.navigation.addEventListener("navigatesuccess", () => restart("navigation"));
  }
  view.addEventListener("popstate", () => restart("navigation"));
  view.addEventListener("pagehide", () => {
    stopWatching();
    controller?.stop("pagehide");
  });

  return restart("load");
}
