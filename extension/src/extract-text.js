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

const BLOCK_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE", "FIGCAPTION", "FIGURE",
  "UL", "OL", "LI", "DL", "DT", "DD", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "CAPTION", "HR",
  "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE", "NAV", "DETAILS", "SUMMARY"
]);

const BLOCK_SELECTOR = [...BLOCK_TAGS].map((tag) => tag.toLowerCase()).join(",");

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

function skippedBetween(node, ancestor) {
  for (let current = node; current && current !== ancestor; current = current.parentElement) {
    if (isSkipped(current)) return true;
  }
  return false;
}

// Code keeps every character: no whitespace collapsing, no trimming.
function rawText(node) {
  if (node.nodeType === 3) return node.nodeValue || "";
  if (node.nodeType !== 1 || isSkipped(node)) return "";
  if (node.tagName === "BR") return "\n";
  let text = "";
  for (const child of node.childNodes) text += rawText(child);
  return text;
}

function codeLanguage(...elements) {
  for (const element of elements) {
    const match = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(element?.getAttribute?.("class") || "");
    if (match) return match[1];
  }
  return "";
}

function isMultilineCode(element) {
  return element.tagName === "CODE" && !element.closest("pre") && rawText(element).includes("\n");
}

function isBlockElement(element) {
  return BLOCK_TAGS.has(element.tagName) || isMultilineCode(element);
}

function containsBlock(element) {
  return [...element.querySelectorAll(BLOCK_SELECTOR)].some((node) => !skippedBetween(node, element));
}

function collapse(value) {
  return value.replace(/\s+/g, " ");
}

function appendInline(acc, piece) {
  if (!piece) return acc;
  if (piece.startsWith(" ") && (acc === "" || /[ \n]$/.test(acc))) return acc + piece.slice(1);
  return acc + piece;
}

function finishInline(value) {
  return value.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/^[ \n]+|[ \n]+$/g, "");
}

function renderInlineChildren(element, ctx) {
  let text = "";
  for (const child of element.childNodes) {
    if (child.nodeType === 3) {
      text = appendInline(text, ctx.format.text(collapse(child.nodeValue || ""), ctx));
      continue;
    }
    if (child.nodeType !== 1 || isSkipped(child)) continue;
    if (child.tagName === "BR") {
      text = ctx.cell ? appendInline(text, " ") : text.replace(/ $/, "") + "\n";
      continue;
    }
    text = appendInline(text, renderInline(child, ctx));
  }
  return text;
}

function renderInline(element, ctx) {
  if (element.tagName === "CODE") return ctx.format.inlineCode(rawText(element).replace(/\r?\n/g, " "), ctx);
  return ctx.format.inline(element, renderInlineChildren(element, ctx), ctx);
}

function renderChildren(element, ctx) {
  const blocks = [];
  let inline = "";
  const flush = () => {
    const text = finishInline(inline);
    inline = "";
    if (text) blocks.push({ kind: "para", text: ctx.format.paragraph(text) });
  };
  for (const child of element.childNodes) {
    if (child.nodeType === 3) {
      inline = appendInline(inline, ctx.format.text(collapse(child.nodeValue || ""), ctx));
      continue;
    }
    if (child.nodeType !== 1 || isSkipped(child)) continue;
    if (child.tagName === "BR") {
      inline = inline.replace(/ $/, "") + "\n";
      continue;
    }
    if (isBlockElement(child)) {
      flush();
      blocks.push(...renderBlock(child, ctx));
      continue;
    }
    if (containsBlock(child)) {
      flush();
      blocks.push(...renderChildren(child, ctx));
      continue;
    }
    inline = appendInline(inline, renderInline(child, ctx));
  }
  flush();
  return blocks;
}

function renderCode(code, languageSource, ctx) {
  const text = code.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!text.trim()) return [];
  return [{ kind: "code", verbatim: true, text: ctx.format.codeBlock(text, codeLanguage(...languageSource)) }];
}

function renderPre(pre, ctx) {
  // Code block headers (language label, copy button) sit inside PRE next to CODE.
  const code = [...pre.querySelectorAll("code")].find((node) => !skippedBetween(node, pre));
  if (code) return renderCode(rawText(code), [code, pre], ctx);
  return renderCode(rawText(pre), [pre], ctx);
}

function indentLines(text, pad) {
  return text.split("\n").map((line) => (line ? pad + line : line)).join("\n");
}

// Plain text leaves code at column 0 so it pastes unchanged; blank lines mark where it starts and ends.
function isFlushCode(block, ctx) {
  return block.verbatim === true && !ctx.format.indentVerbatim;
}

function endsWithFlushCode(block, ctx) {
  return isFlushCode(block, ctx) || block.flushEnd === true;
}

function renderListItem(marker, blocks, ctx) {
  const pad = " ".repeat(marker.length);
  let text = "";
  blocks.forEach((block, index) => {
    if (index === 0) {
      text = isFlushCode(block, ctx)
        ? `${marker.trimEnd()}\n\n${block.text}`
        : marker + indentLines(block.text, pad).slice(pad.length);
      return;
    }
    const previous = blocks[index - 1];
    const loose = ctx.format.looseItems && block.kind === "para" && previous.kind === "para";
    const gap = loose || isFlushCode(block, ctx) || endsWithFlushCode(previous, ctx) ? "\n\n" : "\n";
    text += gap + indentLines(block.text, isFlushCode(block, ctx) ? "" : pad);
  });
  const last = blocks.at(-1);
  return { text: text || marker.trimEnd(), flushEnd: Boolean(last && endsWithFlushCode(last, ctx)) };
}

function renderList(list, ctx) {
  const ordered = list.tagName === "OL";
  const start = Number.parseInt(list.getAttribute("start") || "1", 10);
  let number = Number.isFinite(start) ? start : 1;
  const items = [];
  for (const child of list.children) {
    if (isSkipped(child)) continue;
    if (child.tagName !== "LI") {
      const blocks = renderChildren(child, ctx);
      if (blocks.length) items.push({ text: joinBlocks(blocks), flushEnd: endsWithFlushCode(blocks.at(-1), ctx) });
      continue;
    }
    const marker = ordered ? `${number}. ` : "- ";
    number += 1;
    items.push(renderListItem(marker, renderChildren(child, ctx), ctx));
  }
  if (!items.length) return [];
  let text = "";
  items.forEach((item, index) => {
    if (index > 0) text += items[index - 1].flushEnd ? "\n\n" : "\n";
    text += item.text;
  });
  return [{ kind: "list", text, flushEnd: items.at(-1).flushEnd }];
}

function tableRows(table) {
  const rows = [];
  const visit = (node) => {
    for (const child of node.children) {
      if (isSkipped(child)) continue;
      if (child.tagName === "TR") rows.push(child);
      else if (child.tagName === "THEAD" || child.tagName === "TBODY" || child.tagName === "TFOOT") visit(child);
    }
  };
  visit(table);
  return rows;
}

function renderTable(table, ctx) {
  const blocks = [];
  const caption = [...table.children].find((child) => child.tagName === "CAPTION" && !isSkipped(child));
  if (caption) blocks.push(...renderChildren(caption, ctx));
  const cellCtx = { ...ctx, cell: true };
  const rows = tableRows(table)
    .map((row) => [...row.children]
      .filter((cell) => (cell.tagName === "TD" || cell.tagName === "TH") && !isSkipped(cell))
      .map((cell) => finishInline(renderInlineChildren(cell, cellCtx)).replace(/\n/g, " ")))
    .filter((cells) => cells.length > 0);
  if (rows.length) blocks.push({ kind: "table", text: ctx.format.table(rows) });
  return blocks;
}

function renderBlock(element, ctx) {
  const tag = element.tagName;
  if (/^H[1-6]$/.test(tag)) {
    const text = finishInline(renderInlineChildren(element, ctx)).replace(/\n/g, " ");
    return text ? [{ kind: "heading", text: ctx.format.heading(Number(tag[1]), text) }] : [];
  }
  if (tag === "PRE") return renderPre(element, ctx);
  if (tag === "CODE") return renderCode(rawText(element), [element], ctx);
  if (tag === "UL" || tag === "OL") return renderList(element, ctx);
  if (tag === "TABLE") return renderTable(element, ctx);
  if (tag === "HR") {
    const rule = ctx.format.rule();
    return rule ? [{ kind: "rule", text: rule }] : [];
  }
  if (tag === "BLOCKQUOTE") return ctx.format.quote(renderChildren(element, ctx));
  const blocks = renderChildren(element, ctx);
  // A container with only inline content reads as one line, like the old LI/TR/DIV handling.
  if (tag !== "P" && blocks.length === 1 && blocks[0].kind === "para" && !containsBlock(element)) {
    blocks[0].kind = "line";
  }
  return blocks;
}

export function joinBlocks(blocks) {
  let text = "";
  blocks.forEach((block, index) => {
    if (index > 0) text += blocks[index - 1].kind === "line" && block.kind === "line" ? "\n" : "\n\n";
    text += block.text;
  });
  return text;
}

export const PLAIN_FORMAT = {
  indentVerbatim: false,
  looseItems: false,
  text: (value) => value,
  inlineCode: (code) => code,
  inline: (_element, inner) => inner,
  paragraph: (text) => text,
  heading: (_level, text) => text,
  codeBlock: (code) => code,
  table: (rows) => rows.map((cells) => cells.join("\t")).join("\n"),
  rule: () => null,
  quote: (blocks) => blocks
};

export function extractWithFormat(root, format) {
  if (!root || root.nodeType !== 1) return "";
  const blocks = renderChildren(root, { format, cell: false });
  return joinBlocks(blocks).replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
}

export function extractPlainText(root) {
  return extractWithFormat(root, PLAIN_FORMAT);
}

export function hasCopyableText(root) {
  return extractPlainText(root).trim().length > 0;
}
