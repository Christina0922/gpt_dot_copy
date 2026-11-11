# Privacy Policy — Dot Copy Paste

Last updated: November 12, 2026

Dot Copy Paste is an independent Chrome extension. It is not an official OpenAI product and is not affiliated with, endorsed by, or sponsored by OpenAI. Copy and paste guidance are free. Exporting the open dot conversation is a separate one-time feature. Version 0.2.6 does not sell it and does not send the conversation to a server.

The current policy is this file. `archive/Dot_Copy_Paste_Privacy_Policy_2026-10-19.docx` is an old snapshot from October 19, 2026. It is not the policy for the current extension.

## Information the extension handles

The extension reads the page structure needed to recognize a ChatGPT dot conversation. When you click Copy, it reads that message body and writes plain text to the clipboard. When you open the Markdown item and click it, it reads the same body and writes Markdown instead. The paste button does not read the clipboard and does not change the composer. Use Ctrl+V in the input.

The export control is limited to a confirmed dot conversation. It can build a TXT or Markdown file from messages already loaded on screen. It does not download original attachments. Because the page does not confirm that every message is loaded, this version does not save that file and does not call it a full export. The purchase control does not open a payment page.

Conversation messages and clipboard text may contain personal communications. The extension uses that text only to perform the click you made. It does not send conversation text, clipboard text, or attachment files to a payment or license server.

## Local processing and storage

Conversation text and clipboard contents are processed locally in the browser. The extension does not send them to Genius Brain or any other server, and it does not keep a conversation archive or clipboard history.

The enabled/disabled setting and the language choice are stored in `chrome.storage.local`. A local `pro` value does not unlock export.

The purchase-status check can contact `https://dot-copy-paste.vercel.app` and send only a session token, or the cookie set when a one-time restore link is opened. It does not send conversation text, clipboard text, or attachments. The license server stores a hash of the session token, an account id, a hash of the payment email, the transaction id, the payment-notification id, the product id, the amount, the currency, and the entitlement status. Typing an email address does not grant a purchase. A payment-success page does not grant a purchase. Removing the extension clears the local token. A deletion request for a server record can be sent to `connect.geniusbrain@gmail.com` or through https://github.com/Christina0922/gpt_dot_copy. Records a payment provider must keep for tax or refund handling follow that provider's policy.

## Permissions

Site access to `https://chatgpt.com/*` lets the extension find a dot conversation, the message body, and the composer, and show its controls. It does not run on other sites.

`storage` keeps the local settings above. Host access is limited to `https://dot-copy-paste.vercel.app/*` so the popup can ask that license server whether a purchase is recorded. No other host was added.

The extension does not declare `clipboardRead`. It does not watch the clipboard, and the paste button does not read it. Copy runs from the button click and does not need that permission.

## Purchases

The planned price is a one-time KRW 4,900 payment. There is no subscription and no automatic renewal. The seller would be the extension developer, not Google. Later features are not promised as part of that purchase. Full-thread export is not offered for sale. The sale is closed in this version. Use and refund terms are in `TERMS.md`.

## Your choices

The extension does not send messages. You decide whether to edit or send text in the composer.

You can disable or remove the extension in Chrome, and you can change its site access and optional permissions there. Text that was copied remains in the system clipboard according to the operating system and other applications. This policy does not control that clipboard history.

The paste button does not insert text into the dot composer, so it does not replace an existing draft. It tells you to use Ctrl+V. Selection restore and undo are not provided by that button.

## Sharing

The extension does not sell user data, share it for advertising, use it for unrelated purposes, or use it to determine creditworthiness or lending eligibility. It has no advertising or analytics trackers and does not load remote code.

ChatGPT is operated by OpenAI. Your use of ChatGPT is subject to OpenAI's policies.

This policy describes the extension. A visit to a website, GitHub, or a support message is handled by that service separately. The Chrome Web Store lists `connect.geniusbrain@gmail.com` as the developer email. Questions about this policy can also be sent through the public repository: https://github.com/Christina0922/gpt_dot_copy

## Changes

This policy will be updated if the extension's data practices change. Any new data handling must be disclosed, and any required consent obtained, before it begins.
