// Supabase Edge Function: free-request
//
// Handles a $0 "request" (Square can't process $0). Saves the shipping details
// to the `requests` table and emails the seller — so a free request feels like a
// Square order notification.
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-provided)
//   RESEND_API_KEY    - from https://resend.com (free tier)
//   NOTIFY_EMAIL      - where to send request notifications (the seller)
//   FROM_EMAIL        - verified sender, e.g. "Streetside <onboarding@resend.dev>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function esc(s: unknown) {
  return String(s ?? "").replace(/[<>&]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Server not configured" }, 500);

  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Validate the essentials.
  const required = ["name", "email", "address1", "city", "state", "postal", "country"];
  for (const f of required) {
    if (!String(p[f] ?? "").trim()) return json({ error: `Missing ${f}` }, 400);
  }

  const row = {
    piece_id: p.pieceId ? String(p.pieceId) : null,
    piece_title: String(p.pieceTitle ?? ""),
    name: String(p.name),
    email: String(p.email),
    address1: String(p.address1),
    address2: String(p.address2 ?? ""),
    city: String(p.city),
    state: String(p.state),
    postal: String(p.postal),
    country: String(p.country),
    note: String(p.note ?? ""),
  };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.from("requests").insert(row);
  if (error) return json({ error: error.message }, 400);

  // Best-effort email notification (don't fail the request if email is down).
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Streetside <onboarding@resend.dev>";

  if (RESEND_API_KEY && NOTIFY_EMAIL) {
    const html = `
      <h2>New free request${row.piece_title ? ` — ${esc(row.piece_title)}` : ""}</h2>
      <p><strong>${esc(row.name)}</strong> (${esc(row.email)})</p>
      <p>
        ${esc(row.address1)}${row.address2 ? "<br>" + esc(row.address2) : ""}<br>
        ${esc(row.city)}, ${esc(row.state)} ${esc(row.postal)}<br>
        ${esc(row.country)}
      </p>
      ${row.note ? `<p><em>Note:</em> ${esc(row.note)}</p>` : ""}`;
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [NOTIFY_EMAIL],
          reply_to: row.email,
          subject: `Streetside request${row.piece_title ? `: ${row.piece_title}` : ""}`,
          html,
        }),
      });
    } catch (_e) {
      // Saved to DB regardless; ignore email errors.
    }
  }

  return json({ ok: true });
});
