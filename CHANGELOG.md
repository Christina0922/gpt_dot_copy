# Changelog

## 0.2.6

- The popup uses a white background, blue accents, and separate sections for basic features, export, and purchase.
- Long policy text sits behind Details and the license pages. The popup keeps the loaded-message limit, the one-time KRW 4,900 price, and the disabled sale button.
- A status check without a login session asks the user to sign in or restore a purchase. It does not say that no purchase exists. Export still does not run without a confirmed purchase.

## 0.2.5

- Added a separate license server at `https://dot-copy-paste.vercel.app`. The public purchase button stays in preparation and does not open a payment page.
- Purchase records use a Postgres database for this product only. The in-memory store remains a test double.
- A payment-success page does not grant Pro. Signed notifications, duplicate events, and refund updates are covered by tests. A Paddle Sandbox product is not connected yet.
- Purchase restore is a 15-minute, single-use email link. Mail uses SMTP. The password variable is `DCP_EMAIL_SMTP_PASSWORD`, and the server does not read `DCP_EMAIL_API_KEY`. No restore message was sent.
- Refunds follow `adjustment.created` and `adjustment.updated`. `transaction.refunded` does not change access. A pending or rejected refund does not remove access. A partial refund keeps the purchase until approved amounts cover the full price.
- The popup can ask the license server whether a purchase is recorded. Export stays off because the full thread is not verified on a live Dots screen.

## 0.2.4

- Added a local TXT or Markdown export of messages loaded on a dot conversation. It is not labeled as the full conversation, and it is not for sale, because the live page has no confirmed full-thread count.
- Added a server-checked one-time purchase flow for tests. The extension does not open a payment page, and a local pro flag does not unlock export.

## 0.2.3

- Removed `clipboardRead` and the popup allow/revoke controls. The dot paste button does not read the clipboard, and no other product feature does.
- The October 19, 2026 Word privacy policy is archived and is not the current policy.

## 0.2.2

- The dot composer is contenteditable. Visible text and an already enabled Send button do not prove that a programmatic paste became a draft. The paste button no longer reads the clipboard or changes that composer.
- The button is disabled and tells you to click the input and press Ctrl+V. It also says selection restore and undo are not guaranteed.
- A multiline draft is left as it is. The button does not replace the composer DOM.
- A textarea composer, which is not the dot input, still pastes only when the value equals the expected edit. Any other result is restored and shown as failure, with the same Ctrl+V guidance.
- The live adapter still cannot tell a generating dot reply from a finished one. Dot replies stay on "Copy visible text". Blocking copy while a reply is generating is covered by fixture tests only.

## 0.2.1

- The popup language now follows the browser language until a language is chosen. Korean browser languages use Korean. Every other language uses English. An explicit Korean or English choice overrides the browser.
- Changing the language updates copy and paste labels that are already on the page, including accessible names.
- The main control is one Copy button. Markdown is a small MD menu on the same control, not a second always-visible icon.
- A finished message is labeled Copy / 복사. A reply whose completion is unknown is labeled Copy visible text / 현재 표시된 내용 복사. A reply that is still generating cannot be copied.
- Success shows Copied! or 복사됨 only after the clipboard write succeeds. Failure stays a failure, then the label returns.
- The control sits in normal flow at the end of the message. A paragraph shares the last line and wraps. A list, table, code block, or quote keeps the control underneath that block.
- Plain text and Markdown copy are unchanged in scope: headings, lists, links, quotes, code, and tables are kept in Markdown. Code language is used only when the page marks it. Buttons, times, and reactions are not copied.
- Paste still reads the clipboard only when the paste button is clicked. If an empty dot composer does not accept the text as a draft, the extension restores the previous text and reports failure instead of success. It does not press Send.
- Store and popup text no longer say this is a test build or that buttons stay hidden.

### Known limits

- Programmatic paste into the dot composer is still experimental. If the editor does not enable Send, use Ctrl+V.
- Undo after a contenteditable paste is not guaranteed. A rejected paste restores the previous text; the previous selection inside a contenteditable is not fully restored because the text nodes are rebuilt. The caret is placed at the end of the restored text.
- Signed-in dot checks for theme, zoom, narrow windows, streaming, conversation switching, and permission prompts are recorded in TEST_REPORT.md and are not claimed here unless that file says they were seen.
