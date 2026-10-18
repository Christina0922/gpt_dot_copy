const BLOCK_END = new Set(["PRE", "TABLE", "UL", "OL", "BLOCKQUOTE"]);

function contentChildren(element) {
  return [...element.children].filter((child) => {
    if (child.hasAttribute("data-dcp-ui") || child.hasAttribute("data-dcp-exclude")) return false;
    if (child.getAttribute("data-markdown-copy") === "exclude") return false;
    if (child.hasAttribute("hidden") || child.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
}

export function findCopyAnchor(body) {
  if (!body || body.nodeType !== 1) return null;
  let node = body;
  while (true) {
    const children = contentChildren(node);
    const last = children[children.length - 1];
    if (!last || last.tagName !== "DIV") break;
    node = last;
  }
  const last = contentChildren(node).at(-1) || null;
  if (last && BLOCK_END.has(last.tagName)) return { mode: "below", anchor: last };
  if (last && last.tagName === "P") return { mode: "inline", anchor: last };
  return { mode: "inline", anchor: node };
}

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
