# Square donations — how it works & setup

Tipping uses **one** Square integration that works for every piece — no per-piece
links to create. When a visitor clicks "Tip the artist":

1. A modal lets them choose an amount ($5/$10/$20 or custom).
2. The browser calls the `square-checkout` Edge Function.
3. The function calls Square's **Create Payment Link** API (`quick_pay` +
   `ask_for_shipping_address: true`) and returns a hosted checkout URL.
4. The donor is redirected to Square's secure page, where they pay **and enter a
   shipping address**. Card data never touches our site.

Payments + shipping addresses appear in your **Square Dashboard**.

## Secrets (set via the Supabase CLI — never committed)

```bash
supabase secrets set \
  SQUARE_ACCESS_TOKEN=... \
  SQUARE_LOCATION_ID=... \
  SQUARE_ENV=sandbox            # or "production"
supabase functions deploy square-checkout
```

- **SQUARE_ACCESS_TOKEN** — from https://developer.squareup.com/apps → your app → Credentials (Sandbox or Production tab).
- **SQUARE_LOCATION_ID** — from the same app, under Locations.
- **SQUARE_ENV** — `sandbox` for testing, `production` for real money.

## Testing in sandbox

Use Square's test card on the checkout page:

- Card: `4111 1111 1111 1111`
- Expiry: any future date · CVV: `111` · ZIP: any (e.g. `94103`)

No real money moves. Test payments show in your **Sandbox** dashboard.

## Going live (production)

1. In the Square Developer dashboard, switch your app to the **Production** tab
   and copy the **Production** access token + location ID.
2. Re-set the secrets with those values and `SQUARE_ENV=production`, then redeploy:
   ```bash
   supabase secrets set SQUARE_ACCESS_TOKEN=<prod> SQUARE_LOCATION_ID=<prod> SQUARE_ENV=production
   supabase functions deploy square-checkout
   ```
3. Do one small real donation to confirm, then refund it from the dashboard.

## Notes
- The function pins `Square-Version: 2025-01-23`. Bump it when you adopt newer API features.
- `ask_for_shipping_address: true` makes the order fulfillment type SHIPMENT and
  collects the address on Square's page.
