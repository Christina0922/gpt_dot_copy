# Payments

Dot Copy Paste does not open a live payment in version 0.2.7. The purchase button says the sale is in preparation and does not open a payment page. The license server is `https://dot-copy-paste.vercel.app`. It is a separate Vercel project named `dot-copy-paste`. It does not use the AI Status Monitor project or `geniusbrain.works`.

Another extension in the same workspace, AI Status Monitor, uses Paddle for a different one-time product priced in USD. That product, price, webhook, and license host are not reused here. This repository has no Paddle product for a one-time KRW 4,900 export.

The intended provider is Paddle Billing, because that is the payment system already operated for the other product. It is not connected. No Paddle account, product, or price was created for this extension.

Official Paddle documentation checked on November 11, 2026:

- [Supported currencies](https://developer.paddle.com/concepts/sell/supported-currencies) lists `KRW` as a payment currency with 0 decimal places and a minimum charge of 980. A catalog amount of 4900 is above that minimum.
- [Localize prices](https://developer.paddle.com/build/products/offer-localized-pricing/) says checkout chooses a country price override before automatic conversion. A Korea override of 4900 `KRW` is how a buyer in Korea would be charged that catalog amount instead of a converted price.
- The same currencies page does not list `KRW` as a payout or balance currency. Paddle can charge the buyer in won and pay the seller in USD, EUR, GBP, AUD, or CAD.
- The charged checkout total can still differ from 4900 when tax is exclusive. Paddle's tax mode is an account setting (`inclusive`, `exclusive`, or `location`). The public country table retrieved on this date did not confirm which mode applies to Korea. The price stays 4900 KRW. It is not replaced with a dollar price.

## License server

`https://dot-copy-paste.vercel.app` is assigned to the new `dot-copy-paste` project. A purchase account created there was still present after a redeploy. The database is a separate Neon Postgres resource named `dcp-license`, connected only to this project. The in-memory store in `server/` is only for automated tests.

No Paddle Sandbox product or price exists for this extension yet. The server has no Paddle API key, so it did not create one and did not change the AI Status Monitor product. Until a sandbox checkout is opened, the tax-inclusive total charged to a buyer in Korea remains unverified. The catalog amount stays 4900 KRW.

## Restore

This product has no account system. Restore is a one-time link sent to the payment email. The server stores a hash of a random single-use token and a short expiry. Opening that link is the proof of mailbox ownership. Typing the email alone does not grant the purchase.

The restore link is implemented. It expires in 15 minutes and can be used once. Opening it does not create a payment. Mail is sent with SMTP through Nodemailer, not with an external mail HTTP API. Gmail is the default SMTP host. The Gmail app password is an SMTP password, not an API key, and the server does not read `DCP_EMAIL_API_KEY`.

No restore message has been sent or received. The app password from another product is not copied. Add these server-only variables on the `dot-copy-paste` project:

- `DCP_EMAIL_FROM`: the mailbox that sends the link
- `DCP_EMAIL_SMTP_PASSWORD`: the SMTP password or Gmail app password for that mailbox
- `DCP_EMAIL_SMTP_HOST`: optional, default `smtp.gmail.com`
- `DCP_EMAIL_SMTP_PORT`: optional, default `465`

## When a connection is added

Server-only environment variables:

- `DCP_LICENSE_API_BASE`: public `https` origin of this product's license server
- `DCP_PADDLE_ENV`: `sandbox` or `live`
- `DCP_PADDLE_API_KEY`: server-side Paddle API key
- `DCP_PADDLE_WEBHOOK_SECRET`: server-side webhook signing secret
- `DCP_PADDLE_PRICE_ID`: one-time price id for KRW 4,900
- `DCP_PADDLE_PRODUCT_ID`: product id for `dot-copy-paste-export`

Subscribe the sandbox notification destination to `transaction.completed`, `adjustment.created`, and `adjustment.updated`. Do not subscribe to `transaction.refunded`. A refund removes access only when the adjustment action is `refund`, the status is `approved`, the currency matches, and the adjustment is for this product. `pending_approval` and `rejected` do not remove access. A partial refund keeps the purchase. A full refund, or partial refunds that add up to the full KRW 4900, removes it. An older notice does not overwrite a newer one. Live sale still needs a separate live product, API key, webhook secret, and price check.

The provider transaction lookup origin in server code is `https://api.paddle.com`. The extension package does not include that origin, a checkout URL, or any of the secret values. The setup tool calls only `https://sandbox-api.paddle.com`. A live key stops the tool before any request, including a live API request.

## Rollback

Before a production deploy, `GET https://dot-copy-paste.vercel.app/api/health` should report `sale: preparing` and `database: postgres`. After the deploy, check the same endpoint again. Sale stays `preparing`. To return to the previous server build, redeploy that deployment URL with `vercel redeploy <previous-production-url> --target production`. Do not delete or replace the database environment variables while rolling back.

## Mail password

The server reads `DCP_EMAIL_SMTP_HOST` (default `smtp.gmail.com`), `DCP_EMAIL_SMTP_PORT` (default `465`, implicit TLS), `DCP_EMAIL_FROM`, and `DCP_EMAIL_SMTP_PASSWORD`. It does not read `DCP_EMAIL_API_KEY`. If the password is missing, add `DCP_EMAIL_SMTP_PASSWORD` for Production and Preview at Vercel → the `dot-copy-paste` project → Settings → Environment Variables. The value is the Gmail app password from Google Account → Security → 2-Step Verification → App passwords. Do not paste it into chat. No restore message is sent unless a test recipient was named.

Sale stays closed until the live dot page can prove a full thread, the price and currency are confirmed, and the signed webhook or provider lookup path is verified against that price. A browser success page does not grant Pro.
