"use client";

/**
 * Sundial v2 — Supabase Browser Client
 *
 * Lives in the BROWSER (the admin dashboard) and subscribes to Realtime
 * changes on sundial_sessions, aurora_credit_usage, and gate_configs.
 *
 * Why anon key in the browser is OK today:
 *   - The admin page is password-gated via /api/admin/auth.
 *   - RLS is still disabled on these tables and access is functionally
 *     the same as the server today (no security regression).
 *
 * TODO: When end-user auth lands, switch this to a publishable key with
 *       RLS-protected SELECT-only policies and never let it write.
 *
 * Env vars (must be NEXT_PUBLIC_* to be bundled into the client):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Cache the client on window so HMR + repeated mounts don't churn websockets.
type WindowWithCache = Window & { __sundialSupabaseBrowser?: SupabaseClient };

export function getBrowserSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!URL || !KEY) {
    console.warn(
      "[supabase-browser] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — realtime disabled."
    );
    return null;
  }
  const w = window as WindowWithCache;
  if (!w.__sundialSupabaseBrowser) {
    w.__sundialSupabaseBrowser = createClient(URL, KEY, {
      auth: { persistSession: false }, // admin auth is cookie-based, not Supabase
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return w.__sundialSupabaseBrowser;
}
