import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// `isConfigured` lets the rest of the app fall back to sample data and skip
// realtime when env vars aren't set yet (e.g. first local run).
export const isConfigured = Boolean(url && anonKey && !url.includes("YOUR-PROJECT"));

export const supabase = isConfigured ? createClient(url, anonKey) : null;
