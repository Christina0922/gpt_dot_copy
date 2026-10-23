# Privacy Policy — Dot Copy Paste

Last updated: October 23, 2026

Dot Copy Paste is an independent Chrome extension. It is not an official OpenAI product and is not affiliated with, endorsed by, or sponsored by OpenAI. It adds clipboard controls to supported ChatGPT dot conversation pages.

The archived Word file `Dot_Copy_Paste_Privacy_Policy.docx` is dated October 19, 2026. This page adds the Markdown copy behavior introduced in version 0.2.1. It does not add a new recipient, permission, or stored data type.

## Information the extension handles

The extension reads the page structure needed to recognize a ChatGPT dot conversation. When you click Copy, it reads that message body and writes plain text to the clipboard. When you open the Markdown item and click it, it reads the same body and writes Markdown instead. When you click Paste and clipboard reading is available, it reads plain text from the clipboard and tries to insert it into the composer.

Conversation messages and clipboard text may contain personal communications. The extension uses that text only to perform the click you made.

## Local processing and storage

Conversation text and clipboard contents are processed locally in the browser. The extension does not send them to Genius Brain or any other server, and it does not keep a conversation archive or clipboard history.

Only the enabled/disabled setting and the language choice are stored in `chrome.storage.local`. If you have not chosen a language, the extension uses the browser language and does not need to store a conversation or clipboard value to do that.

## Permissions

Site access to `https://chatgpt.com/*` lets the extension find a dot conversation, the message body, and the composer, and show its controls. It does not run on other sites.

`storage` keeps the local settings above.

`clipboardRead` stays optional. It is used only after you click Paste. The extension does not watch the clipboard in the background. You can refuse or revoke this permission and still use Copy.

## Your choices

The extension does not send messages. You decide whether to edit or send text in the composer.

You can disable or remove the extension in Chrome, and you can change its site access and optional permissions there. Text that was copied remains in the system clipboard according to the operating system and other applications. This policy does not control that clipboard history.

If Paste cannot make the dot composer accept the text as a draft, the extension restores the previous composer text and tells you to use Ctrl+V. It does not report that paste as successful.

## Sharing

The extension does not sell user data, share it for advertising, use it for unrelated purposes, or use it to determine creditworthiness or lending eligibility. It has no advertising or analytics trackers and does not load remote code.

ChatGPT is operated by OpenAI. Your use of ChatGPT is subject to OpenAI's policies.

This policy describes the extension. A visit to a website, GitHub, or a support message is handled by that service separately. The Chrome Web Store lists `connect.geniusbrain@gmail.com` as the developer email. Questions about this policy can also be sent through the public repository: https://github.com/Christina0922/gpt_dot_copy

## Changes

This policy will be updated if the extension's data practices change. Any new data handling must be disclosed, and any required consent obtained, before it begins.
