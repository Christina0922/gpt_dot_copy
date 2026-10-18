function errorName(error) {
  const name = error && typeof error.name === "string" ? error.name : "Error";
  return name.slice(0, 40);
}

export function legacyCopy(text, doc) {
  const previouslyFocused = doc.activeElement;
  const area = doc.createElement("textarea");
  area.setAttribute("data-dcp-ui", "");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  doc.body.appendChild(area);
  area.focus();
  area.select();
  let ok = false;
  try {
    ok = typeof doc.execCommand === "function" && doc.execCommand("copy") === true;
  } catch {
    ok = false;
  } finally {
    area.remove();
    if (previouslyFocused && previouslyFocused.isConnected && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
  }
  return ok;
}

export async function writePlainText(text, clipboard, doc) {
  if (clipboard && typeof clipboard.writeText === "function") {
    let pending;
    try {
      pending = clipboard.writeText(text);
    } catch (error) {
      if (legacyCopy(text, doc)) return { ok: true, method: "execCommand" };
      return { ok: false, reason: "failed", name: errorName(error) };
    }
    const legacyOk = legacyCopy(text, doc);
    try {
      await pending;
      return { ok: true, method: "clipboard-api" };
    } catch (error) {
      if (legacyOk) return { ok: true, method: "execCommand" };
      return { ok: false, reason: "failed", name: errorName(error) };
    }
  }
  if (legacyCopy(text, doc)) return { ok: true, method: "execCommand" };
  return { ok: false, reason: "failed", name: "Error" };
}

export async function readPlainText(clipboard, doc) {
  if (!doc.hasFocus || doc.hasFocus() !== true) {
    return { ok: false, reason: "unfocused" };
  }
  if (!clipboard || typeof clipboard.readText !== "function") {
    return { ok: false, reason: "unavailable" };
  }
  let pending;
  try {
    pending = clipboard.readText();
  } catch (error) {
    return { ok: false, reason: "denied", name: errorName(error) };
  }
  try {
    const text = await pending;
    if (typeof text !== "string" || text.trim().length === 0) return { ok: false, reason: "empty" };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, reason: "denied", name: errorName(error) };
  }
}
