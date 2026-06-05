/**
 * Sundial v2 — Proposal Lookup API
 *
 * GET /api/proposal/[designId]
 *   Finds the session containing this design ID and returns full session data
 *   for rendering the proposal page.
 *
 * TODO: Replace with Supabase query:
 *   SELECT * FROM sundial_sessions WHERE aurora_design->>'id' = $1
 */

import { NextRequest, NextResponse } from "next/server";
import { getAllSessions } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ designId: string }> }
) {
  const { designId } = await params;

  if (!designId) {
    return NextResponse.json({ error: "Design ID required" }, { status: 400 });
  }

  // Search sessions for one that contains this design ID
  // TODO: Replace with efficient DB lookup — this linear scan doesn't scale
  const sessions = getAllSessions();
  const session = sessions.find(
    (s) => s.aurora_design?.id === designId || s.aurora_proposal?.design_id === designId
  );

  if (!session) {
    return NextResponse.json(
      { error: "Proposal not found" },
      { status: 404 }
    );
  }

  if (session.status !== "complete") {
    return NextResponse.json(
      { error: `Proposal not ready (status: ${session.status})` },
      { status: 202 }
    );
  }

  return NextResponse.json({ success: true, session });
}
