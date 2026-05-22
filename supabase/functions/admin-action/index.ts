// Supabase Edge Function: admin-action
//
// The ONLY path that can modify the gallery. It holds the service_role key
// (server-side secret) and an ADMIN_SECRET. The browser sends the password from
// the magic link; we verify it here before doing anything. A snooper reading the
// site's source learns nothing — they never get a write-capable key.
//
// Actions:
//   - "delete":     { id }                      -> delete a piece (and its image)
//   - "create":     { title, description, suggested_amount, payment_link, image_path }
//   - "upload-url": { filename }                -> short-lived signed upload URL for the images bucket
//
// Set these as Function secrets (see DEPLOY.md):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase),
//   ADMIN_SECRET (you choose this — it's the password in the magic link).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "art-images";

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

// Constant-time-ish comparison to avoid trivial timing leaks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!ADMIN_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Server not configured" }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // ---- Auth: verify the password before doing ANYTHING ----
  const pass = String(payload.password ?? "");
  if (!pass || !safeEqual(pass, ADMIN_SECRET)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const action = String(payload.action ?? "");

  try {
    if (action === "delete") {
      const id = String(payload.id ?? "");
      if (!id) return json({ error: "Missing id" }, 400);

      // Look up the row so we can also remove its stored image.
      const { data: row } = await admin
        .from("art_pieces")
        .select("image_path")
        .eq("id", id)
        .maybeSingle();

      const { error } = await admin.from("art_pieces").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);

      if (row?.image_path) {
        await admin.storage.from(BUCKET).remove([row.image_path]);
      }
      return json({ ok: true });
    }

    if (action === "upload-url") {
      const filename = String(payload.filename ?? "upload");
      const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${crypto.randomUUID()}-${safe}`;
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (error) return json({ error: error.message }, 400);
      // Return the path + token; the browser uploads directly with this token.
      return json({ ok: true, path, token: data.token });
    }

    if (action === "create") {
      const title = String(payload.title ?? "").trim();
      if (!title) return json({ error: "Title is required" }, 400);

      const image_path = payload.image_path ? String(payload.image_path) : null;
      const image_url = image_path
        ? admin.storage.from(BUCKET).getPublicUrl(image_path).data.publicUrl
        : payload.image_url
        ? String(payload.image_url)
        : null;

      const { data, error } = await admin
        .from("art_pieces")
        .insert({
          title,
          description: String(payload.description ?? ""),
          suggested_amount: Number(payload.suggested_amount ?? 5) || 5,
          payment_link: String(payload.payment_link ?? ""),
          image_url,
          image_path,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, piece: data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
