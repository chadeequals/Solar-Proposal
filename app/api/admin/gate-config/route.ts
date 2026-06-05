/**
 * Sundial v2 — Admin Gate Config API
 *
 * GET  /api/admin/gate-config  — Returns current gate config
 * POST /api/admin/gate-config  — Saves updated gate config (versions it)
 *
 * Auth: simple token check from ADMIN_TOKEN env var
 * TODO: Replace with proper auth (NextAuth, Clerk, or Supabase Auth)
 */

import { NextRequest, NextResponse } from "next/server";
import type { GateConfig } from "@/lib/types";
import { getGateConfig, setGateConfig } from "@/lib/store";

// Simple auth check — in production replace with a real auth middleware
function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token") ??
    req.cookies.get("sundial_admin")?.value;
  const expected = process.env.ADMIN_TOKEN ?? "sundial2026";
  return token === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getGateConfig();
  return NextResponse.json({ success: true, config });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as Partial<GateConfig>;

    // Validate required fields
    if (typeof body.aurora_enabled !== "boolean") {
      return NextResponse.json(
        { error: "aurora_enabled (boolean) is required" },
        { status: 400 }
      );
    }

    const currentConfig = await getGateConfig();
    const updated = await setGateConfig({
      ...currentConfig,
      ...body,
      // Ensure version is incremented by setGateConfig
    });

    console.log(`[admin] Gate config updated to v${updated.version}`);

    return NextResponse.json({ success: true, config: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid config JSON", details: String(err) },
      { status: 400 }
    );
  }
}
