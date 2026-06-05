/**
 * Sundial v2 — Intake API
 *
 * POST /api/intake
 *   - Receives intake JSON from the wizard
 *   - Evaluates gate rules against current admin config
 *   - If passes: launches Aurora mock pipeline async
 *   - If fails: saves session as "gate_failed"
 *
 * The pipeline runs asynchronously — client polls /api/intake/[sessionId]/status
 * for progress and the final proposal URL.
 *
 * TODO: In production, replace in-memory store with Supabase.
 *       Replace runFullAuroraPipeline with real Aurora API calls.
 *       Add rate limiting (e.g. Upstash Ratelimit).
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { waitUntil } from "@vercel/functions";
import type { Intake, SundialSession } from "@/lib/types";
import { evaluateGate } from "@/lib/gate";
import { getGateConfig, setSession, updateSession, getTodaySpendUsd, getMonthSpendUsd } from "@/lib/store";
import { runFullAuroraPipeline } from "@/lib/aurora-mock";

// The Aurora pipeline takes 5-15 seconds. The default Vercel function
// timeout (10s on Hobby) will kill it mid-flight. Bump to the max allowed
// on the current plan so waitUntil has time to finish.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Intake;

    // Basic validation
    if (!body.session_id || !body.email) {
      return NextResponse.json(
        { success: false, error: "Invalid intake data: session_id and email are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const sessionId = body.session_id || uuidv4();

    // Load current gate config
    const gateConfig = await getGateConfig();

    // Check current credit usage for cap enforcement
    const [todaySpend, monthSpend] = await Promise.all([
      getTodaySpendUsd(),
      getMonthSpendUsd(),
    ]);

    // Evaluate gate
    const gateEval = evaluateGate(body, gateConfig, todaySpend, monthSpend);

    // Initialize session record
    const session: SundialSession = {
      id: sessionId,
      intake: body,
      gate_evaluation: gateEval,
      gate_config_version: gateConfig.version,
      status: gateEval.should_trigger_aurora ? "designing" : "gate_failed",
      created_at: now,
      updated_at: now,
    };

    // Save session immediately so status polling works right away
    await setSession(session);

    if (!gateEval.should_trigger_aurora) {
      // Gate failed — save lead for manual follow-up
      return NextResponse.json({
        success: true,
        session_id: sessionId,
        status: "gate_failed",
        passed_gate: false,
        gate_evaluation: gateEval,
        message: gateEval.reason,
      });
    }

    // Gate passed — run Aurora pipeline in the background.
    // waitUntil keeps the serverless function alive after the response is
    // sent until the promise settles, so the pipeline actually finishes
    // instead of being killed when the response goes out.
    waitUntil(runAuroraPipelineAsync(sessionId, body));

    return NextResponse.json({
      success: true,
      session_id: sessionId,
      status: "designing",
      passed_gate: true,
      gate_evaluation: gateEval,
      message: "Gate passed — Aurora design pipeline started",
    });

  } catch (err) {
    console.error("[intake POST] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Fire-and-forget Aurora pipeline.
 * Runs after the API response is sent.
 * Updates the session in the store as pipeline progresses.
 *
 * TODO: In production, use a background job queue (e.g. Inngest, Trigger.dev)
 *       instead of a Promise fire-and-forget pattern.
 */
async function runAuroraPipelineAsync(sessionId: string, intake: Intake) {
  try {
    const result = await runFullAuroraPipeline(
      intake,
      (status, message) => {
        // Fire-and-forget progress update — don't block the pipeline on DB writes.
        // Errors here are non-fatal: the final updateSession call below records
        // the terminal state.
        updateSession(sessionId, {
          status: status as SundialSession["status"],
          error_message: undefined,
        }).catch((e) =>
          console.error(`[session ${sessionId}] progress update failed:`, e)
        );
        console.log(`[session ${sessionId}] ${status}: ${message}`);
      }
    );

    // Pipeline complete — update session with all results
    await updateSession(sessionId, {
      aurora_project: result.project,
      aurora_design: result.design,
      aurora_pricing: result.pricing,
      aurora_financing: result.financing,
      aurora_proposal: result.proposal,
      status: "complete",
      proposal_url: result.proposal.shareable_url,
      error_message: undefined,
    });

    console.log(`[session ${sessionId}] Pipeline complete. Proposal: ${result.proposal.shareable_url}`);

  } catch (err) {
    console.error(`[session ${sessionId}] Pipeline failed:`, err);
    await updateSession(sessionId, {
      status: "error",
      error_message: err instanceof Error ? err.message : "Aurora pipeline failed",
    }).catch((e) =>
      console.error(`[session ${sessionId}] error-state write failed:`, e)
    );
  }
}
