import { extractPlainText, hasCopyableText } from "./extract-text.js";
import { insertPlainText, isEditorEmpty, readContentEditableCaret, readTextareaCaret } from "./insert-text.js";
import { readPlainText, writePlainText } from "./clipboard.js";
import { computeAnchorPosition, findCopyAnchor } from "./position.js";
import { createTranslator } from "./i18n.js";

function relevantElement(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  if (!element || element.closest?.("[data-dcp-ui]")) return null;
  return element;
}

function removeStaleUi(doc) {
  doc.querySelectorAll("[data-dcp-ui]").forEach((node) => node.remove());
}

export function createController({
  adapter,
  document: doc,
  window: view,
  clipboard,
  getLanguage,
  schedule = (callback) => {
    const raf = view.requestAnimationFrame;
    if (typeof raf === "function") raf.call(view, () => callback());
    else callback();
  }
}) {
  const copyUi = new Map();
  let pasteUi = null;
  let savedCaret = null;
  let observer = null;
  let parentObserver = null;
  let stopped = true;
  let scanCount = 0;
  let queued = false;
  let queue = [];
  const cleanups = [];

  function t(key) {
    return createTranslator(getLanguage())(key);
  }

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function rememberCaret() {
    const composer = adapter.getComposer(doc);
    if (!composer) return;
    if (composer.kind === "textarea") {
      const caret = readTextareaCaret(composer.element, doc);
      if (caret) savedCaret = caret;
      return;
    }
    if (composer.kind === "contenteditable") {
      const caret = readContentEditableCaret(composer.element, doc);
      if (caret) savedCaret = caret;
    }
  }

  function setStatus(status, message, state) {
    status.textContent = message;
    status.dataset.dcpState = state;
    if (status._timer) view.clearTimeout(status._timer);
    const delay = state === "success" ? 2000 : 10000;
    status._timer = view.setTimeout(() => {
      if (status.dataset.dcpState === state) {
        status.textContent = "";
        delete status.dataset.dcpState;
      }
    }, delay);
  }

  function place(wrap, anchor, placement) {
    const rect = anchor.getBoundingClientRect();
    const width = wrap.offsetWidth || wrap.getBoundingClientRect().width || 96;
    const height = wrap.offsetHeight || wrap.getBoundingClientRect().height || 32;
    const position = computeAnchorPosition({
      anchor: rect,
      width,
      height,
      viewportWidth: view.innerWidth || 1024,
      viewportHeight: view.innerHeight || 768,
      placement
    });
    if (position.hidden) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    wrap.style.top = `${position.top}px`;
    wrap.style.left = `${position.left}px`;
  }

  function placeCopySlot(wrap, body) {
    const place = findCopyAnchor(body);
    if (!place?.anchor?.isConnected) return;
    wrap.dataset.dcpPlacement = place.mode === "below" ? "below" : "inline";
    if (place.mode === "below") {
      if (place.anchor.nextElementSibling !== wrap) place.anchor.insertAdjacentElement("afterend", wrap);
      return;
    }
    if (wrap.parentElement !== place.anchor || place.anchor.lastElementChild !== wrap) place.anchor.append(wrap);
  }

  function updatePositions() {
    for (const [message, ui] of copyUi) {
      if (!message.isConnected) {
        ui.wrap.remove();
        copyUi.delete(message);
        continue;
      }
      const body = adapter.getBodyElement(message);
      if (body) placeCopySlot(ui.wrap, body);
    }
    const composer = adapter.getComposer(doc);
    if (pasteUi && composer?.element?.isConnected) place(pasteUi.wrap, composer.element, "above");
    if (pasteUi && !composer?.element?.isConnected) {
      pasteUi.wrap.remove();
      pasteUi = null;
    }
  }

  function applyCopyLabel(button, state) {
    if (state === "generating") {
      button.disabled = true;
      button.textContent = t("copy");
      button.setAttribute("aria-label", t("copyBusy"));
      return;
    }
    button.disabled = false;
    if (state === "unknown") {
      button.textContent = t("copyShown");
      button.setAttribute("aria-label", t("copyShown"));
      return;
    }
    button.textContent = t("copy");
    button.setAttribute("aria-label", t("copy"));
  }

  async function onCopy(message, status) {
    const state = adapter.getGenerationState(message);
    if (state === "generating") return;
    const body = adapter.getBodyElement(message);
    const text = body ? extractPlainText(body) : "";
    if (!text) {
      setStatus(status, t("copyFailed"), "error");
      return;
    }
    const result = await writePlainText(text, clipboard, doc);
    setStatus(status, result.ok ? t("copied") : t("copyFailed"), result.ok ? "success" : "error");
  }

  function syncCopyButton(message) {
    if (!message || message.nodeType !== 1) return;
    if (adapter.hasNativeCopy(message) === true || !adapter.getBodyElement(message) || !hasCopyableText(adapter.getBodyElement(message))) {
      const existing = copyUi.get(message);
      if (existing) {
        existing.wrap.remove();
        copyUi.delete(message);
      }
      return;
    }
    let ui = copyUi.get(message);
    if (!ui) {
      const wrap = doc.createElement("span");
      wrap.setAttribute("data-dcp-ui", "");
      wrap.className = "dcp-copy-slot";
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "dcp-btn";
      button.setAttribute("data-dcp-copy", "");
      const status = doc.createElement("span");
      status.setAttribute("data-dcp-ui", "");
      status.className = "dcp-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      wrap.append(button, status);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onCopy(message, status);
      });
      ui = { wrap, button, status };
      copyUi.set(message, ui);
    }
    const body = adapter.getBodyElement(message);
    if (body) placeCopySlot(ui.wrap, body);
    applyCopyLabel(ui.button, adapter.getGenerationState(message));
  }

  async function onPaste(status) {
    const composer = adapter.getComposer(doc);
    if (!composer || (composer.kind !== "textarea" && composer.kind !== "contenteditable") || !composer.element?.isConnected) {
      setStatus(status, t("composerMissing"), "error");
      return;
    }
    const reading = await readPlainText(clipboard, doc);
    if (!reading.ok) {
      const key = reading.reason === "empty" ? "clipboardEmpty" : "clipboardDenied";
      setStatus(status, t(key), "error");
      return;
    }
    const current = adapter.getComposer(doc);
    if (!current || current.element !== composer.element || !current.element.isConnected) {
      setStatus(status, t("composerMissing"), "error");
      return;
    }
    const caret = isEditorEmpty(current) ? null : savedCaret;
    const beforeDraft = typeof adapter.composerHasDraft === "function" ? adapter.composerHasDraft(current.element) : null;
    const beforeValue = current.kind === "textarea" ? current.element.value : current.element.textContent || "";
    const inserted = insertPlainText(current, reading.text, caret, doc);
    if (!inserted.ok) {
      setStatus(status, t(inserted.reason === "cancelled" ? "insertRejected" : "composerMissing"), "error");
      return;
    }
    if (beforeDraft === false) {
      await new Promise((resolve) => {
        const view = doc.defaultView;
        if (typeof view?.requestAnimationFrame === "function") view.requestAnimationFrame(() => resolve());
        else resolve();
      });
      if (current.element.isConnected && adapter.composerHasDraft(current.element) === false) {
        if (current.kind === "textarea") current.element.value = beforeValue;
        else current.element.textContent = beforeValue;
        setStatus(status, t("insertRejected"), "error");
        return;
      }
    }
    setStatus(status, t("pasted"), "success");
  }

  function syncPasteButton() {
    const composer = adapter.getComposer(doc);
    if (!composer || (composer.kind !== "textarea" && composer.kind !== "contenteditable") || !composer.element?.isConnected) {
      if (pasteUi) {
        pasteUi.wrap.remove();
        pasteUi = null;
      }
      return;
    }
    if (!pasteUi) {
      const wrap = doc.createElement("div");
      wrap.setAttribute("data-dcp-ui", "");
      wrap.className = "dcp-anchor";
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "dcp-btn";
      button.setAttribute("data-dcp-paste", "");
      const status = doc.createElement("p");
      status.setAttribute("data-dcp-ui", "");
      status.className = "dcp-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      wrap.append(button, status);
      doc.body.append(wrap);
      button.addEventListener("pointerdown", () => rememberCaret());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onPaste(status);
      });
      pasteUi = { wrap, button, status };
    }
    pasteUi.button.textContent = t("paste");
    pasteUi.button.setAttribute("aria-label", t("paste"));
  }

  function refreshNodes(nodes) {
    scanCount += 1;
    if (scanCount > 40) throw new Error("observer loop");
    const seen = new Set();
    for (const node of nodes) {
      const element = relevantElement(node);
      if (!element) continue;
      const host = adapter.messageFromNode(element);
      if (host) seen.add(host);
      for (const message of adapter.messagesIn(element)) seen.add(message);
    }
    for (const message of seen) syncCopyButton(message);
    syncPasteButton();
    updatePositions();
  }

  function queueRefresh(nodes) {
    const pending = nodes.filter(Boolean);
    if (pending.length === 0) return;
    queue.push(...pending);
    if (queued) return;
    queued = true;
    schedule(() => {
      const batch = queue;
      queue = [];
      queued = false;
      try {
        refreshNodes(batch);
      } catch (error) {
        disconnectObservers();
        const name = error && error.message === "observer loop" ? "observer-loop" : error?.name || "Error";
        console.error("[Dot Copy Paste]", name);
      }
    });
  }

  function mutationNodes(mutations) {
    const nodes = [];
    for (const mutation of mutations) {
      const target = relevantElement(mutation.target);
      if (!target) continue;
      if (mutation.type === "characterData") nodes.push(target);
      for (const node of mutation.addedNodes) {
        if (relevantElement(node)) nodes.push(node);
      }
      if (mutation.removedNodes.length > 0) nodes.push(target);
    }
    return nodes;
  }

  function connectObserver() {
    const root = adapter.getObserverRoot(doc);
    if (!root || typeof view.MutationObserver !== "function") return;
    observer = new view.MutationObserver((mutations) => {
      queueRefresh(mutationNodes(mutations));
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    const parent = root.parentElement;
    if (parent) {
      parentObserver = new view.MutationObserver(() => {
        if (root.isConnected) return;
        disconnectObservers();
        const nextRoot = adapter.getObserverRoot(doc);
        if (!nextRoot) return;
        connectObserver();
        queueRefresh([nextRoot]);
      });
      parentObserver.observe(parent, { childList: true });
    }
  }

  function disconnectObservers() {
    observer?.disconnect();
    parentObserver?.disconnect();
    observer = null;
    parentObserver = null;
  }

  function start() {
    stop();
    const detection = adapter.detect(doc);
    if (!detection?.active) return { active: false, reason: detection?.reason || "inactive" };
    stopped = false;
    const root = adapter.getObserverRoot(doc);
    if (root) queueRefresh([root]);
    syncPasteButton();
    connectObserver();
    on(doc, "selectionchange", rememberCaret, true);
    on(doc, "keyup", rememberCaret, true);
    on(doc, "mouseup", rememberCaret, true);
    on(doc, "scroll", () => updatePositions(), { capture: true, passive: true });
    on(view, "resize", () => updatePositions());
    return { active: true, reason: detection.reason };
  }

  function stop() {
    stopped = true;
    disconnectObservers();
    while (cleanups.length) cleanups.pop()();
    for (const ui of copyUi.values()) ui.wrap.remove();
    copyUi.clear();
    pasteUi?.wrap.remove();
    pasteUi = null;
    savedCaret = null;
    queue = [];
    queued = false;
    removeStaleUi(doc);
    scanCount = 0;
  }

  return {
    start,
    stop,
    get scanCount() {
      return scanCount;
    },
    get stopped() {
      return stopped;
    }
  };
}
