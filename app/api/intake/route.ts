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
import type { Intake, SundialSession } from "@/lib/types";
import { evaluateGate } from "@/lib/gate";
import { getGateConfig, setSession, updateSession, getTodaySpendUsd, getMonthSpendUsd } from "@/lib/store";
import { runFullAuroraPipeline } from "@/lib/aurora-mock";

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
    const gateConfig = getGateConfig();

    // Check current credit usage for cap enforcement
    const todaySpend = getTodaySpendUsd();
    const monthSpend = getMonthSpendUsd();

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
    // TODO: Replace with Supabase insert
    setSession(session);

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

    // Gate passed — run Aurora pipeline asynchronously
    // We fire and forget so the response returns immediately
    // The client polls /api/intake/[sessionId]/status for updates
    runAuroraPipelineAsync(sessionId, body);

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
        // Update session status for polling
        // TODO: With Supabase, this would update the DB row + trigger realtime
        updateSession(sessionId, {
          status: status as SundialSession["status"],
          // Store progress message in error_message slot temporarily
          // (repurposed as "progress" during pipeline — cleared on completion)
          error_message: undefined,
        });
        console.log(`[session ${sessionId}] ${status}: ${message}`);
      }
    );

    // Pipeline complete — update session with all results
    updateSession(sessionId, {
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
    updateSession(sessionId, {
      status: "error",
      error_message: err instanceof Error ? err.message : "Aurora pipeline failed",
    });
  }
}
