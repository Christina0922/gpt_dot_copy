function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeAnchorPosition({ anchor, width, height, viewportWidth, viewportHeight, placement }) {
  if (!anchor || anchor.bottom <= 0 || anchor.top >= viewportHeight || anchor.right <= 0 || anchor.left >= viewportWidth) {
    return { hidden: true };
  }
  const left = clamp(anchor.right - width - 8, 8, Math.max(8, viewportWidth - width - 8));
  const preferred = placement === "above" ? anchor.top - height - 6 : anchor.top + 8;
  const top = clamp(preferred, 8, Math.max(8, viewportHeight - height - 8));
  return { hidden: false, top, left };
}

const BLOCK_END = new Set(["PRE", "TABLE", "UL", "OL", "BLOCKQUOTE"]);

function isCopyContent(element) {
  if (!element || element.nodeType !== 1) return false;
  if (element.hasAttribute("data-dcp-ui") || element.hasAttribute("data-dcp-exclude")) return false;
  if (element.getAttribute("data-markdown-copy") === "exclude") return false;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
  const style = element.style;
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return true;
}

// The copy control sits after the message body. A list, table, code block, or quote keeps it
// underneath that block. A paragraph keeps it on the same line so it can wrap when space runs out.
export function findCopyAnchor(body) {
  if (!body || body.nodeType !== 1) return null;
  let container = body;
  let children = [...container.children].filter(isCopyContent);
  while (children.length === 1 && children[0].tagName === "DIV") {
    container = children[0];
    children = [...container.children].filter(isCopyContent);
  }
  const last = children.at(-1);
  if (!last) return { mode: "inline", anchor: container };
  if (BLOCK_END.has(last.tagName)) return { mode: "below", anchor: last };
  if (last.tagName === "P") return { mode: "inline", anchor: last };
  return { mode: "inline", anchor: container };
}
