/**
 * Sundial v2 — Real Aurora Solar API Client
 *
 * Calls the production Aurora Solar REST API. Function signatures
 * mirror lib/aurora-mock.ts exactly so the router can swap freely.
 *
 * Auth & config (env vars):
 *   AURORA_BASE_URL      Defaults to "https://api.aurorasolar.com"
 *   AURORA_API_KEY       Required. Bearer token.
 *   AURORA_TENANT_ID     Required. Tenant UUID for the URL path.
 *   AURORA_API_TIMEOUT_MS  Optional. Per-request timeout (default 30s,
 *                         60s for AI site model since it polls).
 *
 * Reference: https://docs.aurorasolar.com/
 *
 * All functions throw `AuroraApiError` on failure so the router can
 * catch and fall back to mock for that specific call.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  Intake,
  AuroraProject,
  AuroraDesignSummary,
  AuroraPricing,
  AuroraFinancingOption,
  AuroraWebProposal,
  AuroraApiCallType,
} from "./types";
import { logCreditUsage } from "./store";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const BASE_URL =
  process.env.AURORA_BASE_URL?.replace(/\/$/, "") || "https://api.aurorasolar.com";
const DEFAULT_TIMEOUT_MS = Number(process.env.AURORA_API_TIMEOUT_MS) || 30_000;
const AI_SITE_MODEL_TIMEOUT_MS = 90_000; // polling can take up to ~60s

// Real per-call cost estimates (production billing). Update when Aurora
// publishes their final rate card or per-tenant terms.
const REAL_CALL_COSTS: Record<AuroraApiCallType, number> = {
  create_project: 0,
  ai_site_model: 10.0,
  auto_designer: 5.0,
  get_pricing: 1.0,
  get_financing: 1.0,
  create_web_proposal: 1.5,
};

// ─────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────

export class AuroraApiError extends Error {
  status: number;
  endpoint: string;
  bodyExcerpt?: string;
  constructor(message: string, status: number, endpoint: string, body?: string) {
    super(message);
    this.name = "AuroraApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.bodyExcerpt = body ? body.slice(0, 500) : undefined;
  }
}

export class AuroraNotConfiguredError extends Error {
  constructor() {
    super(
      "Real Aurora client called but AURORA_API_KEY and/or AURORA_TENANT_ID are unset."
    );
    this.name = "AuroraNotConfiguredError";
  }
}

// ─────────────────────────────────────────────
// HTTP CORE
// ─────────────────────────────────────────────

export function isRealAuroraConfigured(): boolean {
  return Boolean(process.env.AURORA_API_KEY && process.env.AURORA_TENANT_ID);
}

function requireCreds(): { apiKey: string; tenantId: string } {
  const apiKey = process.env.AURORA_API_KEY;
  const tenantId = process.env.AURORA_TENANT_ID;
  if (!apiKey || !tenantId) throw new AuroraNotConfiguredError();
  return { apiKey, tenantId };
}

async function auroraFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const { apiKey, tenantId } = requireCreds();
  const url = `${BASE_URL}/v2/tenants/${tenantId}${path}`;

  // AbortController gives us a hard timeout even on slow Aurora endpoints.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AuroraApiError(
        `Aurora ${method} ${path} returned ${res.status}`,
        res.status,
        path,
        text
      );
    }

    // Some endpoints (e.g. 202 + Location) may have empty bodies. Be defensive.
    const text = await res.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AuroraApiError(
        `Aurora ${method} ${path} returned non-JSON body`,
        res.status,
        path,
        text
      );
    }
  } catch (e) {
    if (e instanceof AuroraApiError) throw e;
    if ((e as any)?.name === "AbortError") {
      throw new AuroraApiError(
        `Aurora ${method} ${path} timed out after ${timeoutMs}ms`,
        0,
        path
      );
    }
    throw new AuroraApiError(
      `Aurora ${method} ${path} network error: ${(e as Error).message}`,
      0,
      path
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wrap a real Aurora call with credit logging (mode='real') and
 * uniform error handling. Returns the raw result on success; the
 * router decides what to do on throw.
 */
async function realApiCall<T>(
  callType: AuroraApiCallType,
  sessionId: string,
  fn: () => Promise<T>,
  projectId?: string,
  designId?: string
): Promise<T> {
  try {
    const result = await fn();
    logCreditUsage({
      session_id: sessionId,
      call_type: callType,
      cost_usd: REAL_CALL_COSTS[callType],
      project_id: projectId,
      design_id: designId,
      success: true,
      mode: "real",
    }).catch((e) =>
      console.error("[aurora-real] credit log failed:", e)
    );
    return result;
  } catch (e) {
    // Log the failed call too — admin needs to see what's burning money
    // without producing output.
    logCreditUsage({
      session_id: sessionId,
      call_type: callType,
      cost_usd: 0, // Aurora typically doesn't bill failed calls
      project_id: projectId,
      design_id: designId,
      success: false,
      mode: "real",
      error: (e as Error).message,
    }).catch((logErr) =>
      console.error("[aurora-real] error-credit log failed:", logErr)
    );
    throw e;
  }
}

// ─────────────────────────────────────────────
// PUBLIC API — mirrors lib/aurora-mock.ts
// ─────────────────────────────────────────────

/**
 * POST /v2/tenants/{tenant_id}/projects
 * Creates an Aurora project for the customer's property.
 */
export async function createProject(intake: Intake): Promise<AuroraProject> {
  return realApiCall("create_project", intake.session_id, async () => {
    const payload = {
      name: `${intake.first} ${intake.last} — ${intake.street}`,
      customer: {
        first_name: intake.first,
        last_name: intake.last,
        email: intake.email,
        phone: intake.phone,
      },
      property: {
        address: {
          street: intake.street,
          city: intake.city,
          state: intake.state,
          zip: intake.zip,
          country: "US",
        },
        // Lat/lng are optional — Aurora geocodes if missing
        ...(intake.lat && intake.lng
          ? { lat: intake.lat, lng: intake.lng }
          : {}),
      },
      external_id: intake.session_id,
    };

    const raw = await auroraFetch<any>("POST", "/projects", payload);

    // Normalize Aurora's response into our internal AuroraProject shape.
    return {
      id: raw.id ?? raw.project?.id ?? uuidv4(),
      name: raw.name ?? payload.name,
      customer_name: `${intake.first} ${intake.last}`,
      customer_email: intake.email,
      customer_phone: intake.phone,
      property_address: {
        street: intake.street,
        city: intake.city,
        state: intake.state,
        zip: intake.zip,
        lat: raw.property?.lat ?? intake.lat,
        lng: raw.property?.lng ?? intake.lng,
      },
      created_at: raw.created_at ?? new Date().toISOString(),
      status: (raw.status ?? "active") as "active",
    };
  });
}

/**
 * POST /v2/tenants/{tenant_id}/projects/{project_id}/site-models
 * Then poll GET .../site-models/{id} until status === "complete".
 *
 * Aurora's AI Site Model is asynchronous — Aurora returns a job ID
 * and the client polls until the analysis (roof planes, shading,
 * usable area) is done. Typical real-world latency: 20-60s.
 */
export async function requestAiSiteModel(
  projectId: string,
  sessionId: string
): Promise<{ id: string; status: "processing" | "complete" }> {
  return realApiCall(
    "ai_site_model",
    sessionId,
    async () => {
      // 1. Kick off the job
      const job = await auroraFetch<any>(
        "POST",
        `/projects/${projectId}/site-models`,
        { type: "ai" }
      );

      const jobId = job.id ?? job.site_model?.id;
      if (!jobId) {
        throw new AuroraApiError(
          "Aurora site-model response missing job id",
          200,
          `/projects/${projectId}/site-models`
        );
      }

      // 2. Poll. Aurora docs recommend ~2s cadence; we go a hair slower
      //    to be polite. Cap total wait at AI_SITE_MODEL_TIMEOUT_MS.
      const deadline = Date.now() + AI_SITE_MODEL_TIMEOUT_MS;
      let status: string = job.status ?? "processing";

      while (status !== "complete" && status !== "failed") {
        if (Date.now() > deadline) {
          throw new AuroraApiError(
            `AI site model polling exceeded ${AI_SITE_MODEL_TIMEOUT_MS}ms`,
            0,
            `/projects/${projectId}/site-models/${jobId}`
          );
        }
        await new Promise((r) => setTimeout(r, 2500));
        const poll = await auroraFetch<any>(
          "GET",
          `/projects/${projectId}/site-models/${jobId}`
        );
        status = poll.status ?? "processing";
      }

      if (status === "failed") {
        throw new AuroraApiError(
          "Aurora AI site model failed",
          422,
          `/projects/${projectId}/site-models/${jobId}`
        );
      }

      return { id: jobId, status: "complete" as const };
    },
    projectId,
    undefined
  );
}

/**
 * POST /v2/tenants/{tenant_id}/designs
 * Runs the Auto Designer with auto_design=true and a target offset.
 * Returns a normalized design summary mirroring the mock.
 */
export async function runAutoDesigner(
  projectId: string,
  sessionId: string,
  monthlyBillUsd: number,
  targetOffsetPct = 100
): Promise<AuroraDesignSummary> {
  return realApiCall(
    "auto_designer",
    sessionId,
    async () => {
      const payload = {
        project_id: projectId,
        auto_design: true,
        target_offset_pct: targetOffsetPct,
        // Hint Aurora at the household consumption so it sizes correctly
        // when the AI site model doesn't have access to recent utility data.
        annual_usage_kwh_estimate: Math.round(
          (monthlyBillUsd / 0.135) * 12
        ),
      };

      const raw = await auroraFetch<any>("POST", `/designs`, payload);

      const d = raw.design ?? raw;
      return {
        id: d.id ?? uuidv4(),
        project_id: projectId,
        status: (d.status ?? "complete") as "complete",
        system_size_kw: Number(d.system_size_kw ?? d.dc_kw ?? 0),
        system_size_ac: Number(d.system_size_ac ?? d.ac_kw ?? 0),
        panel_count: Number(d.panel_count ?? d.modules?.length ?? 0),
        annual_production_kwh: Number(d.annual_production_kwh ?? 0),
        offset_percentage: Number(d.offset_percentage ?? 0),
        specific_yield: Number(d.specific_yield ?? 0),
        co2_offset_tons_annual: Number(d.co2_offset_tons_annual ?? 0),
        bill_of_materials: Array.isArray(d.bill_of_materials)
          ? d.bill_of_materials
          : [],
        created_at: d.created_at ?? new Date().toISOString(),
      };
    },
    projectId
  );
}

/**
 * GET /v2/tenants/{tenant_id}/designs/{design_id}
 * Refetch the design summary (useful after manual edits).
 */
export async function getDesignSummary(
  designId: string,
  sessionId: string,
  projectId: string
): Promise<AuroraDesignSummary> {
  return realApiCall(
    "auto_designer",
    sessionId,
    async () => {
      const raw = await auroraFetch<any>("GET", `/designs/${designId}`);
      const d = raw.design ?? raw;
      return {
        id: d.id ?? designId,
        project_id: projectId,
        status: (d.status ?? "complete") as "complete",
        system_size_kw: Number(d.system_size_kw ?? 0),
        system_size_ac: Number(d.system_size_ac ?? 0),
        panel_count: Number(d.panel_count ?? 0),
        annual_production_kwh: Number(d.annual_production_kwh ?? 0),
        offset_percentage: Number(d.offset_percentage ?? 0),
        specific_yield: Number(d.specific_yield ?? 0),
        co2_offset_tons_annual: Number(d.co2_offset_tons_annual ?? 0),
        bill_of_materials: Array.isArray(d.bill_of_materials)
          ? d.bill_of_materials
          : [],
        created_at: d.created_at ?? new Date().toISOString(),
      };
    },
    projectId,
    designId
  );
}

/**
 * POST /v2/tenants/{tenant_id}/designs/{design_id}/pricing
 */
export async function getPricing(
  design: AuroraDesignSummary,
  sessionId: string
): Promise<AuroraPricing> {
  return realApiCall(
    "get_pricing",
    sessionId,
    async () => {
      const raw = await auroraFetch<any>(
        "POST",
        `/designs/${design.id}/pricing`,
        {}
      );
      const p = raw.pricing ?? raw;
      return {
        design_id: design.id,
        gross_price_usd: Number(p.gross_price_usd ?? p.gross ?? 0),
        itc_credit_usd: Number(p.itc_credit_usd ?? p.itc ?? 0),
        net_price_usd: Number(p.net_price_usd ?? p.net ?? 0),
        price_per_watt: Number(p.price_per_watt ?? 0),
        price_per_kwh_lifetime: Number(p.price_per_kwh_lifetime ?? 0),
        equipment_cost_usd: Number(p.equipment_cost_usd ?? 0),
        installation_cost_usd: Number(p.installation_cost_usd ?? 0),
        permit_fee_usd: Number(p.permit_fee_usd ?? 0),
        created_at: p.created_at ?? new Date().toISOString(),
      };
    },
    design.project_id,
    design.id
  );
}

/**
 * GET /v2/tenants/{tenant_id}/designs/{design_id}/financing
 */
export async function getFinancing(
  design: AuroraDesignSummary,
  _pricing: AuroraPricing,
  sessionId: string,
  _monthlyBillUsd: number
): Promise<AuroraFinancingOption[]> {
  return realApiCall(
    "get_financing",
    sessionId,
    async () => {
      const raw = await auroraFetch<any>(
        "GET",
        `/designs/${design.id}/financing`
      );
      const options = (raw.options ?? raw.financing ?? raw) as any[];
      if (!Array.isArray(options) || options.length === 0) {
        throw new AuroraApiError(
          "Aurora financing returned no options",
          200,
          `/designs/${design.id}/financing`
        );
      }
      return options.map((o) => ({
        id: o.id ?? uuidv4(),
        lender: o.lender ?? o.provider ?? "Unknown",
        product_name: o.product_name ?? o.name ?? "Loan",
        type: (o.type ?? "loan") as AuroraFinancingOption["type"],
        monthly_payment_usd: Number(o.monthly_payment_usd ?? 0),
        term_years: Number(o.term_years ?? 0),
        apr_percentage: o.apr_percentage ?? undefined,
        escalator_percentage: o.escalator_percentage ?? undefined,
        down_payment_usd: Number(o.down_payment_usd ?? 0),
        total_25_year_savings_usd: Number(o.total_25_year_savings_usd ?? 0),
        total_25_year_cost_usd: Number(o.total_25_year_cost_usd ?? 0),
        description: o.description ?? "",
      }));
    },
    design.project_id,
    design.id
  );
}

/**
 * POST /v2/tenants/{tenant_id}/designs/{design_id}/web-proposals
 * Returns the Aurora-hosted shareable URL.
 */
export async function createWebProposal(
  design: AuroraDesignSummary,
  sessionId: string
): Promise<AuroraWebProposal> {
  return realApiCall(
    "create_web_proposal",
    sessionId,
    async () => {
      const raw = await auroraFetch<any>(
        "POST",
        `/designs/${design.id}/web-proposals`,
        {}
      );
      const wp = raw.web_proposal ?? raw;
      return {
        id: wp.id ?? uuidv4(),
        design_id: design.id,
        shareable_url:
          wp.shareable_url ??
          wp.url ??
          `/proposal/${design.id}`, // last-resort fallback
        created_at: wp.created_at ?? new Date().toISOString(),
        expires_at:
          wp.expires_at ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    },
    design.project_id,
    design.id
  );
}

/**
 * Smoke test for the admin "Test Connection" button.
 * Calls a cheap GET endpoint that confirms creds work without
 * burning serious credits.
 */
export async function testConnection(): Promise<{
  ok: boolean;
  status: number;
  message: string;
}> {
  if (!isRealAuroraConfigured()) {
    return {
      ok: false,
      status: 0,
      message:
        "AURORA_API_KEY and/or AURORA_TENANT_ID env vars are not set on this deployment.",
    };
  }
  try {
    // /projects is the cheapest endpoint that requires auth. We pass
    // limit=1 so Aurora doesn't return a huge payload.
    await auroraFetch<any>("GET", "/projects?limit=1", undefined, 10_000);
    return {
      ok: true,
      status: 200,
      message: "Connected. Aurora credentials accepted.",
    };
  } catch (e) {
    if (e instanceof AuroraApiError) {
      return {
        ok: false,
        status: e.status,
        message: `${e.message}${e.bodyExcerpt ? ` — ${e.bodyExcerpt}` : ""}`,
      };
    }
    return {
      ok: false,
      status: 0,
      message: (e as Error).message,
    };
  }
}
