import { extractPlainText, hasCopyableText } from "./extract-text.js";
import { extractMarkdown } from "./extract-markdown.js";
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

// The same error this many times within the window stops observing; anything less only skips that node.
const ERROR_REPEAT_LIMIT = 5;
const ERROR_REPEAT_WINDOW_MS = 2000;
// Refreshes that keep moving our own UI this often look like a fight with the page, so observing pauses.
const LOOP_LIMIT = 120;
const LOOP_WINDOW_MS = 2000;
const LOOP_PAUSE_MS = 2000;

function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function createController({
  adapter,
  document: doc,
  window: view,
  clipboard,
  getLanguage,
  getCopyFormat = () => "text",
  setCopyFormat = () => {},
  schedule = (callback) => {
    const raf = view.requestAnimationFrame;
    if (typeof raf === "function") raf.call(view, () => callback());
    else callback();
  }
}) {
  const copyUi = new Map();
  let pasteUi = null;
  let openMenuUi = null;
  let savedCaret = null;
  let observer = null;
  let parentObserver = null;
  let stopped = true;
  let scanCount = 0;
  let queued = false;
  let queue = [];
  let halted = false;
  let uiWrites = 0;
  let loopTimes = [];
  let pauseTimer = null;
  const failures = new Map();
  const cleanups = [];

  function now() {
    return typeof view.performance?.now === "function" ? view.performance.now() : Date.now();
  }

  // Describes where a failure happened by tag and ids only; message text never goes into the log.
  function describeNode(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element) return null;
    let message = null;
    try {
      message = adapter.messageFromNode(element);
    } catch {
      message = null;
    }
    return {
      tag: String(element.tagName || "").toLowerCase(),
      role: element.getAttribute?.("data-role") || null,
      inMessage: Boolean(message),
      messageId: message ? clip(message.getAttribute?.("data-message-id") || "", 64) || null : null,
      isMessage: Boolean(message && message === element)
    };
  }

  function reportFailure(stage, error, node) {
    const name = clip(error?.name || "Error", 40);
    const message = clip(error?.message, 300);
    console.error("[Dot Copy Paste]", stage, { name, message, stack: clip(error?.stack, 2000), node: describeNode(node) });
    const key = `${stage}|${name}|${message}`;
    const time = now();
    const recent = (failures.get(key) || []).filter((at) => time - at < ERROR_REPEAT_WINDOW_MS);
    recent.push(time);
    failures.set(key, recent);
    if (recent.length >= ERROR_REPEAT_LIMIT && !halted) {
      halted = true;
      disconnectObservers();
      console.error("[Dot Copy Paste]", "stopped", { reason: "repeated-error", stage, name, count: recent.length, windowMs: ERROR_REPEAT_WINDOW_MS });
    }
  }

  function guard(stage, node, work) {
    try {
      return work();
    } catch (error) {
      reportFailure(stage, error, node);
      return undefined;
    }
  }

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
      if (place.anchor.nextElementSibling !== wrap) {
        place.anchor.insertAdjacentElement("afterend", wrap);
        uiWrites += 1;
      }
      return;
    }
    if (wrap.parentElement !== place.anchor || place.anchor.lastElementChild !== wrap) {
      place.anchor.append(wrap);
      uiWrites += 1;
    }
  }

  function updatePositions() {
    for (const [message, ui] of copyUi) {
      guard("position", message, () => {
        if (!message.isConnected) {
          ui.wrap.remove();
          copyUi.delete(message);
          return;
        }
        const body = adapter.getBodyElement(message);
        if (body) placeCopySlot(ui.wrap, body);
      });
    }
    guard("paste-position", null, () => {
      const composer = adapter.getComposer(doc);
      if (pasteUi && composer?.element?.isConnected) place(pasteUi.wrap, composer.element, "above");
      if (pasteUi && !composer?.element?.isConnected) {
        pasteUi.wrap.remove();
        pasteUi = null;
      }
    });
  }

  function currentFormat() {
    return getCopyFormat() === "markdown" ? "markdown" : "text";
  }

  function applyCopyLabel(ui, state) {
    const { button, toggle, items } = ui;
    const markdown = currentFormat() === "markdown";
    toggle.textContent = "▾";
    toggle.setAttribute("aria-label", t("copyFormatMenu"));
    toggle.title = t("copyFormatMenu");
    for (const item of items) {
      item.textContent = t(item.dataset.dcpFormat === "markdown" ? "copyAsMarkdown" : "copyAsText");
      item.setAttribute("aria-checked", String(item.dataset.dcpFormat === currentFormat()));
    }
    if (state === "generating") {
      button.disabled = true;
      toggle.disabled = true;
      button.textContent = t(markdown ? "copyMarkdown" : "copy");
      button.setAttribute("aria-label", t("copyBusy"));
      if (openMenuUi === ui) closeMenu(ui, false);
      return;
    }
    button.disabled = false;
    toggle.disabled = false;
    const key = state === "unknown" ? (markdown ? "copyShownMarkdown" : "copyShown") : (markdown ? "copyMarkdown" : "copy");
    button.textContent = t(key);
    button.setAttribute("aria-label", t(key));
  }

  function refreshCopyLabels() {
    for (const [message, ui] of copyUi) applyCopyLabel(ui, adapter.getGenerationState(message));
  }

  async function onCopy(message, status, format) {
    const state = adapter.getGenerationState(message);
    if (state === "generating") return;
    const body = adapter.getBodyElement(message);
    const text = body ? (format === "markdown" ? extractMarkdown(body) : extractPlainText(body)) : "";
    if (!text) {
      setStatus(status, t("copyFailed"), "error");
      return;
    }
    const result = await writePlainText(text, clipboard, doc);
    setStatus(status, result.ok ? t("copied") : t("copyFailed"), result.ok ? "success" : "error");
  }

  function openMenu(ui) {
    if (openMenuUi && openMenuUi !== ui) closeMenu(openMenuUi, false);
    openMenuUi = ui;
    ui.menu.hidden = false;
    ui.toggle.setAttribute("aria-expanded", "true");
    const checked = ui.items.find((item) => item.dataset.dcpFormat === currentFormat()) || ui.items[0];
    checked.focus();
  }

  function closeMenu(ui, returnFocus) {
    ui.menu.hidden = true;
    ui.toggle.setAttribute("aria-expanded", "false");
    if (openMenuUi === ui) openMenuUi = null;
    if (returnFocus) ui.toggle.focus();
  }

  function onMenuKey(ui, event) {
    const index = ui.items.indexOf(doc.activeElement);
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move) {
      event.preventDefault();
      ui.items[(index + move + ui.items.length) % ui.items.length].focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      ui.items[event.key === "Home" ? 0 : ui.items.length - 1].focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(ui, true);
      return;
    }
    if (event.key === "Tab") closeMenu(ui, false);
  }

  function createCopyUi(message) {
    const wrap = doc.createElement("span");
    wrap.setAttribute("data-dcp-ui", "");
    wrap.className = "dcp-copy-slot";
    const split = doc.createElement("span");
    split.className = "dcp-split";
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "dcp-btn dcp-btn-main";
    button.setAttribute("data-dcp-copy", "");
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "dcp-btn dcp-btn-toggle";
    toggle.setAttribute("data-dcp-copy-menu", "");
    toggle.setAttribute("aria-haspopup", "menu");
    toggle.setAttribute("aria-expanded", "false");
    const menu = doc.createElement("span");
    menu.className = "dcp-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    const items = ["text", "markdown"].map((format) => {
      const item = doc.createElement("button");
      item.type = "button";
      item.className = "dcp-menu-item";
      item.setAttribute("role", "menuitemradio");
      item.dataset.dcpFormat = format;
      menu.append(item);
      return item;
    });
    const status = doc.createElement("span");
    status.setAttribute("data-dcp-ui", "");
    status.className = "dcp-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    split.append(button, toggle);
    wrap.append(split, menu, status);
    const ui = { wrap, button, toggle, menu, items, status };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onCopy(message, status, currentFormat());
    });
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (openMenuUi === ui) closeMenu(ui, true);
      else openMenu(ui);
    });
    toggle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" || openMenuUi === ui) return;
      event.preventDefault();
      openMenu(ui);
    });
    menu.addEventListener("keydown", (event) => onMenuKey(ui, event));
    for (const item of items) {
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const format = item.dataset.dcpFormat;
        closeMenu(ui, true);
        // Copy first so the clipboard write stays inside this click.
        onCopy(message, status, format);
        setCopyFormat(format);
        refreshCopyLabels();
      });
    }
    return ui;
  }

  function syncCopyButton(message) {
    if (!message || message.nodeType !== 1) return;
    if (adapter.hasNativeCopy(message) === true || !adapter.getBodyElement(message) || !hasCopyableText(adapter.getBodyElement(message))) {
      const existing = copyUi.get(message);
      if (existing) {
        existing.wrap.remove();
        copyUi.delete(message);
        uiWrites += 1;
      }
      return;
    }
    let ui = copyUi.get(message);
    if (!ui) {
      ui = createCopyUi(message);
      copyUi.set(message, ui);
    }
    const body = adapter.getBodyElement(message);
    if (body) placeCopySlot(ui.wrap, body);
    applyCopyLabel(ui, adapter.getGenerationState(message));
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

  // A failure on one node skips only that node; see reportFailure for when observing stops.
  function refreshNodes(nodes) {
    scanCount += 1;
    const writesBefore = uiWrites;
    const seen = new Set();
    for (const node of nodes) {
      guard("scan", node, () => {
        const element = relevantElement(node);
        if (!element) return;
        const host = adapter.messageFromNode(element);
        if (host) seen.add(host);
        for (const message of adapter.messagesIn(element)) seen.add(message);
      });
    }
    for (const message of seen) guard("copy-button", message, () => syncCopyButton(message));
    guard("paste-button", null, () => syncPasteButton());
    updatePositions();
    return uiWrites !== writesBefore;
  }

  function pauseForLoop() {
    disconnectObservers();
    console.error("[Dot Copy Paste]", "paused", { reason: "observer-loop", refreshes: loopTimes.length, windowMs: LOOP_WINDOW_MS, pauseMs: LOOP_PAUSE_MS });
    loopTimes = [];
    pauseTimer = view.setTimeout(() => {
      pauseTimer = null;
      if (stopped || halted) return;
      connectObserver();
      const root = adapter.getObserverRoot(doc);
      if (root) queueRefresh([root]);
    }, LOOP_PAUSE_MS);
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
      if (stopped || halted || pauseTimer) return;
      const wrote = guard("refresh", null, () => refreshNodes(batch));
      if (!wrote) return;
      const time = now();
      loopTimes = loopTimes.filter((at) => time - at < LOOP_WINDOW_MS);
      loopTimes.push(time);
      if (loopTimes.length > LOOP_LIMIT) pauseForLoop();
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
    on(doc, "pointerdown", (event) => {
      if (openMenuUi && !openMenuUi.wrap.contains(event.target)) closeMenu(openMenuUi, false);
    }, true);
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
    openMenuUi = null;
    savedCaret = null;
    queue = [];
    queued = false;
    halted = false;
    failures.clear();
    loopTimes = [];
    if (pauseTimer) view.clearTimeout(pauseTimer);
    pauseTimer = null;
    removeStaleUi(doc);
    scanCount = 0;
  }

  return {
    start,
    stop,
    refreshCopyLabels,
    get scanCount() {
      return scanCount;
    },
    get stopped() {
      return stopped;
    }
  };
}
