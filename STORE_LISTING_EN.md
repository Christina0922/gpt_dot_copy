# Chrome Web Store listing draft (English)

Status: local draft for an update to the existing item. Not submitted.  
Existing item: https://chromewebstore.google.com/detail/dot-copy-paste/ndpennnmcicncopijfkmplbmkndkcdej  
Published version seen on October 23, 2026: 0.1.0  
This package: 0.2.1

Dot Copy Paste is an independent extension. It is not affiliated with, endorsed by, or sponsored by OpenAI.

## Overview

Dot Copy Paste adds copy controls to ChatGPT dot conversations in Chrome.

- Copy a message as plain text.
- Copy the same message as Markdown from a small MD menu. Headings, lists, links, quotes, code blocks, and tables are kept when the page provides them.
- The control sits at the end of the message and wraps instead of covering the text.
- Labels are Korean or English. The extension follows the browser language until you choose one in the popup.
- Paste is experimental. If the dot composer does not accept the inserted text, the extension restores what you had typed and tells you to use Ctrl+V. It never sends a message for you.

Conversation and clipboard text stay in the browser. The extension does not send that text to a server or keep a clipboard history. Clipboard reading is optional and happens only when you click Paste.

Works on chatgpt.com dot conversations in Chrome. It does not add dot access and does not support the ChatGPT desktop or mobile apps.

## Permission justifications

- `storage`: Saves only the on/off switch and language choice in this browser.
- `clipboardRead` (optional): Reads plain text once, when you click Paste, and only if you allow it. Copy still works if you decline or revoke it.
- chatgpt.com: The content script is limited to this site and runs only on a recognized dot conversation.

## Not ready to claim

- Paste works in every dot composer
- Screenshots and a promotional image exist
- Trademark review is finished
- This draft has been submitted or reviewed by the Chrome Web Store

Privacy policy text for this version is in `PRIVACY_POLICY.md` in https://github.com/Christina0922/gpt_dot_copy
