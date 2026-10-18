function insideEditor(editor, node) {
  return node === editor || editor.contains(node);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isEditorEmpty(composer) {
  if (!composer || !composer.element) return true;
  if (composer.kind === "textarea") return composer.element.value.length === 0;
  if (composer.kind === "contenteditable") return (composer.element.textContent || "").trim().length === 0;
  return true;
}

export function readTextareaCaret(textarea, doc) {
  if (!textarea || doc.activeElement !== textarea) return null;
  if (!Number.isInteger(textarea.selectionStart) || !Number.isInteger(textarea.selectionEnd)) return null;
  return { kind: "textarea", start: textarea.selectionStart, end: textarea.selectionEnd };
}

export function readContentEditableCaret(editor, doc) {
  const selection = doc.getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!range.startContainer || !insideEditor(editor, range.startContainer)) return null;
  return { kind: "contenteditable", range: range.cloneRange() };
}

function textareaBounds(value, caret) {
  if (!caret || caret.kind !== "textarea" || !Number.isInteger(caret.start) || !Number.isInteger(caret.end)) {
    return [value.length, value.length];
  }
  const start = clamp(caret.start, 0, value.length);
  const end = clamp(caret.end, 0, value.length);
  return start <= end ? [start, end] : [end, start];
}

function placeTextareaSelection(textarea, start, end) {
  textarea.focus();
  textarea.setSelectionRange(start, end);
}

function inputEvent(view, type, text, cancelable) {
  const Ctor = view.InputEvent || view.Event;
  try {
    return new Ctor(type, { bubbles: true, cancelable, inputType: "insertText", data: text });
  } catch {
    return new view.Event(type, { bubbles: true, cancelable });
  }
}

function dispatchBeforeInput(element, text, view) {
  return element.dispatchEvent(inputEvent(view, "beforeinput", text, true));
}

function dispatchInput(element, text, view) {
  element.dispatchEvent(inputEvent(view, "input", text, false));
}

function insertTextarea(element, text, caret, doc) {
  const current = element.value;
  const empty = current.length === 0;
  const [start, end] = empty ? [0, 0] : textareaBounds(current, caret);
  const expected = current.slice(0, start) + text + current.slice(end);
  placeTextareaSelection(element, start, end);
  let commandWorked = false;
  if (typeof doc.execCommand === "function") {
    try {
      commandWorked = doc.execCommand("insertText", false, text) === true && element.value === expected;
    } catch {
      commandWorked = false;
    }
  }
  if (commandWorked) {
    const pos = start + text.length;
    element.setSelectionRange(pos, pos);
    element.focus();
    return { ok: true, method: "execCommand", undo: "browser-default" };
  }
  placeTextareaSelection(element, start, end);
  const view = doc.defaultView || globalThis;
  if (!dispatchBeforeInput(element, text, view)) {
    element.value = current;
    placeTextareaSelection(element, start, end);
    return { ok: false, reason: "cancelled" };
  }
  element.value = expected;
  const pos = start + text.length;
  element.setSelectionRange(pos, pos);
  dispatchInput(element, text, view);
  element.focus();
  return { ok: true, method: "value", undo: "not-guaranteed" };
}

function selectionFromCaret(editor, caret, doc) {
  const selection = doc.getSelection?.();
  if (!selection) return null;
  if (caret && caret.kind === "contenteditable" && caret.range && caret.range.startContainer?.isConnected && insideEditor(editor, caret.range.startContainer)) {
    selection.removeAllRanges();
    selection.addRange(caret.range);
    return selection;
  }
  const range = doc.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function manualContentEditableInsert(editor, text, doc) {
  const selection = doc.getSelection?.();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (!insideEditor(editor, range.startContainer)) return false;
  const view = doc.defaultView || globalThis;
  if (!dispatchBeforeInput(editor, text, view)) return false;
  range.deleteContents();
  const node = doc.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchInput(editor, text, view);
  return true;
}

function selectEditor(element, caret, doc, empty) {
  element.focus();
  if (empty) {
    const selection = doc.getSelection?.();
    const range = doc.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return;
  }
  selectionFromCaret(element, caret, doc);
}

function insertContentEditable(element, text, caret, doc) {
  const empty = (element.textContent || "").trim().length === 0;
  selectEditor(element, caret, doc, empty);
  const before = element.textContent || "";
  let commandWorked = false;
  if (typeof doc.execCommand === "function") {
    try {
      commandWorked = doc.execCommand("insertText", false, text) === true && (element.textContent || "") !== before;
    } catch {
      commandWorked = false;
    }
  }
  if (!commandWorked) {
    if ((element.textContent || "") !== before) element.textContent = before;
    selectEditor(element, caret, doc, empty);
    if (!manualContentEditableInsert(element, text, doc)) {
      return { ok: false, reason: "cancelled" };
    }
    element.focus();
    return { ok: true, method: "text-node", undo: "not-guaranteed" };
  }
  element.focus();
  return { ok: true, method: "execCommand", undo: "browser-default" };
}

export function insertPlainText(composer, text, caret, doc) {
  if (!composer?.element || !composer.element.isConnected) return { ok: false, reason: "missing" };
  if (composer.kind === "textarea") return insertTextarea(composer.element, text, caret, doc);
  if (composer.kind === "contenteditable") return insertContentEditable(composer.element, text, caret, doc);
  return { ok: false, reason: "unsupported" };
}
