const SKIP_TAGS = new Set([
  "BUTTON",
  "TIME",
  "SCRIPT",
  "STYLE",
  "SVG",
  "NOSCRIPT",
  "IMG",
  "PICTURE",
  "VIDEO",
  "CANVAS",
  "AUDIO",
  "IFRAME",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "FORM"
]);

const PARAGRAPH_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE", "FIGCAPTION"]);
const LINE_TAGS = new Set(["LI", "TR", "DT", "DD"]);

function isSkipped(node) {
  if (!node || node.nodeType !== 1) return false;
  if (SKIP_TAGS.has(node.tagName)) return true;
  if (node.hasAttribute("hidden")) return true;
  if (node.getAttribute("aria-hidden") === "true") return true;
  if (node.hasAttribute("data-dcp-ui") || node.hasAttribute("data-dcp-exclude")) return true;
  if (node.getAttribute("data-markdown-copy") === "exclude") return true;
  if (node.getAttribute("role") === "button" || node.getAttribute("role") === "toolbar") return true;
  const style = node.style;
  if (style && (style.display === "none" || style.visibility === "hidden")) return true;
  if (typeof node.ownerDocument?.defaultView?.getComputedStyle === "function") {
    const computed = node.ownerDocument.defaultView.getComputedStyle(node);
    if (computed && (computed.display === "none" || computed.visibility === "hidden")) return true;
  }
  return false;
}

function hasBlockChild(element) {
  return [...element.children].some((child) => {
    if (isSkipped(child)) return false;
    return PARAGRAPH_TAGS.has(child.tagName) || LINE_TAGS.has(child.tagName) || child.tagName === "UL" || child.tagName === "OL" || child.tagName === "DIV" || child.tagName === "SECTION" || child.tagName === "PRE";
  });
}

function blockKind(element) {
  if (PARAGRAPH_TAGS.has(element.tagName)) return "paragraph";
  if (LINE_TAGS.has(element.tagName)) return "line";
  if ((element.tagName === "DIV" || element.tagName === "SECTION" || element.tagName === "ARTICLE") && !hasBlockChild(element)) {
    return "line";
  }
  return "transparent";
}

function listMarker(element) {
  const parent = element.parentElement;
  if (!parent || parent.tagName !== "OL" && parent.tagName !== "UL") return "";
  if (parent.tagName === "UL") return "- ";
  const items = [...parent.children].filter((child) => child.tagName === "LI");
  const start = Number.parseInt(parent.getAttribute("start") || "1", 10);
  const index = items.indexOf(element);
  return `${(Number.isFinite(start) ? start : 1) + Math.max(0, index)}. `;
}

function pushBreak(parts, kind) {
  const text = parts.join("\u0000");
  const combined = text.replaceAll("\u0000", "");
  if (!combined.trim()) {
    parts.length = 0;
    return;
  }
  const needed = kind === "paragraph" ? "\n\n" : "\n";
  if (combined.endsWith(needed)) return;
  if (kind === "paragraph" && combined.endsWith("\n")) {
    parts.push("\n");
    return;
  }
  parts.push(needed);
}

function walk(node, parts, pre) {
  if (node.nodeType === 3) {
    const value = node.nodeValue || "";
    if (pre) {
      parts.push(value);
      return;
    }
    if (!value.trim()) return;
    parts.push(value.replace(/\s+/g, " "));
    return;
  }
  if (node.nodeType !== 1 || isSkipped(node)) return;
  if (node.tagName === "BR") {
    parts.push("\n");
    return;
  }
  if (node.tagName === "CODE") {
    const multiline = !pre && /\n/.test(node.textContent || "");
    if (multiline) pushBreak(parts, "paragraph");
    for (const child of node.childNodes) walk(child, parts, true);
    if (multiline) pushBreak(parts, "paragraph");
    return;
  }

  const preserve = pre || node.tagName === "PRE" || (node.tagName === "CODE" && /\n/.test(node.textContent || ""));
  if (preserve) {
    if (!pre) pushBreak(parts, "paragraph");
    for (const child of node.childNodes) walk(child, parts, true);
    if (!pre) pushBreak(parts, "paragraph");
    return;
  }

  const kind = blockKind(node);
  if (kind !== "transparent") pushBreak(parts, kind);
  if (node.tagName === "LI") parts.push(listMarker(node));
  for (const child of node.childNodes) walk(child, parts, false);
  if (kind !== "transparent") pushBreak(parts, kind);
}

function cleanup(value) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPlainText(root) {
  if (!root || root.nodeType !== 1) return "";
  const parts = [];
  walk(root, parts, false);
  return cleanup(parts.join(""));
}

export function hasCopyableText(root) {
  return extractPlainText(root).length > 0;
}
