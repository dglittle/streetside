// Admin mode via "magic link".
//
// A link like  streetsi.de/#k=THE_SECRET  drops THE_SECRET into localStorage and
// immediately scrubs the fragment from the URL/history, so the address bar just
// shows the plain site. With a stored key, admin controls appear. Every write
// goes to the `admin-action` Edge Function, which verifies the key SERVER-SIDE —
// so the key in localStorage is a credential, not a security boundary by itself.

import { supabase, isConfigured } from "./supabase.js";

const STORAGE_KEY = "streetside_admin_key";

/** Read #k=... from the URL, store it, and strip it from history. */
export function captureKeyFromHash() {
  const hash = window.location.hash || "";
  const m = hash.match(/(?:^#|&)k=([^&]+)/);
  if (m) {
    const key = decodeURIComponent(m[1]);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* private mode etc. — admin just won't persist */
    }
    // Remove the fragment so the password isn't visible / in history.
    const clean = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", clean);
  }
}

export function getKey() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function isAdmin() {
  return Boolean(getKey());
}

export function logout() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const FUNCTION_NAME = "admin-action";

/** Call the Edge Function with the stored key attached as `password`. */
async function callAdmin(action, body = {}) {
  if (!isConfigured) throw new Error("Supabase not configured");
  const password = getKey();
  if (!password) throw new Error("Not in admin mode");

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action, password, ...body },
  });
  if (error) {
    // Surface the server's message (e.g. Unauthorized) when available.
    let msg = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function deletePiece(id) {
  return callAdmin("delete", { id });
}

export async function createPiece({ title, description, suggested_amount, payment_link, file }) {
  let image_path = null;

  if (file) {
    // 1) Ask the function for a short-lived signed upload URL (write is gated server-side).
    const { path, token } = await callAdmin("upload-url", { filename: file.name });
    // 2) Upload the bytes directly to Storage using that one-time token.
    const { error: upErr } = await supabase.storage
      .from("art-images")
      .uploadToSignedUrl(path, token, file);
    if (upErr) throw new Error("Image upload failed: " + upErr.message);
    image_path = path;
  }

  // 3) Create the row (function verifies the key again and writes via service_role).
  return callAdmin("create", {
    title,
    description,
    suggested_amount,
    payment_link,
    image_path,
  });
}
