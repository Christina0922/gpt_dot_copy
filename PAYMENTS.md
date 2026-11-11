# Payments

Dot Copy Paste does not contact a payment provider in version 0.2.4. The purchase button says the sale is in preparation and does not open a payment page.

Another extension in the same workspace, AI Status Monitor, uses Paddle for a different one-time product priced in USD. That product, price, webhook, and license host are not reused here. This repository has no Paddle product for a one-time KRW 4,900 export.

The intended provider is Paddle Billing, because that is the payment system already operated for the other product. It is not connected. No Paddle account, product, or price was created for this extension.

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
