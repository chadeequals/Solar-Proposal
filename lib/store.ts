/**
 * Sundial v2 — In-Memory Store
 *
 * Provides session, config, and credit usage persistence during development.
 * All state lives in module-level Maps — survives across API calls in the
 * same Next.js server process but resets on server restart.
 *
 * TODO: Replace each store with a Supabase table:
 *   - sessions        → table "sundial_sessions"
 *   - gate_config     → table "gate_configs" (versioned, latest row is active)
 *   - credit_usage    → table "aurora_credit_usage"
 *
 * TODO: Add Redis (Upstash) for credit cap enforcement to prevent race conditions
 *       under concurrent load
 */

import type { SundialSession, GateConfig, CreditUsageEntry } from "./types";
import { DEFAULT_GATE_CONFIG } from "./gate";
import { v4 as uuidv4 } from "uuid";

// ─────────────────────────────────────────────
// GLOBAL SINGLETON
//
// Next.js dev mode and serverless runtimes can instantiate a module multiple
// times (per route, per request). Hanging the store off globalThis guarantees
// a single shared instance across all route handlers within one process.
//
// In production this is replaced entirely by Supabase — globalThis is only
// a dev/preview convenience.
// ─────────────────────────────────────────────

type StoreGlobal = {
  sessions: Map<string, SundialSession>;
  activeGateConfig: GateConfig;
  creditUsage: CreditUsageEntry[];
};

const g = globalThis as unknown as { __sundialStore?: StoreGlobal };

if (!g.__sundialStore) {
  g.__sundialStore = {
    sessions: new Map<string, SundialSession>(),
    activeGateConfig: { ...DEFAULT_GATE_CONFIG },
    creditUsage: [],
  };
}

const store = g.__sundialStore;

// ─────────────────────────────────────────────
// SESSIONS STORE
// Map<session_id, SundialSession>
// ─────────────────────────────────────────────

const sessions = store.sessions;

export function getSession(id: string): SundialSession | undefined {
  return sessions.get(id);
}

export function setSession(session: SundialSession): void {
  sessions.set(session.id, session);
}

export function updateSession(
  id: string,
  updates: Partial<SundialSession>
): SundialSession | null {
  const existing = sessions.get(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  sessions.set(id, updated);
  return updated;
}

export function getAllSessions(): SundialSession[] {
  return Array.from(sessions.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getRecentSessions(limit = 20): SundialSession[] {
  return getAllSessions().slice(0, limit);
}

// ─────────────────────────────────────────────
// GATE CONFIG STORE
// Single active config — admin can update at runtime
// ─────────────────────────────────────────────

export function getGateConfig(): GateConfig {
  return store.activeGateConfig;
}

export function setGateConfig(config: GateConfig): GateConfig {
  const updated = {
    ...config,
    version: store.activeGateConfig.version + 1,
    updated_at: new Date().toISOString(),
  };
  store.activeGateConfig = updated;
  return updated;
}

// ─────────────────────────────────────────────
// CREDIT USAGE STORE
// Append-only log of Aurora API calls
// ─────────────────────────────────────────────

const creditUsage = store.creditUsage;

export function logCreditUsage(
  entry: Omit<CreditUsageEntry, "id" | "timestamp">
): CreditUsageEntry {
  const full: CreditUsageEntry = {
    ...entry,
    id: uuidv4(),
    timestamp: new Date().toISOString(),
  };
  creditUsage.push(full);
  return full;
}

export function getCreditUsageToday(): CreditUsageEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return creditUsage.filter(
    (e) => e.success && new Date(e.timestamp) >= today
  );
}

export function getCreditUsageThisMonth(): CreditUsageEntry[] {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return creditUsage.filter(
    (e) => e.success && new Date(e.timestamp) >= startOfMonth
  );
}

export function getTodaySpendUsd(): number {
  return getCreditUsageToday().reduce((sum, e) => sum + e.cost_usd, 0);
}

export function getMonthSpendUsd(): number {
  return getCreditUsageThisMonth().reduce((sum, e) => sum + e.cost_usd, 0);
}

export function getRecentCreditUsage(limit = 50): CreditUsageEntry[] {
  return [...creditUsage]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
