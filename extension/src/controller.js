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
const FRAME_FALLBACK_MS = 500;

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
  schedule = (callback) => {
    const raf = view.requestAnimationFrame;
    if (typeof raf !== "function") {
      callback();
      return;
    }
    // Animation frames do not run in a background tab, so a timer runs the refresh if no frame comes.
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      view.clearTimeout(timer);
      callback();
    };
    const timer = view.setTimeout(run, FRAME_FALLBACK_MS);
    raf.call(view, run);
  }
}) {
  const copyUi = new Map();
  let pasteUi = null;
  let savedCaret = null;
  let observer = null;
  let rootWatcher = null;
  let observedRoot = null;
  let waitingForRoot = false;
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

  // Every stop, pause, and resume of observing prints exactly one line.
  function logLifecycle(event, detail) {
    console.warn("[Dot Copy Paste]", event, detail);
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

  // After the message body, in normal flow. A paragraph shares its last line; a block ending sits underneath.
  function placeCopySlot(ui, message) {
    const body = adapter.getBodyElement(message);
    if (!body) return;
    const target = findCopyAnchor(body);
    if (!target?.anchor) return;
    const { wrap } = ui;
    wrap.dataset.dcpPlacement = target.mode;
    if (target.mode === "below") {
      const placed = wrap.parentElement === target.anchor.parentElement && target.anchor.nextElementSibling === wrap;
      if (placed) return;
      target.anchor.insertAdjacentElement("afterend", wrap);
      uiWrites += 1;
      return;
    }
    if (wrap.parentElement === target.anchor && target.anchor.lastElementChild === wrap) return;
    target.anchor.append(wrap);
    uiWrites += 1;
  }

  function updatePositions() {
    for (const [message, ui] of copyUi) {
      guard("position", message, () => {
        if (!message.isConnected) {
          ui.wrap.remove();
          copyUi.delete(message);
          return;
        }
        placeCopySlot(ui, message);
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

  function copyLabels(state) {
    if (state === "generating") {
      return { text: t("copyBusy"), markdown: t("copyBusy") };
    }
    if (state !== "complete") {
      return { text: t("copyVisible"), markdown: t("copyVisibleMarkdown") };
    }
    return { text: t("copy"), markdown: t("copyAsMarkdown") };
  }

  function applyCopyLabel(ui, state) {
    const busy = state === "generating";
    const labels = copyLabels(state);
    const failed = ui.buttons.text.dataset.dcpResult === "error" || ui.buttons.markdown.dataset.dcpResult === "error";
    ui.buttons.text.disabled = busy;
    ui.buttons.text.textContent = labels.text;
    ui.buttons.text.setAttribute("aria-label", labels.text);
    ui.buttons.text.title = !busy && failed ? t("copyFailed") : labels.text;
    ui.menuButton.disabled = busy;
    ui.menuButton.setAttribute("aria-label", labels.markdown);
    ui.menuButton.title = !busy && failed ? t("copyFailed") : labels.markdown;
    ui.buttons.markdown.disabled = busy;
    ui.buttons.markdown.textContent = labels.markdown;
    ui.buttons.markdown.setAttribute("aria-label", labels.markdown);
    ui.buttons.markdown.title = labels.markdown;
  }

  function closeMenu(ui, returnFocus) {
    if (!ui || ui.menu.hidden) return;
    ui.menu.hidden = true;
    ui.menuButton.setAttribute("aria-expanded", "false");
    if (returnFocus) ui.menuButton.focus();
  }

  function openMenu(ui) {
    if (ui.menuButton.disabled) return;
    ui.menu.hidden = false;
    ui.menuButton.setAttribute("aria-expanded", "true");
    ui.buttons.markdown.focus();
  }

  function flashResult(ui, ok) {
    const button = ui.buttons.text;
    if (button._timer) view.clearTimeout(button._timer);
    button.dataset.dcpResult = ok ? "success" : "error";
    applyCopyLabel(ui, adapter.getGenerationState(ui.message));
    button._timer = view.setTimeout(() => {
      button._timer = null;
      delete button.dataset.dcpResult;
      delete ui.buttons.markdown.dataset.dcpResult;
      if (button.isConnected) applyCopyLabel(ui, adapter.getGenerationState(ui.message));
    }, ok ? 2000 : 10000);
  }

  async function onCopy(message, ui, format) {
    const state = adapter.getGenerationState(message);
    if (state === "generating") return;
    const body = adapter.getBodyElement(message);
    const text = body ? (format === "markdown" ? extractMarkdown(body) : extractPlainText(body)) : "";
    closeMenu(ui, false);
    const result = text ? await writePlainText(text, clipboard, doc) : { ok: false };
    setStatus(ui.status, result.ok ? t("copied") : t("copyFailed"), result.ok ? "success" : "error");
    flashResult(ui, result.ok);
  }

  function createCopyUi(message) {
    const wrap = doc.createElement("span");
    wrap.setAttribute("data-dcp-ui", "");
    wrap.className = "dcp-copy-slot";
    const textButton = doc.createElement("button");
    textButton.type = "button";
    textButton.className = "dcp-btn";
    textButton.setAttribute("data-dcp-copy", "text");
    const menuButton = doc.createElement("button");
    menuButton.type = "button";
    menuButton.className = "dcp-menu-btn";
    menuButton.textContent = "MD";
    menuButton.setAttribute("aria-haspopup", "menu");
    menuButton.setAttribute("aria-expanded", "false");
    const menu = doc.createElement("span");
    menu.className = "dcp-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    const markdownButton = doc.createElement("button");
    markdownButton.type = "button";
    markdownButton.className = "dcp-btn";
    markdownButton.setAttribute("role", "menuitem");
    markdownButton.setAttribute("data-dcp-copy", "markdown");
    menu.append(markdownButton);
    const status = doc.createElement("span");
    status.setAttribute("data-dcp-ui", "");
    status.className = "dcp-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    wrap.append(textButton, menuButton, menu, status);
    const buttons = { text: textButton, markdown: markdownButton };
    const ui = { message, wrap, buttons, menuButton, menu, status };
    textButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onCopy(message, ui, "text");
    });
    menuButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (menu.hidden) openMenu(ui);
      else closeMenu(ui, false);
    });
    menuButton.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      openMenu(ui);
    });
    markdownButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onCopy(message, ui, "markdown");
    });
    markdownButton.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu(ui, true);
    });
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
    const author = typeof adapter.getAuthor === "function" ? adapter.getAuthor(message) : "unknown";
    if (ui.wrap.dataset.dcpAuthor !== author) ui.wrap.dataset.dcpAuthor = author;
    placeCopySlot(ui, message);
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
      restoreComposer(current, beforeValue, caret);
      setStatus(status, t(inserted.reason === "cancelled" ? "insertRejected" : "composerMissing"), "error");
      return;
    }
    if (current.kind === "contenteditable" || beforeDraft === false) {
      await nextFrame();
      const draft = current.element.isConnected && typeof adapter.composerHasDraft === "function"
        ? adapter.composerHasDraft(current.element)
        : null;
      const after = current.kind === "textarea" ? current.element.value : (current.element.textContent || "");
      const stayed = after !== beforeValue;
      const accepted = current.kind === "textarea"
        ? stayed && (beforeDraft !== false || draft !== false)
        : stayed && (beforeDraft !== false || draft === true);
      if (!accepted) {
        restoreComposer(current, beforeValue, caret);
        setStatus(status, t("insertRejected"), "error");
        return;
      }
    }
    setStatus(status, t("pasted"), "success");
  }

  function nextFrame() {
    return new Promise((resolve) => {
      const host = doc.defaultView;
      if (typeof host?.requestAnimationFrame === "function") host.requestAnimationFrame(() => resolve());
      else resolve();
    });
  }

  function restoreComposer(current, beforeValue, caret) {
    if (!current.element?.isConnected) return;
    if (current.kind === "textarea") {
      current.element.value = beforeValue;
      if (caret?.kind === "textarea" && Number.isInteger(caret.start) && Number.isInteger(caret.end)) {
        const start = Math.min(caret.start, beforeValue.length);
        const end = Math.min(Math.max(caret.end, caret.start), beforeValue.length);
        current.element.focus();
        current.element.setSelectionRange(start, end);
      }
      return;
    }
    current.element.textContent = beforeValue;
    current.element.focus();
    const selection = doc.getSelection?.();
    if (!selection) return;
    const range = doc.createRange();
    range.selectNodeContents(current.element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
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
    logLifecycle("paused", { reason: "observer-loop", refreshes: loopTimes.length, windowMs: LOOP_WINDOW_MS, pauseMs: LOOP_PAUSE_MS });
    loopTimes = [];
    pauseTimer = view.setTimeout(() => {
      pauseTimer = null;
      if (stopped || halted) return;
      connectObservers();
      logLifecycle("resumed", { reason: "observer-loop-pause-ended" });
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

  function connectRootObserver() {
    observer?.disconnect();
    observer = null;
    observedRoot = adapter.getObserverRoot(doc);
    if (!observedRoot) return false;
    observer = new view.MutationObserver((mutations) => {
      queueRefresh(mutationNodes(mutations));
    });
    observer.observe(observedRoot, { childList: true, subtree: true, characterData: true });
    return true;
  }

  // The page can replace the message list or any ancestor of it; the old root then goes quiet.
  // This document-wide watcher only checks whether the observed root is still attached.
  function checkObservedRoot() {
    if (stopped || halted || pauseTimer) return;
    if (observedRoot?.isConnected && !waitingForRoot) return;
    if (!waitingForRoot) {
      waitingForRoot = true;
      observer?.disconnect();
      observer = null;
      logLifecycle("paused", { reason: "message-list-removed" });
    }
    if (!connectRootObserver()) return;
    waitingForRoot = false;
    logLifecycle("resumed", { reason: "message-list-found" });
    queueRefresh([observedRoot]);
  }

  function connectObservers() {
    if (typeof view.MutationObserver !== "function") return;
    connectRootObserver();
    const documentRoot = doc.documentElement;
    if (!documentRoot) return;
    rootWatcher = new view.MutationObserver(() => checkObservedRoot());
    rootWatcher.observe(documentRoot, { childList: true, subtree: true });
  }

  function disconnectObservers() {
    observer?.disconnect();
    rootWatcher?.disconnect();
    observer = null;
    rootWatcher = null;
  }

  function start() {
    stop("restart");
    const detection = adapter.detect(doc);
    if (!detection?.active) return { active: false, reason: detection?.reason || "inactive" };
    stopped = false;
    const root = adapter.getObserverRoot(doc);
    if (root) queueRefresh([root]);
    guard("paste-button", null, () => syncPasteButton());
    connectObservers();
    on(doc, "click", (event) => {
      for (const ui of copyUi.values()) {
        if (!ui.wrap.contains(event.target)) closeMenu(ui, false);
      }
    }, true);
    on(doc, "selectionchange", rememberCaret, true);
    on(doc, "keyup", rememberCaret, true);
    on(doc, "mouseup", rememberCaret, true);
    on(doc, "scroll", () => updatePositions(), { capture: true, passive: true });
    on(view, "resize", () => updatePositions());
    return { active: true, reason: detection.reason };
  }

  function stop(reason = "stop") {
    if (!stopped) logLifecycle("stopped", { reason });
    stopped = true;
    disconnectObservers();
    observedRoot = null;
    waitingForRoot = false;
    while (cleanups.length) cleanups.pop()();
    for (const ui of copyUi.values()) ui.wrap.remove();
    copyUi.clear();
    pasteUi?.wrap.remove();
    pasteUi = null;
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
    get scanCount() {
      return scanCount;
    },
    get stopped() {
      return stopped;
    }
  };
}
