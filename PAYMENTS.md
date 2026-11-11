# Payments

Dot Copy Paste does not contact a payment provider in version 0.2.4. The purchase button says the sale is in preparation and does not open a payment page.

Another extension in the same workspace, AI Status Monitor, uses Paddle for a different one-time product priced in USD. That product, price, webhook, and license host are not reused here. This repository has no Paddle product for a one-time KRW 4,900 export.

The intended provider is Paddle Billing, because that is the payment system already operated for the other product. It is not connected. No Paddle account, product, or price was created for this extension.

Official Paddle documentation checked on November 11, 2026:

- [Supported currencies](https://developer.paddle.com/concepts/sell/supported-currencies) lists `KRW` as a payment currency with 0 decimal places and a minimum charge of 980. A catalog amount of 4900 is above that minimum.
- [Localize prices](https://developer.paddle.com/build/products/offer-localized-pricing/) says checkout chooses a country price override before automatic conversion. A Korea override of 4900 `KRW` is how a buyer in Korea would be charged that catalog amount instead of a converted price.
- The same currencies page does not list `KRW` as a payout or balance currency. Paddle can charge the buyer in won and pay the seller in USD, EUR, GBP, AUD, or CAD.
- The charged checkout total can still differ from 4900 when tax is exclusive. Paddle's tax mode is an account setting (`inclusive`, `exclusive`, or `location`). The public country table retrieved on this date did not confirm which mode applies to Korea. The price stays 4900 KRW. It is not replaced with a dollar price.

## License server

Use a new Vercel project, not the AI Status Monitor project. `https://ai-status-monitor.vercel.app` responded 200 on November 11, 2026 and belongs to that product. `https://dot-copy-paste.vercel.app` responded 404 and was not serving another product checked here. That hostname is the proposed address for this license server. Do not use `geniusbrain.works`.

Purchase records for a connected server must go to a persistent database on that project. The in-memory store in `server/` is only for automated tests.

## Restore

This product has no account system. Restore is a one-time link sent to the payment email. The server stores a hash of a random single-use token and a short expiry. Opening that link is the proof of mailbox ownership. Typing the email alone does not grant the purchase.

No email sender is connected to this product. `geniusbrain.works` has a Gmail SMTP notifier for site inquiries, and it is not a purchase-login sender for this extension. A connected sale needs a separate transactional email account, a from-address, and these server-only variables:

- `DCP_EMAIL_API_KEY`
- `DCP_EMAIL_FROM`

## When a connection is added

Server-only environment variables:

- `DCP_LICENSE_API_BASE`: public `https` origin of this product's license server
- `DCP_PADDLE_ENV`: `sandbox` or `live`
- `DCP_PADDLE_API_KEY`: server-side Paddle API key
- `DCP_PADDLE_WEBHOOK_SECRET`: server-side webhook signing secret
- `DCP_PADDLE_PRICE_ID`: one-time price id for KRW 4,900
- `DCP_PADDLE_PRODUCT_ID`: product id for `dot-copy-paste-export`

The provider transaction lookup origin in server code is `https://api.paddle.com`. The extension package does not include that origin, a checkout URL, or any of the secret values.

Sale stays closed until the live dot page can prove a full thread, the price and currency are confirmed, and the signed webhook or provider lookup path is verified against that price. A browser success page does not grant Pro.
