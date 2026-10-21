import { extractWithFormat, joinBlocks } from "./extract-text.js";

// Escapes stay minimal: a character is escaped only where Markdown would read it as syntax.
// Lone *, _, -, [ in the middle of a sentence are left as they are.

const ASCII_PUNCT = "!\"#$%&'()*+,\\-./:;<=>?@[\\]^_`{|}~";
const BACKSLASH_ESCAPE = new RegExp(`\\\\(?=[${ASCII_PUNCT}])`, "g");
const EMPHASIS_PAIR = /(^|[\s(["'])(\*{1,3}|_{1,3}|~~)(?=[^\s*_~])([^]*?[^\s\\])\2(?=$|[\s.,;:!?)\]"'])/g;
const LINK_OPENER = /\[(?=[^\]]*\](?:\(|\[))/g;
const HTML_TAG = /<(?=[A-Za-z/!?][^<>]*>)/g;
const ENTITY = /&(?=#?[A-Za-z0-9]+;)/g;

function escapeDelimiters(run) {
  return run.replace(/[*_~]/g, (char) => `\\${char}`);
}

function escapeInline(value, ctx) {
  let text = value.replace(BACKSLASH_ESCAPE, "\\\\");
  text = text.replace(EMPHASIS_PAIR, (_, before, run, inner) => `${before}${escapeDelimiters(run)}${inner}${escapeDelimiters(run)}`);
  if ((text.match(/`/g) || []).length >= 2) text = text.replace(/`/g, "\\`");
  text = text.replace(LINK_OPENER, "\\[").replace(HTML_TAG, "\\<").replace(ENTITY, "\\&");
  if (ctx.cell) text = text.replace(/\|/g, "\\|");
  return text;
}

const LINE_START_RULES = [
  [/^(#{1,6})(?=\s|$)/, "\\$1"],
  [/^>/, "\\>"],
  [/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/, (line) => `\\${line}`],
  [/^([-+*])(?=\s|$)/, "\\$1"],
  [/^(\d{1,9})([.)])(?=\s|$)/, "$1\\$2"],
  [/^(`{3,}|~{3,})/, (run) => `\\${run}`],
  [/^=+[ \t]*$/, (line) => `\\${line}`]
];

function escapeLineStart(line) {
  for (const [pattern, replacement] of LINE_START_RULES) {
    if (pattern.test(line)) return line.replace(pattern, replacement);
  }
  return line;
}

function longestBacktickRun(text) {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}

function wrap(inner, marker) {
  const match = /^(\s*)([^]*?)(\s*)$/.exec(inner);
  if (!match[2]) return inner;
  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}

function linkDestination(href) {
  return href.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function renderLink(element, inner) {
  const href = (element.getAttribute("href") || "").trim();
  if (!/^(https?:|mailto:)/i.test(href)) return inner;
  const label = (inner.trim() || href).replace(/(^|[^\\])\]/g, "$1\\]");
  return `[${label}](${linkDestination(href)})`;
}

function quoteBlocks(blocks) {
  if (!blocks.length) return [];
  const text = joinBlocks(blocks).split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n");
  return [{ kind: "quote", text }];
}

function renderTable(rows) {
  const width = Math.max(...rows.map((cells) => cells.length));
  const line = (cells) => `| ${Array.from({ length: width }, (_, index) => cells[index] || "").join(" | ")} |`;
  const divider = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
  return [line(rows[0]), divider, ...rows.slice(1).map(line)].join("\n");
}

export const MARKDOWN_FORMAT = {
  indentVerbatim: true,
  looseItems: true,
  text: escapeInline,
  inlineCode(value, ctx) {
    if (!value) return "";
    const code = ctx.cell ? value.replace(/\|/g, "\\|") : value;
    const fence = "`".repeat(longestBacktickRun(code) + 1);
    const pad = code.startsWith("`") || code.endsWith("`") || (code.startsWith(" ") && code.endsWith(" ") && code.trim()) ? " " : "";
    return `${fence}${pad}${code}${pad}${fence}`;
  },
  inline(element, inner) {
    switch (element.tagName) {
      case "STRONG":
      case "B":
        return wrap(inner, "**");
      case "EM":
      case "I":
        return wrap(inner, "*");
      case "DEL":
      case "S":
      case "STRIKE":
        return wrap(inner, "~~");
      case "A":
        return renderLink(element, inner);
      default:
        return inner;
    }
  },
  paragraph: (text) => text.split("\n").map(escapeLineStart).join("\n"),
  heading: (level, text) => `${"#".repeat(level)} ${text}`,
  codeBlock(code, language) {
    const fence = "`".repeat(Math.max(3, longestBacktickRun(code) + 1));
    return `${fence}${language}\n${code}\n${fence}`;
  },
  table: renderTable,
  rule: () => "---",
  quote: quoteBlocks
};

export function extractMarkdown(root) {
  return extractWithFormat(root, MARKDOWN_FORMAT);
}
