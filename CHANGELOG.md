# Changelog

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
