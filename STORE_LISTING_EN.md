# Chrome Web Store listing draft (English)

Status: local draft for an update to the existing item. Not submitted.  
Existing item: https://chromewebstore.google.com/detail/dot-copy-paste/ndpennnmcicncopijfkmplbmkndkcdej  
Published version seen on October 23, 2026: 0.1.0  
This package: 0.2.4

Dot Copy Paste is an independent extension. It is not affiliated with, endorsed by, or sponsored by OpenAI.

## Overview

Dot Copy Paste adds copy controls to ChatGPT dot conversations in Chrome.

- Copy a message as plain text.
- Copy the same message as Markdown from a small MD menu. Headings, lists, links, quotes, code blocks, and tables are kept when the page provides them.
- The control sits at the end of the message and wraps instead of covering the text.
- Labels are Korean or English. The extension follows the browser language until you choose one in the popup.
- Copy and paste guidance are free.
- Exporting messages loaded in the open dot conversation is a separate one-time feature at KRW 4,900. There is no monthly subscription and no automatic renewal. Later features are not included.
- The seller is the extension developer, not Google.
- This version does not sell export. The button says the sale is in preparation and does not open a payment page. A full conversation export is not confirmed, so it is not offered as one.
- The paste button does not change the dot composer. Click the input and press Ctrl+V. The extension does not send messages.

Copied message text stays in the browser only long enough to place it on the clipboard. The extension does not send it to a server or keep a clipboard history. It does not request permission to read the clipboard.

Works on chatgpt.com dot conversations in Chrome. It does not add dot access and does not support the ChatGPT desktop or mobile apps.

## Permission justifications

- `storage`: Saves only the on/off switch and language choice in this browser.
- chatgpt.com: The content script is limited to this site and runs only on a recognized dot conversation.

## Not ready to claim

- The paste button inserts text into the dot composer
- Export saves a confirmed full conversation
- The KRW 4,900 purchase is open
- Screenshots and a promotional image exist
- Trademark review is finished
- This draft has been submitted or reviewed by the Chrome Web Store

Privacy policy text for this version is in `PRIVACY_POLICY.md`. Use and refund terms are in `TERMS.md`. Both are in https://github.com/Christina0922/gpt_dot_copy
