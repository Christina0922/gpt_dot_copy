# Chrome Web Store listing draft (English)

Status: local draft, superseded by the live Chrome Web Store listing.  
Live listing (0.1.0, updated 19 October 2026): https://chromewebstore.google.com/detail/dot-copy-paste/ndpennnmcicncopijfkmplbmkndkcdej  
The live overview starts with “Test build. Buttons stay hidden until a ChatGPT Dot chat page is verified.” That store text is the public listing. Do not treat the paragraphs below as the current store copy.  
Version: 0.2.0

This extension is not an official OpenAI product and is not affiliated with OpenAI. No user counts, performance claims, or partnership claims are included because none were verified.

## Listing text limited to the verified scope

Dot Copy Paste 0.2.0 is an independently developed Chrome test build. The Dot conversation screen has not been verified, so this version does not show copy or paste buttons on that screen.

The popup can turn the feature on or off, choose the language, set the default copy format (text or Markdown), and show the version. Clipboard reading is an optional permission and is requested only after the popup explains its purpose.

## Permission justifications (for the submission form)

- `storage`: Stores only the on/off switch, display language, and default copy format (text or Markdown) in this browser. Conversation content is never stored.
- `clipboardRead` (optional): Optional. Only if you allow it, the clipboard's plain text is read once, at the moment you click Paste, and placed in the Dot input field. Copy keeps working if you decline or revoke it.
- chatgpt.com site access: Limits the buttons to chatgpt.com. They run only after a Dot conversation screen is confirmed, and no data is sent anywhere.

## Claims that must not be used yet

- Copies Dot messages
- Pastes into the Dot input
- Dot support is complete, or the release is ready
- Official ChatGPT feature or partnership
- Unverified user counts or performance claims

## Still required before submission

- A public privacy-policy URL. None exists now
- Screenshots of the real Dot conversation. None exist now
- A small promotional image. None exists now
- Verification on a signed-in Dot conversation for copy, paste, and permission allow, deny, and revoke
- Trademark review
- A developer account and a final submission ZIP review

The test ZIP is not a submission build:

`D:\1000_b_project\gpt_dot_copy\dist\Dot-Copy-Paste-0.2.0-test.zip`
