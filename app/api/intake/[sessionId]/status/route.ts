/**
 * Sundial v2 — Session Status Polling Endpoint
 *
 * GET /api/intake/[sessionId]/status
 *   Returns current session status for frontend polling.
 *   Client polls this every 1-2 seconds after submitting the intake form.
 *
 * Status flow:
 *   intake → designing → design_ready → complete
 *                ↓               ↓           ↓
 *            (polling)       (polling)    → redirect to /proposal/[designId]
 *
 * TODO: Replace with Supabase Realtime subscription for push-based updates
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";

const STATUS_MESSAGES: Record<string, string> = {
  intake: "Submitting your information…",
  designing: "Analyzing your roof with AI satellite imagery…",
  design_ready: "Finalizing your proposal details…",
  complete: "Your proposal is ready!",
  gate_failed: "Processing your request…",
  error: "Something went wrong.",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json(
      { error: "Session ID required" },
      { status: 400 }
    );
  }

  const session = await getSession(sessionId);

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    session_id: session.id,
    status: session.status,
    proposal_url: session.proposal_url,
    error_message: session.error_message,
    progress_message: STATUS_MESSAGES[session.status] ?? "Processing…",
    // Include gate evaluation for the gate_failed state
    gate_evaluation: session.status === "gate_failed" ? session.gate_evaluation : undefined,
  });
}
