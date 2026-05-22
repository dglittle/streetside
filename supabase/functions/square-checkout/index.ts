// Supabase Edge Function: square-checkout
//
// Creates a Square hosted checkout (Payment Link) on the fly for a donation,
// with the donor-chosen amount and shipping-address collection turned on. One
// function works for any piece — no per-piece links to manage.
//
// Flow: browser POSTs { amount, pieceTitle? } -> we call Square's
// CreatePaymentLink (quick_pay + ask_for_shipping_address) -> return the hosted
// checkout URL -> browser redirects the donor there. Card + address are handled
// entirely on Square's secure page.
//
// Secrets (set via `supabase secrets set ...`):
//   SQUARE_ACCESS_TOKEN   - sandbox or production access token
//   SQUARE_LOCATION_ID    - the location to attribute payments to
//   SQUARE_ENV            - "sandbox" (default) or "production"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SQUARE_VERSION = "2025-01-23"; // Square-Version header (pin a known-good API version)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN");
  const LOCATION = Deno.env.get("SQUARE_LOCATION_ID");
  const ENV = (Deno.env.get("SQUARE_ENV") ?? "sandbox").toLowerCase();
  if (!TOKEN || !LOCATION) return json({ error: "Square not configured" }, 500);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Amount comes in as dollars (number or string); Square wants integer cents.
  const dollars = Number(payload.amount);
  if (!Number.isFinite(dollars) || dollars < 1) {
    return json({ error: "Please enter an amount of at least $1." }, 400);
  }
  const cents = Math.round(dollars * 100);

  const title = String(payload.pieceTitle ?? "").trim();
  const itemName = title ? `Tip for "${title}"` : "Tip for the artist";

  const base = ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

  const body = {
    idempotency_key: crypto.randomUUID(),
    quick_pay: {
      name: itemName,
      price_money: { amount: cents, currency: "USD" },
      location_id: LOCATION,
    },
    checkout_options: {
      ask_for_shipping_address: true,
      redirect_url: payload.redirectUrl ? String(payload.redirectUrl) : undefined,
    },
  };

  const res = await fetch(`${base}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      "Square-Version": SQUARE_VERSION,
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail ?? "Square checkout failed.";
    return json({ error: msg }, 400);
  }

  return json({ ok: true, url: data.payment_link?.url });
});
