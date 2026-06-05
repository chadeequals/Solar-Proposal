/**
 * Sundial v2 — Supabase Client
 *
 * Server-side only. The anon key is safe to use here because:
 *   1. Next.js route handlers run on the server, never in the browser
 *   2. RLS is disabled on these tables (server-only access pattern)
 *   3. The anon key is never embedded in client bundles
 *
 * TODO: when end-user auth is added, switch to a service-role key
 *       on the server and re-enable RLS with policies for the wizard
 *       (write-only, no read) and admin (full read/write with JWT check).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_ANON_KEY."
  );
}

// Cache the client across module reloads using globalThis so we don't churn
// connections in dev mode or serverless cold starts.
const g = globalThis as unknown as { __sundialSupabase?: SupabaseClient };

export const supabase: SupabaseClient =
  g.__sundialSupabase ??
  createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

if (!g.__sundialSupabase) {
  g.__sundialSupabase = supabase;
}
