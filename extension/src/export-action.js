import { mayExport, readEntitlement } from "./entitlement.js";
import { buildConversationExport, collectMessages, exportScope } from "./export-conversation.js";
import { SALE } from "./sale.js";

export async function handleExportRequest({
  doc,
  adapter,
  format,
  language,
  exportedAt = new Date(),
  storage,
  sale = SALE,
  request,
  saveFile
} = {}) {
  const entitlement = await readEntitlement({ storage, sale, request });
  if (!mayExport(entitlement)) {
    return { ok: false, code: entitlement.state || "not-purchased" };
  }
  if (format !== "txt" && format !== "markdown") return { ok: false, code: "bad-format" };
  const collected = collectMessages(adapter, doc);
  if (!collected.ok) return { ok: false, code: collected.code };
  const scope = exportScope(collected.extent, collected.messages);
  const file = buildConversationExport({
    messages: collected.messages,
    title: collected.title,
    exportedAt,
    language,
    format,
    scope: scope.scope,
    reason: scope.reason
  });
  if (typeof saveFile === "function") saveFile({ filename: file.filename, text: file.text, mime: file.mime });
  return { ok: true, code: scope.scope === "full" ? "exported-full" : "exported-loaded", count: collected.messages.length };
}

export function saveTextFile(doc, file) {
  const view = doc?.defaultView;
  if (!view || typeof view.URL?.createObjectURL !== "function" || !file) return false;
  const blob = new view.Blob([file.text], { type: `${file.mime};charset=utf-8` });
  const url = view.URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
  return true;
}
