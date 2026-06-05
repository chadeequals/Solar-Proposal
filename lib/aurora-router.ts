/**
 * Sundial v2 — Aurora Routing Layer
 *
 * Single entry point for the Aurora pipeline. Decides per-session
 * whether to call the real Aurora API or the mock client, then runs
 * the full pipeline. On any per-call failure in real mode, falls back
 * to the mock equivalent so proposals always ship.
 *
 * The session's final mode is:
 *   - "mock"    : routed to mock from the start (default)
 *   - "real"    : all calls hit real Aurora successfully
 *   - "partial" : real was attempted but at least one call fell back
 */

import type {
  Intake,
  GateConfig,
  AuroraProject,
  AuroraDesignSummary,
  AuroraPricing,
  AuroraFinancingOption,
  AuroraWebProposal,
  AuroraMode,
  AuroraApiCallType,
} from "./types";
import * as mock from "./aurora-mock";
import * as real from "./aurora-real";
import { isRealAuroraConfigured } from "./aurora-real";

// ─────────────────────────────────────────────
// ROUTING DECISION
// ─────────────────────────────────────────────

export type RoutingDecision = {
  use_real: boolean;
  reason: string;
};

/**
 * Determine whether a given session should hit real Aurora.
 *
 * Rules (in priority order):
 *   1. Master switch off       → mock
 *   2. Env vars not configured → mock (with warn)
 *   3. Session ID on allow-list → real
 *   4. Email on allow-list     → real (case-insensitive)
 *   5. Default                  → mock
 */
export function decideRouting(
  intake: Intake,
  config: GateConfig
): RoutingDecision {
  if (!config.aurora_real_enabled) {
    return { use_real: false, reason: "Real Aurora master switch is OFF" };
  }
  if (!isRealAuroraConfigured()) {
    return {
      use_real: false,
      reason:
        "AURORA_API_KEY / AURORA_TENANT_ID not set on this deployment",
    };
  }

  const sessionMatch = (config.aurora_allow_list_session_ids ?? []).includes(
    intake.session_id
  );
  if (sessionMatch) {
    return { use_real: true, reason: "Session ID is on the allow-list" };
  }

  const emailLower = intake.email.trim().toLowerCase();
  const emailMatch = (config.aurora_allow_list_emails ?? [])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(emailLower);
  if (emailMatch) {
    return { use_real: true, reason: `Email ${emailLower} is on the allow-list` };
  }

  return {
    use_real: false,
    reason: "Session does not match any allow-list entry",
  };
}

// ─────────────────────────────────────────────
// PIPELINE
// ─────────────────────────────────────────────

export type RoutedPipelineResult = {
  project: AuroraProject;
  design: AuroraDesignSummary;
  pricing: AuroraPricing;
  financing: AuroraFinancingOption[];
  proposal: AuroraWebProposal;
  mode: AuroraMode;          // "mock" | "real" | "partial"
  fallback_calls: string[];  // which AuroraApiCallType names fell back
  routing_reason: string;    // human-readable reason for the decision
};

/**
 * Run a single Aurora call with auto-fallback. Used in real mode only.
 * Returns the result plus a "did_fallback" flag so the router can
 * accumulate the partial-mode state.
 */
async function tryRealOrFallback<T>(
  callType: AuroraApiCallType,
  realFn: () => Promise<T>,
  mockFn: () => Promise<T>
): Promise<{ value: T; did_fallback: boolean }> {
  try {
    const value = await realFn();
    return { value, did_fallback: false };
  } catch (e) {
    console.error(
      `[aurora-router] Real ${callType} failed, falling back to mock:`,
      (e as Error).message
    );
    const value = await mockFn();
    return { value, did_fallback: true };
  }
}

/**
 * Routed full pipeline. Drop-in replacement for
 * aurora-mock.runFullAuroraPipeline, but adds mode + fallback_calls
 * to the result.
 */
export async function runRoutedAuroraPipeline(
  intake: Intake,
  config: GateConfig,
  onProgress: (status: string, message: string) => void
): Promise<RoutedPipelineResult> {
  const decision = decideRouting(intake, config);
  const fallbackCalls: string[] = [];

  // ── MOCK PATH ────────────────────────────────────────────
  if (!decision.use_real) {
    const r = await mock.runFullAuroraPipeline(intake, onProgress);
    return {
      ...r,
      mode: "mock",
      fallback_calls: [],
      routing_reason: decision.reason,
    };
  }

  // ── REAL PATH (with per-call fallback) ───────────────────
  onProgress("designing", "Creating Aurora project...");
  const projectR = await tryRealOrFallback(
    "create_project",
    () => real.createProject(intake),
    () => mock.createProject(intake)
  );
  if (projectR.did_fallback) fallbackCalls.push("create_project");
  const project = projectR.value;

  onProgress("designing", "Analyzing rooftop via satellite imagery...");
  const siteR = await tryRealOrFallback(
    "ai_site_model",
    () => real.requestAiSiteModel(project.id, intake.session_id),
    () => mock.requestAiSiteModel(project.id, intake.session_id)
  );
  if (siteR.did_fallback) fallbackCalls.push("ai_site_model");

  onProgress("designing", "Generating optimal solar layout...");
  const designR = await tryRealOrFallback(
    "auto_designer",
    () =>
      real.runAutoDesigner(
        project.id,
        intake.session_id,
        intake.monthly_bill_usd
      ),
    () =>
      mock.runAutoDesigner(
        project.id,
        intake.session_id,
        intake.monthly_bill_usd
      )
  );
  if (designR.did_fallback) fallbackCalls.push("auto_designer");
  const design = designR.value;

  onProgress("design_ready", "Calculating system pricing...");
  const pricingR = await tryRealOrFallback(
    "get_pricing",
    () => real.getPricing(design, intake.session_id),
    () => mock.getPricing(design, intake.session_id)
  );
  if (pricingR.did_fallback) fallbackCalls.push("get_pricing");
  const pricing = pricingR.value;

  onProgress("design_ready", "Building financing options...");
  const financingR = await tryRealOrFallback(
    "get_financing",
    () =>
      real.getFinancing(
        design,
        pricing,
        intake.session_id,
        intake.monthly_bill_usd
      ),
    () =>
      mock.getFinancing(
        design,
        pricing,
        intake.session_id,
        intake.monthly_bill_usd
      )
  );
  if (financingR.did_fallback) fallbackCalls.push("get_financing");
  const financing = financingR.value;

  onProgress("design_ready", "Generating shareable proposal...");
  const proposalR = await tryRealOrFallback(
    "create_web_proposal",
    () => real.createWebProposal(design, intake.session_id),
    () => mock.createWebProposal(design, intake.session_id)
  );
  if (proposalR.did_fallback) fallbackCalls.push("create_web_proposal");
  const proposal = proposalR.value;

  const mode: AuroraMode = fallbackCalls.length === 0 ? "real" : "partial";

  return {
    project,
    design,
    pricing,
    financing,
    proposal,
    mode,
    fallback_calls: fallbackCalls,
    routing_reason: decision.reason,
  };
}
