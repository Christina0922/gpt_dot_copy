import { extractMarkdown } from "./extract-markdown.js";
import { extractPlainText } from "./extract-text.js";

const COPY = {
  ko: {
    loaded: "현재 불러온 메시지 내보내기",
    full: "대화 전체 내보내기",
    loadedNote: "이 파일은 화면에 불러온 메시지입니다. 전체 대화인지는 확인되지 않았습니다.",
    missingTotal: "불러온 메시지 수와 전체 메시지 수가 일치하는지는 확인하지 못했습니다.",
    unfinished: "완료로 확인되지 않은 답변이 있어 전체 대화로 저장하지 않았습니다.",
    title: "제목",
    noTitle: "확인된 제목 없음",
    date: "내보낸 날짜(UTC)",
    attachment: "첨부파일 원본은 포함하지 않습니다.",
    user: "사용자",
    dot: "닷",
    unknown: "작성자 미확인",
    generating: "아직 완료되지 않은 답변입니다.",
    unknownState: "이 답변의 완료 여부는 확인되지 않았습니다.",
    time: "시간"
  },
  en: {
    loaded: "Export of messages loaded on screen",
    full: "Full conversation export",
    loadedNote: "This file contains the messages loaded on screen. It is not confirmed to be the full conversation.",
    missingTotal: "The loaded message count was not confirmed against the full message count.",
    unfinished: "A reply is not confirmed finished, so this file is not a full conversation export.",
    title: "Title",
    noTitle: "No confirmed title",
    date: "Exported date (UTC)",
    attachment: "Original attachments are not included.",
    user: "User",
    dot: "Dot",
    unknown: "Author not confirmed",
    generating: "This reply is not finished.",
    unknownState: "Whether this reply is finished was not confirmed.",
    time: "Time"
  }
};

export function readConfirmedTime(message) {
  const node = message?.querySelector?.("time");
  if (!node) return "";
  const datetime = (node.getAttribute("datetime") || "").trim();
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(datetime)) return datetime;
  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

export function readConversationTitle(doc) {
  const title = typeof doc?.title === "string" ? doc.title.trim() : "";
  if (!title || /^chatgpt$/i.test(title)) return "";
  return title;
}

export function sanitizeTitle(title) {
  return String(title || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
}

export function formatExportDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

export function exportFilename(title, exportedAt, format) {
  const date = formatExportDate(exportedAt);
  const cleaned = sanitizeTitle(title);
  const base = cleaned || "dot-conversation";
  const ext = format === "markdown" ? "md" : "txt";
  return date ? `${base}-${date}.${ext}` : `${base}.${ext}`;
}

export function exportScope(extent, messages) {
  const list = Array.isArray(messages) ? messages : [];
  const allComplete = list.length > 0 && list.every((message) => message.state === "complete");
  const countMatches = extent?.complete === true
    && Number.isInteger(extent.expectedCount)
    && extent.expectedCount === list.length
    && extent.loadedCount === list.length;
  if (allComplete && countMatches) return { scope: "full", reason: "confirmed" };
  if (!allComplete) return { scope: "loaded", reason: "unfinished-or-unconfirmed" };
  return { scope: "loaded", reason: extent?.reason || "no-confirmed-total" };
}

export function collectMessages(adapter, doc) {
  const detection = adapter?.detect?.(doc);
  if (!detection?.active) return { ok: false, code: "not-dot-screen", messages: [] };
  const root = adapter.getObserverRoot(doc);
  const nodes = adapter.messagesIn(root);
  const messages = nodes.map((node) => {
    const body = adapter.getBodyElement(node);
    return {
      author: adapter.getAuthor(node) || "unknown",
      state: adapter.getGenerationState(node) || "unknown",
      time: readConfirmedTime(node),
      text: body ? extractPlainText(body) : "",
      markdown: body ? extractMarkdown(body) : "",
      attachmentOmitted: hasAttachment(node)
    };
  });
  const extent = typeof adapter.getThreadExtent === "function"
    ? adapter.getThreadExtent(doc)
    : { complete: false, loadedCount: messages.length, expectedCount: null, reason: "no-confirmed-total" };
  return { ok: true, messages, extent, title: readConversationTitle(doc) };
}

export function buildConversationExport({ messages, title, exportedAt, language, format, scope, reason }) {
  const copy = COPY[language === "ko" ? "ko" : "en"];
  const lines = [scope === "full" ? copy.full : copy.loaded];
  if (scope !== "full") {
    lines.push(copy.loadedNote);
    lines.push(reason === "unfinished-or-unconfirmed" ? copy.unfinished : copy.missingTotal);
  }
  lines.push(`${copy.title}: ${title ? title : copy.noTitle}`);
  const date = formatExportDate(exportedAt);
  if (date) lines.push(`${copy.date}: ${date}`);
  if (messages.some((message) => message.attachmentOmitted)) lines.push(copy.attachment);
  lines.push("");
  messages.forEach((message, index) => {
    const author = copy[message.author] || copy.unknown;
    lines.push(format === "markdown" ? `## ${index + 1}. ${author}` : `${index + 1}. ${author}`);
    if (message.state === "generating") lines.push(copy.generating);
    else if (message.state !== "complete") lines.push(copy.unknownState);
    if (message.time) lines.push(`${copy.time}: ${message.time}`);
    lines.push("");
    lines.push(format === "markdown" ? message.markdown : message.text);
    lines.push("");
  });
  return {
    filename: exportFilename(title, exportedAt, format === "markdown" ? "markdown" : "txt"),
    text: `${lines.join("\n").replace(/\n+$/g, "\n")}`,
    mime: format === "markdown" ? "text/markdown" : "text/plain"
  };
}

function hasAttachment(node) {
  if (!node || typeof node.querySelector !== "function") return false;
  return Boolean(node.querySelector("img, video, audio, a[download]"));
}
