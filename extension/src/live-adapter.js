/**
 * Live ChatGPT Dot adapter.
 *
 * Confirmed on 2026-10-19 in the signed-in Dot conversation at /dots/home.
 * Message text and account details were not recorded.
 */

// The user's bubbles list "reply" before the reaction button; Dot's list them the other way round.
function sideFromActions(actions) {
  const replyIndex = actions.indexOf("reply");
  const reactionIndex = actions.indexOf("toggle-reaction-picker");
  if (replyIndex === -1 || reactionIndex === -1) return "unknown";
  return replyIndex < reactionIndex ? "user" : "dot";
}

function messageActions(message) {
  return [...message.querySelectorAll("[data-action]")].map((node) => node.getAttribute("data-action"));
}

function authorKind(message) {
  const actions = messageActions(message);
  if (actions.includes("open-image")) return "unknown";
  return sideFromActions(actions);
}

export function detectDotScreen(doc) {
  const host = doc?.location?.hostname || "";
  if (host !== "chatgpt.com") return { active: false, reason: "not-chatgpt-host" };
  const path = doc?.location?.pathname || "";
  if (!path.startsWith("/dots/")) return { active: false, reason: "not-dot-path" };
  if (typeof doc.querySelector !== "function") return { active: false, reason: "dot-landmarks-missing" };
  const root = doc.querySelector("[data-role='messages-scroll']");
  const composerArea = doc.querySelector("[data-role='composer']");
  const composer = composerArea?.querySelector("[contenteditable='true'][role='textbox']");
  if (!root || !composer) {
    // Names only which landmark is absent, so a stuck "waiting" can be told apart in the console.
    const missing = [];
    if (!root) missing.push("messages-scroll");
    if (!composerArea) missing.push("composer");
    else if (!composer) missing.push("composer-textbox");
    return { active: false, reason: "dot-landmarks-missing", missing };
  }
  return { active: true, reason: "dot-conversation" };
}

// The send button's label follows the page language ("Send", "보내기", ...), so it is found by
// structure first and by label only as a last resort.
const SEND_BUTTON_SELECTORS = [
  "button[data-testid='send-button']",
  "button#composer-submit-button",
  "button[type='submit']",
  "button.bg-composer-primary"
];
const SEND_LABELS = ["send", "send message", "send prompt", "보내기", "전송", "메시지 보내기"];

export function findSendButton(composerArea) {
  if (!composerArea || typeof composerArea.querySelector !== "function") return null;
  for (const selector of SEND_BUTTON_SELECTORS) {
    const found = composerArea.querySelector(selector);
    if (found) return found;
  }
  for (const button of composerArea.querySelectorAll("button[aria-label]")) {
    if (SEND_LABELS.includes(button.getAttribute("aria-label").trim().toLowerCase())) return button;
  }
  return null;
}

export const liveAdapter = {
  detect: detectDotScreen,
  getObserverRoot(doc) {
    if (typeof doc?.querySelector !== "function") return null;
    return doc.querySelector("[data-role='messages-scroll']");
  },
  messagesIn(node) {
    if (!node || node.nodeType !== 1 || typeof node.querySelectorAll !== "function") return [];
    const found = [];
    if (node.matches?.("article[data-message-id]")) found.push(node);
    found.push(...node.querySelectorAll("article[data-message-id]"));
    return found;
  },
  messageFromNode(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest?.("article[data-message-id]") || null;
  },
  getBodyElement(message) {
    if (!message || typeof message.querySelector !== "function") return null;
    return message.querySelector("[data-markdown-text-style]");
  },
  // Which side of the conversation a message is on, so the copy icons can line up with the bubble.
  // Images do not change the side, so this does not use authorKind's image rule.
  getAuthor(message) {
    if (!message) return "unknown";
    return sideFromActions(messageActions(message));
  },
  getGenerationState(message) {
    if (!message) return "unknown";
    return authorKind(message) === "user" ? "complete" : "unknown";
  },
  hasNativeCopy() {
    return false;
  },
  getComposer(doc) {
    if (typeof doc?.querySelector !== "function") return null;
    const element = doc.querySelector("[data-role='composer'] [contenteditable='true'][role='textbox']");
    if (!element) return null;
    return { kind: "contenteditable", element };
  },
  composerHasDraft(element) {
    const send = findSendButton(element?.closest?.("[data-role='composer']"));
    if (!send) return null;
    return send.disabled !== true && send.getAttribute("aria-disabled") !== "true";
  }
};
