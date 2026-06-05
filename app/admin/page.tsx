"use client";

/**
 * Sundial v2 — Admin Dashboard
 *
 * Password-protected internal tool for:
 *  1. Gate Config Editor — edit rules, trigger step, credit caps live
 *  2. Credit Usage Dashboard — today/month spend vs caps
 *  3. Recent Sessions — intake status, gate results, proposal links
 *  4. Test Panel — paste intake JSON, evaluate against current config
 *
 * Access: /admin — default password: "sundial2026" (set ADMIN_TOKEN env var)
 *
 * TODO: Replace cookie auth with Clerk or NextAuth
 * TODO: Subscribe to Supabase Realtime for live session updates
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  GateConfig,
  GateRule,
  GateEvaluation,
  SundialSession,
  CreditUsageEntry,
  RuleOperator,
} from "@/lib/types";
import { useSundialRealtime, type RealtimeStatus } from "@/lib/use-sundial-realtime";

// Map a raw Realtime row payload to our app-level types. The DB and the
// app types are almost identical — we just normalize null → undefined.
function realtimeRowToSession(r: Record<string, unknown>): SundialSession {
  return {
    id: r.id as string,
    intake: r.intake as SundialSession["intake"],
    gate_evaluation: r.gate_evaluation as SundialSession["gate_evaluation"],
    gate_config_version: r.gate_config_version as number,
    status: r.status as SundialSession["status"],
    aurora_project: (r.aurora_project ?? undefined) as SundialSession["aurora_project"],
    aurora_design: (r.aurora_design ?? undefined) as SundialSession["aurora_design"],
    aurora_pricing: (r.aurora_pricing ?? undefined) as SundialSession["aurora_pricing"],
    aurora_financing: (r.aurora_financing ?? undefined) as SundialSession["aurora_financing"],
    aurora_proposal: (r.aurora_proposal ?? undefined) as SundialSession["aurora_proposal"],
    proposal_url: (r.proposal_url ?? undefined) as string | undefined,
    error_message: (r.error_message ?? undefined) as string | undefined,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function realtimeRowToUsage(r: Record<string, unknown>): CreditUsageEntry {
  return {
    id: r.id as string,
    session_id: (r.session_id ?? "") as string,
    call_type: r.call_type as CreditUsageEntry["call_type"],
    cost_usd: Number(r.cost_usd),
    success: r.success as boolean,
    timestamp: r.timestamp as string,
  };
}

// ─────────────────────────────────────────────
// AUTH LAYER
// ─────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        onLogin();
      } else {
        setError("Incorrect password");
      }
    } catch {
      setError("Login failed — server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-2">
            Sundial v2
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Admin Access</h1>
          <p className="text-xs text-slate-500 mt-1">Victory Energy internal tool</p>
        </div>
        <div className="card-navy p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="input-dark w-full px-4 py-3 text-sm"
              placeholder="Enter admin password"
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>
          <button
            onClick={handleLogin}
            disabled={loading || !password}
            className={`btn-gold w-full py-3 text-sm font-bold rounded-lg ${
              loading || !password ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {loading ? "Authenticating…" : "Sign In"}
          </button>
          <p className="text-[10px] text-slate-600 text-center">
            Dev default: sundial2026 · Set ADMIN_TOKEN env var to change
          </p>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────
// MAIN ADMIN DASHBOARD
// ─────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<"gate" | "aurora" | "credits" | "sessions" | "test">("gate");
  const [config, setConfig] = useState<GateConfig | null>(null);
  const [sessions, setSessions] = useState<SundialSession[]>([]);
  const [creditUsage, setCreditUsage] = useState<CreditUsageEntry[]>([]);
  const [todaySpend, setTodaySpend] = useState(0);
  const [monthSpend, setMonthSpend] = useState(0);
  const [gatePassRate, setGatePassRate] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Realtime: track recently-changed row IDs for flash animation.
  // We clear the set 1.5s after each change.
  const [hotSessionIds, setHotSessionIds] = useState<Set<string>>(new Set());
  const [hotUsageIds, setHotUsageIds] = useState<Set<string>>(new Set());
  const hotTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const markHot = useCallback(
    (id: string, setter: (updater: (s: Set<string>) => Set<string>) => void) => {
      setter((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // Clear after 1500ms
      const existing = hotTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setter((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        hotTimersRef.current.delete(id);
      }, 1500);
      hotTimersRef.current.set(id, timer);
    },
    []
  );

  // Test panel
  const [testJson, setTestJson] = useState(JSON.stringify({
    state: "TX",
    utility: "Oncor",
    ownership: "own",
    monthly_bill_usd: 150,
    roof: "asphalt_shingle",
    trees: "none",
    step_completed: 8,
  }, null, 2));
  const [testResult, setTestResult] = useState<GateEvaluation | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard", {
        headers: { "x-admin-token": getCookie("sundial_admin") ?? "sundial2026" },
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data.gate_config);
        setSessions(data.data.recent_sessions);
        setCreditUsage(data.data.recent_usage);
        setTodaySpend(data.data.credit_usage_today_usd);
        setMonthSpend(data.data.credit_usage_month_usd);
        setGatePassRate(data.data.gate_pass_rate_today);
      }
    } catch (err) {
      console.error("Dashboard fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      fetchDashboard();
      // Polling fallback in case Realtime drops. Cadence is long because
      // Realtime drives most updates now.
      const interval = setInterval(fetchDashboard, 60_000);
      return () => clearInterval(interval);
    }
  }, [authed, fetchDashboard]);

  // ── Realtime subscriptions ──────────────────────────────
  const realtimeStatus: RealtimeStatus = useSundialRealtime({
    enabled: authed,
    onSessionInsert: (row) => {
      const session = realtimeRowToSession(row);
      setSessions((prev) => {
        // Skip if already in list (race with initial fetch)
        if (prev.find((s) => s.id === session.id)) return prev;
        return [session, ...prev].slice(0, 20);
      });
      markHot(session.id, setHotSessionIds);
    },
    onSessionUpdate: (row) => {
      const session = realtimeRowToSession(row);
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === session.id);
        if (idx === -1) return [session, ...prev].slice(0, 20);
        const next = [...prev];
        next[idx] = session;
        return next;
      });
      markHot(session.id, setHotSessionIds);
    },
    onUsageInsert: (row) => {
      const entry = realtimeRowToUsage(row);
      setCreditUsage((prev) => {
        if (prev.find((u) => u.id === entry.id)) return prev;
        return [entry, ...prev].slice(0, 50);
      });
      // Optimistically bump the today/month counters. The next poll will
      // correct any drift.
      const ts = new Date(entry.timestamp);
      const now = new Date();
      const sameDay =
        ts.getFullYear() === now.getFullYear() &&
        ts.getMonth() === now.getMonth() &&
        ts.getDate() === now.getDate();
      const sameMonth =
        ts.getFullYear() === now.getFullYear() &&
        ts.getMonth() === now.getMonth();
      if (sameDay) setTodaySpend((v) => v + entry.cost_usd);
      if (sameMonth) setMonthSpend((v) => v + entry.cost_usd);
      markHot(entry.id, setHotUsageIds);
    },
    onGateConfigInsert: (row) => {
      // Someone else (or another tab) saved a new gate config version.
      // Just refetch — simpler than mapping the JSONB rules ourselves.
      fetchDashboard();
    },
  });

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/admin/gate-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getCookie("sundial_admin") ?? "sundial2026",
        },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  };

  const handleTestGate = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const parsed = JSON.parse(testJson);
      const res = await fetch("/api/admin/gate-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getCookie("sundial_admin") ?? "sundial2026",
        },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (data.success) setTestResult(data.evaluation);
    } catch (err) {
      console.error("Gate test error:", err);
    } finally {
      setTestLoading(false);
    }
  };

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  const tabs = [
    { id: "gate" as const, label: "Gate Config" },
    { id: "aurora" as const, label: "Aurora API" },
    { id: "credits" as const, label: "Credit Usage" },
    { id: "sessions" as const, label: "Sessions" },
    { id: "test" as const, label: "Test Panel" },
  ];

  return (
    <main className="min-h-screen p-4 sm:p-6">
      {/* Admin header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <LiveStatusDot status={realtimeStatus} />
              <h1 className="text-lg font-bold text-slate-100">Sundial Admin</h1>
              <span className="badge badge-gray">Internal</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gate Config v{config?.version ?? "—"} · Victory Energy ·{" "}
              <LiveStatusLabel status={realtimeStatus} />
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchDashboard}
              className="btn-ghost px-3 py-1.5 text-xs"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
            <a href="/" className="btn-ghost px-3 py-1.5 text-xs">
              ← Wizard
            </a>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Today's Aurora Spend" value={`$${todaySpend.toFixed(2)}`} sub={`cap: $${config?.daily_credit_cap_usd ?? "--"}`} accent={todaySpend > (config?.daily_credit_cap_usd ?? 999) * 0.8} />
          <KpiCard label="Month-to-Date Spend" value={`$${monthSpend.toFixed(2)}`} sub={`cap: $${config?.monthly_credit_cap_usd ?? "--"}`} accent={monthSpend > (config?.monthly_credit_cap_usd ?? 999) * 0.8} />
          <KpiCard label="Gate Pass Rate (Today)" value={`${(gatePassRate * 100).toFixed(0)}%`} sub={`${sessions.filter(s => s.status !== 'gate_failed').length} passed`} />
          <KpiCard label="Recent Sessions" value={String(sessions.length)} sub="last 20 shown" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-white/5 pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-semibold tracking-wide transition-all ${
                activeTab === tab.id
                  ? "text-amber-400 border-b-2 border-amber-400 -mb-px"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="animate-fade-in">
          {activeTab === "gate" && config && (
            <GateConfigEditor
              config={config}
              onChange={setConfig}
              onSave={handleSaveConfig}
              saveStatus={saveStatus}
            />
          )}
          {activeTab === "aurora" && config && (
            <AuroraConfigEditor
              config={config}
              onChange={setConfig}
              onSave={handleSaveConfig}
              saveStatus={saveStatus}
            />
          )}
          {activeTab === "credits" && (
            <CreditUsageDashboard
              todaySpend={todaySpend}
              monthSpend={monthSpend}
              dailyCap={config?.daily_credit_cap_usd ?? 200}
              monthlyCap={config?.monthly_credit_cap_usd ?? 2000}
              usage={creditUsage}
              hotIds={hotUsageIds}
            />
          )}
          {activeTab === "sessions" && (
            <SessionsTable sessions={sessions} hotIds={hotSessionIds} />
          )}
          {activeTab === "test" && (
            <TestPanel
              testJson={testJson}
              onJsonChange={setTestJson}
              onTest={handleTestGate}
              result={testResult}
              loading={testLoading}
            />
          )}
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────
// GATE CONFIG EDITOR
// ─────────────────────────────────────────────

function GateConfigEditor({
  config,
  onChange,
  onSave,
  saveStatus,
}: {
  config: GateConfig;
  onChange: (c: GateConfig) => void;
  onSave: () => void;
  saveStatus: string;
}) {
  const addRule = () => {
    const newRule: GateRule = {
      id: "rule_" + Date.now(),
      label: "New Rule",
      field: "state",
      operator: "in",
      value: [],
      required: true,
      warn_only: false,
    };
    onChange({ ...config, rules: [...config.rules, newRule] });
  };

  const updateRule = (id: string, updates: Partial<GateRule>) => {
    onChange({
      ...config,
      rules: config.rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    });
  };

  const deleteRule = (id: string) => {
    onChange({ ...config, rules: config.rules.filter((r) => r.id !== id) });
  };

  const FIELDS = ["state","utility","ownership","monthly_bill_usd","roof","trees","stories","attached_garage","zip"];
  const OPERATORS: RuleOperator[] = ["equals","not_equals","in","not_in","gte","lte","gt","lt"];
  const FALLBACK_ACTIONS = ["lead_only", "wait_list", "manual_review"];

  return (
    <div className="space-y-6">
      {/* Global toggles */}
      <div className="card-navy p-5">
        <h2 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-4">
          Global Settings
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Aurora enabled toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-navy-900/60 border border-white/5">
            <div>
              <div className="text-sm font-semibold text-slate-200">Aurora Integration</div>
              <div className="text-xs text-slate-500">Global kill switch for all Aurora calls</div>
            </div>
            <button
              onClick={() => onChange({ ...config, aurora_enabled: !config.aurora_enabled })}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                config.aurora_enabled ? "bg-amber-500" : "bg-slate-700"
              }`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                config.aurora_enabled ? "translate-x-6" : ""
              }`} />
            </button>
          </div>

          {/* Trigger step */}
          <div className="p-3 rounded-lg bg-navy-900/60 border border-white/5">
            <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Trigger Step (1-12)</label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="number"
                min={1}
                max={12}
                value={config.trigger_step}
                onChange={(e) => onChange({ ...config, trigger_step: Number(e.target.value) })}
                className="input-dark w-20 px-3 py-1.5 text-sm font-mono"
              />
              <span className="text-xs text-slate-500">Min wizard step to trigger Aurora</span>
            </div>
          </div>

          {/* Daily cap */}
          <div className="p-3 rounded-lg bg-navy-900/60 border border-white/5">
            <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Daily Credit Cap ($)</label>
            <input
              type="number"
              value={config.daily_credit_cap_usd}
              onChange={(e) => onChange({ ...config, daily_credit_cap_usd: Number(e.target.value) })}
              className="input-dark w-full px-3 py-1.5 text-sm font-mono mt-1"
            />
          </div>

          {/* Monthly cap */}
          <div className="p-3 rounded-lg bg-navy-900/60 border border-white/5">
            <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Monthly Credit Cap ($)</label>
            <input
              type="number"
              value={config.monthly_credit_cap_usd}
              onChange={(e) => onChange({ ...config, monthly_credit_cap_usd: Number(e.target.value) })}
              className="input-dark w-full px-3 py-1.5 text-sm font-mono mt-1"
            />
          </div>

          {/* Fallback action */}
          <div className="p-3 rounded-lg bg-navy-900/60 border border-white/5">
            <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Fallback Action</label>
            <select
              value={config.fallback_action}
              onChange={(e) => onChange({ ...config, fallback_action: e.target.value as GateConfig["fallback_action"] })}
              className="input-dark w-full px-3 py-1.5 text-sm mt-1"
            >
              {FALLBACK_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Lender pre-qual */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-navy-900/60 border border-white/5">
            <div>
              <div className="text-sm font-semibold text-slate-200">Lender Pre-Qual Required</div>
              <div className="text-xs text-slate-500">Require financing pre-qualification</div>
            </div>
            <button
              onClick={() => onChange({ ...config, lender_pre_qual_required: !config.lender_pre_qual_required })}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                config.lender_pre_qual_required ? "bg-amber-500" : "bg-slate-700"
              }`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                config.lender_pre_qual_required ? "translate-x-6" : ""
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Rules table */}
      <div className="card-navy p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold tracking-widest text-amber-500 uppercase">
            Gate Rules ({config.rules.length})
          </h2>
          <button onClick={addRule} className="btn-gold text-xs px-3 py-1.5 rounded-lg">
            + Add Rule
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full admin-table text-left">
            <thead>
              <tr>
                <th>Label</th>
                <th>Field</th>
                <th>Operator</th>
                <th>Value</th>
                <th>Required</th>
                <th>Warn Only</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {config.rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <input
                      value={rule.label}
                      onChange={(e) => updateRule(rule.id, { label: e.target.value })}
                      className="input-dark w-full px-2 py-1 text-xs"
                    />
                  </td>
                  <td>
                    <select
                      value={rule.field}
                      onChange={(e) => updateRule(rule.id, { field: e.target.value as keyof import("@/lib/types").Intake })}
                      className="input-dark px-2 py-1 text-xs"
                    >
                      {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      value={rule.operator}
                      onChange={(e) => updateRule(rule.id, { operator: e.target.value as RuleOperator })}
                      className="input-dark px-2 py-1 text-xs"
                    >
                      {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      value={Array.isArray(rule.value) ? rule.value.join(", ") : String(rule.value)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = ["in","not_in"].includes(rule.operator)
                          ? raw.split(",").map(s => s.trim()).filter(Boolean)
                          : ["gte","lte","gt","lt"].includes(rule.operator)
                          ? Number(raw) || 0
                          : raw;
                        updateRule(rule.id, { value: v });
                      }}
                      className="input-dark w-32 px-2 py-1 text-xs font-mono"
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={rule.required}
                      onChange={(e) => updateRule(rule.id, { required: e.target.checked })}
                      className="accent-amber-500"
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={rule.warn_only}
                      onChange={(e) => updateRule(rule.id, { warn_only: e.target.checked })}
                      className="accent-amber-500"
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="text-red-400/60 hover:text-red-400 text-xs px-2 py-1"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Current version: v{config.version}
          {config.updated_at && ` · Last saved: ${new Date(config.updated_at).toLocaleString()}`}
        </p>
        <button
          onClick={onSave}
          disabled={saveStatus === "saving"}
          className={`btn-gold px-6 py-2.5 text-sm font-bold rounded-lg ${
            saveStatus === "saving" ? "opacity-60" : ""
          }`}
        >
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && "✓ Saved!"}
          {saveStatus === "error" && "Save Failed"}
          {(saveStatus === "idle" || !saveStatus) && "Save Config →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CREDIT USAGE DASHBOARD
// ─────────────────────────────────────────────

function CreditUsageDashboard({
  todaySpend,
  monthSpend,
  dailyCap,
  monthlyCap,
  usage,
  hotIds,
}: {
  todaySpend: number;
  monthSpend: number;
  dailyCap: number;
  monthlyCap: number;
  usage: CreditUsageEntry[];
  hotIds: Set<string>;
}) {
  const dailyPct = Math.min(100, (todaySpend / dailyCap) * 100);
  const monthlyPct = Math.min(100, (monthSpend / monthlyCap) * 100);

  const CALL_COSTS: Record<string, number> = {
    create_project: 0,
    ai_site_model: 10.0,
    auto_designer: 5.0,
    get_pricing: 1.0,
    get_financing: 1.0,
    create_web_proposal: 1.5,
  };

  return (
    <div className="space-y-5">
      {/* Cap gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CapGauge
          label="Daily Spend"
          current={todaySpend}
          cap={dailyCap}
          pct={dailyPct}
        />
        <CapGauge
          label="Monthly Spend"
          current={monthSpend}
          cap={monthlyCap}
          pct={monthlyPct}
        />
      </div>

      {/* Cost reference */}
      <div className="card-navy p-4">
        <h3 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-3">
          Aurora API Cost Reference
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(CALL_COSTS).map(([key, cost]) => (
            <div key={key} className="text-center p-2 rounded bg-navy-900/60">
              <div className="text-sm font-bold text-amber-400 font-mono">${cost.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{key.replace(/_/g, " ")}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-3">
          Approximate costs. Actual Aurora pricing varies by market and contract terms (~$15-22 total per full pipeline).
        </p>
      </div>

      {/* Usage log */}
      <div className="card-navy p-4">
        <h3 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-3">
          Recent API Calls ({usage.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Session</th>
                <th>Call Type</th>
                <th>Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {usage.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-600 py-4">No API calls yet — submit a quote to see usage</td></tr>
              )}
              {usage.map((entry) => (
                <tr
                  key={entry.id}
                  className={hotIds.has(entry.id) ? "sundial-row-hot" : undefined}
                >
                  <td className="font-mono text-[10px]">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="font-mono text-[10px] text-slate-500">
                    {entry.session_id.slice(0, 8)}…
                  </td>
                  <td>{entry.call_type.replace(/_/g, " ")}</td>
                  <td className={`font-mono font-semibold ${entry.cost_usd > 0 ? "text-amber-400" : "text-slate-500"}`}>
                    ${entry.cost_usd.toFixed(2)}
                  </td>
                  <td>
                    <span className={`badge ${entry.success ? "badge-green" : "badge-red"}`}>
                      {entry.success ? "OK" : "FAIL"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapGauge({
  label,
  current,
  cap,
  pct,
}: {
  label: string;
  current: number;
  cap: number;
  pct: number;
}) {
  const isWarn = pct > 80;
  const isDanger = pct > 95;

  return (
    <div className="card-navy p-4">
      <div className="flex items-end justify-between mb-2">
        <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold">{label}</span>
        <span className={`text-lg font-bold font-mono ${isDanger ? "text-red-400" : isWarn ? "text-orange-400" : "text-amber-400"}`}>
          ${current.toFixed(2)}
        </span>
      </div>
      <div className="progress-bar-track h-2 mb-1">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: isDanger ? "#f87171" : isWarn ? "#fb923c" : "linear-gradient(90deg, #f59e0b, #fcd34d)",
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>${current.toFixed(2)} used</span>
        <span>${cap} cap · {pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SESSIONS TABLE
// ─────────────────────────────────────────────

function SessionsTable({ sessions, hotIds }: { sessions: SundialSession[]; hotIds: Set<string> }) {
  const STATUS_BADGE: Record<string, string> = {
    intake: "badge-gray",
    designing: "badge-blue",
    design_ready: "badge-blue",
    complete: "badge-green",
    gate_failed: "badge-yellow",
    error: "badge-red",
  };

  return (
    <div className="card-navy p-4">
      <h2 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-4">
        Recent Sessions ({sessions.length})
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Name</th>
              <th>Address</th>
              <th>Bill</th>
              <th>Gate</th>
              <th>Status</th>
              <th>Aurora</th>
              <th>Proposal</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr><td colSpan={9} className="text-center text-slate-600 py-4">No sessions yet</td></tr>
            )}
            {sessions.map((s) => (
              <tr
                key={s.id}
                className={hotIds.has(s.id) ? "sundial-row-hot" : undefined}
              >
                <td className="font-mono text-[10px] text-slate-500">{s.id.slice(0, 8)}…</td>
                <td>{s.intake.first} {s.intake.last}</td>
                <td className="text-[10px]">{s.intake.city}, {s.intake.state}</td>
                <td className="font-mono text-amber-400">${s.intake.monthly_bill_usd}</td>
                <td>
                  {s.gate_evaluation ? (
                    <span className={`badge ${s.gate_evaluation.passed ? "badge-green" : "badge-red"}`}>
                      {s.gate_evaluation.passed ? "PASS" : "FAIL"}
                    </span>
                  ) : "—"}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[s.status] ?? "badge-gray"}`}>
                    {s.status.replace(/_/g, " ").toUpperCase()}
                  </span>
                </td>
                <td>
                  <AuroraModePill mode={s.aurora_mode} fallbacks={s.aurora_fallback_calls} />
                </td>
                <td>
                  {s.proposal_url ? (
                    <a
                      href={s.proposal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 text-[10px] font-mono underline"
                    >
                      View →
                    </a>
                  ) : "—"}
                </td>
                <td className="font-mono text-[10px] text-slate-500">
                  {new Date(s.created_at).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TEST PANEL
// ─────────────────────────────────────────────

function TestPanel({
  testJson,
  onJsonChange,
  onTest,
  result,
  loading,
}: {
  testJson: string;
  onJsonChange: (v: string) => void;
  onTest: () => void;
  result: GateEvaluation | null;
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="card-navy p-5">
        <h2 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-3">
          Gate Test Panel
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Paste a sample intake JSON and evaluate it against the current gate config.
          Partial intakes are filled with safe defaults.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* JSON input */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
              Sample Intake JSON
            </label>
            <textarea
              value={testJson}
              onChange={(e) => onJsonChange(e.target.value)}
              rows={18}
              className="input-dark w-full px-4 py-3 text-xs font-mono leading-relaxed resize-none"
              spellCheck={false}
            />
            <button
              onClick={onTest}
              disabled={loading}
              className={`btn-gold w-full py-2.5 text-sm font-bold rounded-lg mt-3 ${loading ? "opacity-60" : ""}`}
            >
              {loading ? "Evaluating…" : "Evaluate Gate →"}
            </button>
          </div>

          {/* Result */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
              Gate Result
            </label>
            {!result && !loading && (
              <div className="h-64 rounded-lg bg-navy-900/60 border border-white/5 flex items-center justify-center text-xs text-slate-600">
                Run an evaluation to see results
              </div>
            )}
            {result && (
              <div className="space-y-3">
                {/* Pass/Fail */}
                <div className={`p-4 rounded-lg border ${
                  result.passed
                    ? "bg-green-500/10 border-green-500/20"
                    : "bg-red-500/10 border-red-500/20"
                }`}>
                  <div className={`text-lg font-bold ${result.passed ? "text-green-400" : "text-red-400"}`}>
                    {result.passed ? "✓ GATE PASSED" : "✗ GATE FAILED"}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{result.reason}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Aurora will {result.should_trigger_aurora ? "" : "NOT "}be triggered
                    {result.estimated_credit_cost_usd > 0 && ` · Est. cost: $${result.estimated_credit_cost_usd}`}
                  </div>
                </div>

                {/* Failed rules */}
                {result.failed_rules.length > 0 && (
                  <div>
                    <div className="text-[10px] text-red-400 uppercase tracking-wide font-semibold mb-1">
                      Failed Rules ({result.failed_rules.length})
                    </div>
                    {result.failed_rules.map((f, i) => (
                      <div key={i} className="text-[11px] text-slate-400 py-1 border-b border-white/5">
                        <span className="text-red-400">✗</span> {f.message}
                      </div>
                    ))}
                  </div>
                )}

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div>
                    <div className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold mb-1">
                      Warnings ({result.warnings.length})
                    </div>
                    {result.warnings.map((w, i) => (
                      <div key={i} className="text-[11px] text-slate-400 py-1 border-b border-white/5">
                        <span className="text-amber-400">⚠</span> {w.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="card-navy p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${accent ? "text-orange-400" : "text-amber-400"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// Live realtime connection indicator (replaces the static green dot).
function LiveStatusDot({ status }: { status: RealtimeStatus }) {
  const styles: Record<RealtimeStatus, { color: string; pulse: boolean }> = {
    live: { color: "bg-green-400", pulse: true },
    connecting: { color: "bg-amber-400", pulse: true },
    reconnecting: { color: "bg-orange-400", pulse: true },
    error: { color: "bg-red-400", pulse: false },
    disabled: { color: "bg-slate-600", pulse: false },
  };
  const s = styles[status];
  return (
    <div
      className={`w-2 h-2 rounded-full ${s.color} ${s.pulse ? "animate-pulse" : ""}`}
      title={`Realtime: ${status}`}
    />
  );
}

function LiveStatusLabel({ status }: { status: RealtimeStatus }) {
  const text: Record<RealtimeStatus, string> = {
    live: "Live",
    connecting: "Connecting…",
    reconnecting: "Reconnecting…",
    error: "Realtime error",
    disabled: "Realtime off (polling)",
  };
  const color: Record<RealtimeStatus, string> = {
    live: "text-green-400",
    connecting: "text-amber-400",
    reconnecting: "text-orange-400",
    error: "text-red-400",
    disabled: "text-slate-500",
  };
  return <span className={color[status]}>{text[status]}</span>;
}

// Helper: read cookie by name (client-side)
function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : undefined;
}

// ─────────────────────────────────────────────
// AURORA MODE PILL  (sessions table)
// ─────────────────────────────────────────────

function AuroraModePill({
  mode,
  fallbacks,
}: {
  mode?: "mock" | "real" | "partial";
  fallbacks?: string[];
}) {
  const m = mode ?? "mock";
  const cls: Record<string, string> = {
    mock: "bg-slate-700/60 text-slate-300 border-slate-600/50",
    real: "bg-green-600/20 text-green-300 border-green-500/40",
    partial: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  };
  const label = m.toUpperCase();
  const title =
    m === "partial" && fallbacks && fallbacks.length
      ? `Fell back to mock for: ${fallbacks.join(", ")}`
      : m === "real"
      ? "All calls used real Aurora API"
      : m === "mock"
      ? "All calls used mock client"
      : undefined;
  return (
    <span
      title={title}
      className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold tracking-wider ${cls[m]}`}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────
// AURORA CONFIG EDITOR  (new tab)
// ─────────────────────────────────────────────

function AuroraConfigEditor({
  config,
  onChange,
  onSave,
  saveStatus,
}: {
  config: GateConfig;
  onChange: (c: GateConfig) => void;
  onSave: () => void;
  saveStatus: string;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    configured: boolean;
    message: string;
    status?: number;
  } | null>(null);

  const emailsText = (config.aurora_allow_list_emails ?? []).join("\n");
  const sessionIdsText = (config.aurora_allow_list_session_ids ?? []).join("\n");

  const updateEmails = (text: string) => {
    const list = text
      .split("\n")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    onChange({ ...config, aurora_allow_list_emails: list });
  };

  const updateSessionIds = (text: string) => {
    const list = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({ ...config, aurora_allow_list_session_ids: list });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/aurora-test", { method: "POST" });
      const data = await res.json();
      setTestResult({
        ok: !!data.success,
        configured: !!data.configured,
        message: data.message ?? (data.success ? "OK" : "Unknown error"),
        status: data.status,
      });
    } catch (e) {
      setTestResult({
        ok: false,
        configured: false,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  };

  const masterOn = !!config.aurora_real_enabled;

  return (
    <div className="space-y-6">
      {/* Master switch */}
      <div className="card-navy p-5">
        <h2 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-4">
          Real Aurora API — Master Switch
        </h2>
        <div className="flex items-center justify-between p-4 rounded-lg bg-navy-900/60 border border-white/5">
          <div className="pr-4">
            <div className="text-sm font-semibold text-slate-200">
              Enable real Aurora calls
            </div>
            <div className="text-xs text-slate-500 mt-1">
              When ON, sessions matching the allow-list below hit the real Aurora API.
              All other sessions stay on the mock client. When OFF, every session uses mock.
            </div>
            {masterOn && (
              <div className="mt-2 text-[11px] text-amber-300 font-semibold">
                Warning: real calls consume Aurora credits. Verify the allow-list before flipping.
              </div>
            )}
          </div>
          <button
            onClick={() => onChange({ ...config, aurora_real_enabled: !masterOn })}
            className={`relative w-14 h-7 rounded-full transition-colors flex-shrink-0 ${
              masterOn ? "bg-green-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                masterOn ? "translate-x-7" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Allow-list editors */}
      <div className="card-navy p-5">
        <h2 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-1">
          Allow-list
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Sessions matching ANY entry use the real Aurora API. Email matches are case-insensitive.
          One value per line. Leave both empty to keep everyone on mock even when the master switch is on.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold">
              Emails ({(config.aurora_allow_list_emails ?? []).length})
            </label>
            <textarea
              value={emailsText}
              onChange={(e) => updateEmails(e.target.value)}
              rows={8}
              placeholder="chad@eequals.com&#10;test@example.com"
              className="input-dark w-full mt-1 px-3 py-2 text-xs font-mono"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold">
              Session IDs ({(config.aurora_allow_list_session_ids ?? []).length})
            </label>
            <textarea
              value={sessionIdsText}
              onChange={(e) => updateSessionIds(e.target.value)}
              rows={8}
              placeholder="abc12345-..."
              className="input-dark w-full mt-1 px-3 py-2 text-xs font-mono"
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {/* Test connection */}
      <div className="card-navy p-5">
        <h2 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-1">
          Test Connection
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Pings Aurora with your configured API key. Does not cost credits.
          Requires AURORA_API_KEY and AURORA_TENANT_ID env vars on this deployment.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={testing}
            className="btn-primary px-4 py-2 text-xs"
          >
            {testing ? "Testing…" : "Run test"}
          </button>
          {testResult && (
            <div
              className={`flex-1 px-3 py-2 rounded text-xs font-mono ${
                testResult.ok
                  ? "bg-green-600/15 text-green-300 border border-green-500/30"
                  : "bg-red-600/15 text-red-300 border border-red-500/30"
              }`}
            >
              {testResult.ok ? "✓" : "✗"}{" "}
              {testResult.status ? `[${testResult.status}] ` : ""}
              {testResult.message}
              {!testResult.configured && (
                <span className="block mt-1 text-amber-300">
                  Add AURORA_API_KEY and AURORA_TENANT_ID in Vercel, then redeploy.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {saveStatus && (
          <span className="text-xs text-slate-400">{saveStatus}</span>
        )}
        <button onClick={onSave} className="btn-primary px-5 py-2 text-xs">
          Save Aurora settings
        </button>
      </div>
    </div>
  );
}
