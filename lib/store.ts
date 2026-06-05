/**
 * Sundial v2 — Supabase-backed Store
 *
 * Persists sessions, gate config (versioned), and Aurora credit usage to
 * Supabase Postgres. All functions are async — callers must await.
 *
 * Schema (see supabase/migrations):
 *   - sundial_sessions       (id text PK, jsonb columns for intake/aurora/etc.)
 *   - gate_configs           (versioned — highest version is active)
 *   - aurora_credit_usage    (append-only log)
 *
 * TODO: Add Redis (Upstash) atomic counter for credit cap enforcement
 *       to prevent race conditions under concurrent load. Right now two
 *       simultaneous intakes near the cap could both pass.
 */

import type { SundialSession, GateConfig, GateRule, CreditUsageEntry } from "./types";
import { DEFAULT_GATE_CONFIG } from "./gate";
import { supabase } from "./supabase";

// ─────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────

type SessionRow = {
  id: string;
  intake: SundialSession["intake"];
  gate_evaluation: SundialSession["gate_evaluation"];
  gate_config_version: number;
  status: SundialSession["status"];
  aurora_project: SundialSession["aurora_project"] | null;
  aurora_design: SundialSession["aurora_design"] | null;
  aurora_pricing: SundialSession["aurora_pricing"] | null;
  aurora_financing: SundialSession["aurora_financing"] | null;
  aurora_proposal: SundialSession["aurora_proposal"] | null;
  proposal_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function rowToSession(r: SessionRow): SundialSession {
  return {
    id: r.id,
    intake: r.intake,
    gate_evaluation: r.gate_evaluation,
    gate_config_version: r.gate_config_version,
    status: r.status,
    aurora_project: r.aurora_project ?? undefined,
    aurora_design: r.aurora_design ?? undefined,
    aurora_pricing: r.aurora_pricing ?? undefined,
    aurora_financing: r.aurora_financing ?? undefined,
    aurora_proposal: r.aurora_proposal ?? undefined,
    proposal_url: r.proposal_url ?? undefined,
    error_message: r.error_message ?? undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function getSession(id: string): Promise<SundialSession | undefined> {
  const { data, error } = await supabase
    .from("sundial_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[store] getSession error:", error.message);
    return undefined;
  }
  return data ? rowToSession(data as SessionRow) : undefined;
}

export async function setSession(session: SundialSession): Promise<void> {
  const row = {
    id: session.id,
    intake: session.intake,
    gate_evaluation: session.gate_evaluation,
    gate_config_version: session.gate_config_version,
    status: session.status,
    aurora_project: session.aurora_project ?? null,
    aurora_design: session.aurora_design ?? null,
    aurora_pricing: session.aurora_pricing ?? null,
    aurora_financing: session.aurora_financing ?? null,
    aurora_proposal: session.aurora_proposal ?? null,
    proposal_url: session.proposal_url ?? null,
    error_message: session.error_message ?? null,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
  const { error } = await supabase.from("sundial_sessions").upsert(row);
  if (error) {
    console.error("[store] setSession error:", error.message);
    throw new Error(`Failed to save session: ${error.message}`);
  }
}

export async function updateSession(
  id: string,
  updates: Partial<SundialSession>
): Promise<SundialSession | null> {
  // Only allow updating known columns. Strip id/created_at.
  const allowed: Record<string, unknown> = {};
  const keys: (keyof SundialSession)[] = [
    "intake",
    "gate_evaluation",
    "gate_config_version",
    "status",
    "aurora_project",
    "aurora_design",
    "aurora_pricing",
    "aurora_financing",
    "aurora_proposal",
    "proposal_url",
    "error_message",
  ];
  for (const k of keys) {
    if (k in updates) allowed[k] = updates[k] ?? null;
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("sundial_sessions")
    .update(allowed)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    console.error("[store] updateSession error:", error.message);
    return null;
  }
  return data ? rowToSession(data as SessionRow) : null;
}

export async function getAllSessions(): Promise<SundialSession[]> {
  const { data, error } = await supabase
    .from("sundial_sessions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[store] getAllSessions error:", error.message);
    return [];
  }
  return (data as SessionRow[]).map(rowToSession);
}

export async function getRecentSessions(limit = 20): Promise<SundialSession[]> {
  const { data, error } = await supabase
    .from("sundial_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[store] getRecentSessions error:", error.message);
    return [];
  }
  return (data as SessionRow[]).map(rowToSession);
}

// ─────────────────────────────────────────────
// GATE CONFIG (versioned — latest row is active)
// ─────────────────────────────────────────────

type GateConfigRow = {
  id: string;
  version: number;
  aurora_enabled: boolean;
  trigger_step: number;
  monthly_credit_cap_usd: number;
  daily_credit_cap_usd: number;
  fallback_action: GateConfig["fallback_action"];
  lender_pre_qual_required: boolean;
  rules: GateRule[];
  updated_at: string;
  updated_by: string | null;
};

function rowToGateConfig(r: GateConfigRow): GateConfig {
  return {
    version: r.version,
    aurora_enabled: r.aurora_enabled,
    trigger_step: r.trigger_step,
    monthly_credit_cap_usd: Number(r.monthly_credit_cap_usd),
    daily_credit_cap_usd: Number(r.daily_credit_cap_usd),
    fallback_action: r.fallback_action,
    lender_pre_qual_required: r.lender_pre_qual_required,
    rules: r.rules,
    updated_at: r.updated_at,
  };
}

export async function getGateConfig(): Promise<GateConfig> {
  const { data, error } = await supabase
    .from("gate_configs")
    .select("*")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    console.warn("[store] getGateConfig falling back to DEFAULT_GATE_CONFIG:", error?.message);
    return { ...DEFAULT_GATE_CONFIG };
  }
  return rowToGateConfig(data as GateConfigRow);
}

export async function setGateConfig(config: GateConfig): Promise<GateConfig> {
  // Find the latest version, increment, insert new row.
  const { data: latest } = await supabase
    .from("gate_configs")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const newVersion = (latest?.version ?? 0) + 1;

  const row = {
    version: newVersion,
    aurora_enabled: config.aurora_enabled,
    trigger_step: config.trigger_step,
    monthly_credit_cap_usd: config.monthly_credit_cap_usd,
    daily_credit_cap_usd: config.daily_credit_cap_usd,
    fallback_action: config.fallback_action,
    lender_pre_qual_required: config.lender_pre_qual_required,
    rules: config.rules,
    updated_at: new Date().toISOString(),
    updated_by: "admin",
  };

  const { data, error } = await supabase
    .from("gate_configs")
    .insert(row)
    .select()
    .single();
  if (error) {
    console.error("[store] setGateConfig error:", error.message);
    throw new Error(`Failed to save gate config: ${error.message}`);
  }
  return rowToGateConfig(data as GateConfigRow);
}

// ─────────────────────────────────────────────
// CREDIT USAGE
// ─────────────────────────────────────────────

type CreditUsageRow = {
  id: string;
  session_id: string | null;
  call_type: string;
  cost_usd: number;
  success: boolean;
  request_payload: unknown;
  response_payload: unknown;
  timestamp: string;
};

function rowToCreditUsage(r: CreditUsageRow): CreditUsageEntry {
  return {
    id: r.id,
    session_id: r.session_id ?? "",
    call_type: r.call_type as CreditUsageEntry["call_type"],
    cost_usd: Number(r.cost_usd),
    success: r.success,
    timestamp: r.timestamp,
  };
}

export async function logCreditUsage(
  entry: Omit<CreditUsageEntry, "id" | "timestamp">
): Promise<CreditUsageEntry> {
  const row = {
    session_id: entry.session_id || null,
    call_type: entry.call_type,
    cost_usd: entry.cost_usd,
    success: entry.success,
    request_payload: null,
    response_payload: null,
    timestamp: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("aurora_credit_usage")
    .insert(row)
    .select()
    .single();
  if (error) {
    console.error("[store] logCreditUsage error:", error.message);
    // Don't throw — credit logging failure shouldn't kill the pipeline
    return {
      id: "log-failed",
      timestamp: row.timestamp,
      ...entry,
    };
  }
  return rowToCreditUsage(data as CreditUsageRow);
}

async function getCreditUsageSince(since: Date): Promise<CreditUsageEntry[]> {
  const { data, error } = await supabase
    .from("aurora_credit_usage")
    .select("*")
    .eq("success", true)
    .gte("timestamp", since.toISOString())
    .order("timestamp", { ascending: false });
  if (error) {
    console.error("[store] getCreditUsageSince error:", error.message);
    return [];
  }
  return (data as CreditUsageRow[]).map(rowToCreditUsage);
}

export async function getCreditUsageToday(): Promise<CreditUsageEntry[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getCreditUsageSince(today);
}

export async function getCreditUsageThisMonth(): Promise<CreditUsageEntry[]> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return getCreditUsageSince(startOfMonth);
}

export async function getTodaySpendUsd(): Promise<number> {
  const entries = await getCreditUsageToday();
  return entries.reduce((sum, e) => sum + e.cost_usd, 0);
}

export async function getMonthSpendUsd(): Promise<number> {
  const entries = await getCreditUsageThisMonth();
  return entries.reduce((sum, e) => sum + e.cost_usd, 0);
}

export async function getRecentCreditUsage(limit = 50): Promise<CreditUsageEntry[]> {
  const { data, error } = await supabase
    .from("aurora_credit_usage")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[store] getRecentCreditUsage error:", error.message);
    return [];
  }
  return (data as CreditUsageRow[]).map(rowToCreditUsage);
}
