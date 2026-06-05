/**
 * Sundial v2 — Admin Aurora Test Endpoint
 *
 * POST /api/admin/aurora-test
 *   Calls testConnection() on the real Aurora client and returns the result.
 *   Used by the admin UI to verify AURORA_API_KEY / AURORA_TENANT_ID env vars
 *   are correctly configured before flipping the master switch.
 */

import { NextRequest, NextResponse } from "next/server";
import { testConnection, isRealAuroraConfigured } from "@/lib/aurora-real";

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token") ??
    req.cookies.get("sundial_admin")?.value;
  const expected = process.env.ADMIN_TOKEN ?? "sundial2026";
  return token === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = isRealAuroraConfigured();
  if (!configured) {
    return NextResponse.json({
      success: false,
      configured: false,
      message:
        "Aurora env vars not set. Add AURORA_API_KEY and AURORA_TENANT_ID in Vercel and redeploy.",
    });
  }

  try {
    const result = await testConnection();
    return NextResponse.json({
      success: result.ok,
      configured: true,
      ...result,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      configured: true,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
