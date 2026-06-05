/**
 * Sundial v2 — Core TypeScript Types
 *
 * This file defines the canonical data shapes for the entire application.
 * Production swap points are marked with TODO comments.
 *
 * Key entities:
 *  - Intake: customer-submitted solar quote data
 *  - GateConfig/GateRule: admin-configurable Aurora qualification gate
 *  - GateEvaluation: result of evaluating an intake against a gate config
 *  - Aurora*: mirror shapes from Aurora Solar API (docs.aurorasolar.com)
 *  - SundialSession: full session tracking intake → design → proposal
 */

// ─────────────────────────────────────────────
// INTAKE — 8-step wizard data
// ─────────────────────────────────────────────

export type RoofMaterial =
  | "asphalt_shingle"
  | "metal"
  | "tile"
  | "slate"
  | "wood_shake"
  | "flat_membrane"
  | "dont_know";

export type TreeShade = "none" | "few" | "heavy";

export type Ownership = "own" | "buying" | "rent";

export type Stories = "1" | "2" | "3+";

export interface Intake {
  // Address (Step 1)
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;

  // Ownership (Step 2)
  ownership: Ownership;

  // Home Details (Step 3)
  stories: Stories;
  attached_garage: boolean;

  // Trees / Shade (Step 4)
  trees: TreeShade;

  // Roof (Step 5)
  roof: RoofMaterial;

  // Utility Bill (Step 6)
  monthly_bill_usd: number;
  utility: string;

  // Contact (Step 7)
  first: string;
  last: string;
  email: string;
  phone: string;

  // Consent (Step 8)
  opt_in_email: boolean;
  opt_in_sms: boolean;

  // Session tracking
  session_id: string;
  step_completed: number; // 1-8, updated as user progresses
  submitted_at?: string;  // ISO timestamp set on final submit
}

// ─────────────────────────────────────────────
// GATE CONFIG — admin-configurable qualification rules
// ─────────────────────────────────────────────

export type RuleOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "gte"
  | "lte"
  | "gt"
  | "lt";

export type FallbackAction = "lead_only" | "wait_list" | "manual_review";

export interface GateRule {
  id: string;
  label: string;         // Human-readable name, e.g. "State is in approved list"
  field: keyof Intake;   // Which intake field to evaluate
  operator: RuleOperator;
  value: string | number | string[] | number[]; // Comparison value
  required: boolean;     // If true, failure blocks Aurora; if false, warning only
  warn_only: boolean;    // If true, logs warning but does not block
}

export interface GateConfig {
  version: number;          // Incremented on each save
  aurora_enabled: boolean;  // Global kill switch for Aurora integration
  trigger_step: number;     // 1-12: minimum step_completed to trigger Aurora
  monthly_credit_cap_usd: number;  // Stop Aurora if monthly spend exceeds this
  daily_credit_cap_usd: number;    // Stop Aurora if today's spend exceeds this
  rules: GateRule[];
  fallback_action: FallbackAction; // What to do when gate fails
  lender_pre_qual_required: boolean; // Future: require financing pre-qual first

  // ── Real-Aurora rollout controls ──────────────────────
  // Master switch — if false, every session uses the mock client even if
  // the allow-lists below match. If true, sessions matching an allow-list
  // hit real Aurora; everything else still uses mock.
  aurora_real_enabled: boolean;
  // Emails (case-insensitive) and session IDs that should be routed to
  // the real Aurora API. Empty arrays → nothing goes to real Aurora.
  aurora_allow_list_emails: string[];
  aurora_allow_list_session_ids: string[];

  updated_at?: string;     // ISO timestamp of last save
  updated_by?: string;     // Admin user who last saved (for future auth)
}

// ─────────────────────────────────────────────
// GATE EVALUATION — result of evaluateGate()
// ─────────────────────────────────────────────

export interface FailedRule {
  rule: GateRule;
  actual_value: string | number | boolean | undefined;
  message: string;
}

export interface GateEvaluation {
  passed: boolean;
  should_trigger_aurora: boolean;  // true only when ALL conditions met
  warnings: FailedRule[];          // warn_only rules that triggered
  failed_rules: FailedRule[];      // required rules that failed (blocks Aurora)
  estimated_credit_cost_usd: number; // Estimated cost if Aurora runs
  reason: string;                  // Human-readable summary for admin UI
}

// ─────────────────────────────────────────────
// AURORA API SHAPES — mirror docs.aurorasolar.com
// TODO: In production, generate these from Aurora's OpenAPI spec
// ─────────────────────────────────────────────

export interface AuroraProject {
  id: string;
  name: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  property_address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
  };
  created_at: string;
  status: "active" | "archived";
}

export interface AuroraDesignComponent {
  id: string;
  type: "panel" | "inverter" | "battery" | "other";
  manufacturer: string;
  model: string;
  quantity: number;
  unit_price_usd: number;
  total_price_usd: number;
}

export interface AuroraDesignSummary {
  id: string;
  project_id: string;
  status: "processing" | "complete" | "failed";
  system_size_kw: number;        // DC nameplate capacity
  system_size_ac: number;        // AC output
  panel_count: number;
  annual_production_kwh: number;
  offset_percentage: number;     // % of current usage offset by solar
  specific_yield: number;        // kWh/kWp
  co2_offset_tons_annual: number;
  bill_of_materials: AuroraDesignComponent[];
  created_at: string;
}

export interface AuroraPricing {
  design_id: string;
  gross_price_usd: number;
  itc_credit_usd: number;        // 30% federal ITC
  net_price_usd: number;         // After ITC
  price_per_watt: number;
  price_per_kwh_lifetime: number;
  equipment_cost_usd: number;
  installation_cost_usd: number;
  permit_fee_usd: number;
  created_at: string;
}

export interface AuroraFinancingOption {
  id: string;
  lender: string;               // e.g. "GoodLeap", "Sunlight Financial"
  product_name: string;         // e.g. "25-Year PPA", "12-Year Solar Loan"
  type: "ppa" | "loan" | "lease" | "cash";
  monthly_payment_usd: number;
  term_years: number;
  apr_percentage?: number;       // For loans
  escalator_percentage?: number; // Annual rate increase for PPAs/leases
  down_payment_usd: number;
  total_25_year_savings_usd: number;
  total_25_year_cost_usd: number;
  description: string;
}

export interface AuroraWebProposal {
  id: string;
  design_id: string;
  shareable_url: string;        // In mock: /proposal/{designId}
  created_at: string;
  expires_at?: string;
}

// ─────────────────────────────────────────────
// CREDIT USAGE LOG — track Aurora API spend
// TODO: Replace with Supabase table for persistence
// ─────────────────────────────────────────────

export type AuroraApiCallType =
  | "create_project"
  | "ai_site_model"
  | "auto_designer"
  | "get_pricing"
  | "get_financing"
  | "create_web_proposal";

export type AuroraMode = "mock" | "real" | "partial";

export interface CreditUsageEntry {
  id: string;
  session_id: string;
  call_type: AuroraApiCallType;
  cost_usd: number;
  timestamp: string;
  project_id?: string;
  design_id?: string;
  success: boolean;
  error?: string;
  mode?: "mock" | "real";  // "partial" is session-level only
}

// ─────────────────────────────────────────────
// SUNDIAL SESSION — full session state machine
// ─────────────────────────────────────────────

export type SessionStatus =
  | "intake"           // User filling out wizard
  | "gate_failed"      // Did not pass qualification gate
  | "designing"        // Aurora pipeline in progress
  | "design_ready"     // Aurora design complete, creating proposal
  | "complete"         // Proposal URL ready
  | "error";           // Something went wrong

export interface SundialSession {
  id: string;                         // session_id, matches intake.session_id
  intake: Intake;
  gate_evaluation?: GateEvaluation;
  gate_config_version?: number;       // Which config version was used
  aurora_project?: AuroraProject;
  aurora_design?: AuroraDesignSummary;
  aurora_pricing?: AuroraPricing;
  aurora_financing?: AuroraFinancingOption[];
  aurora_proposal?: AuroraWebProposal;
  status: SessionStatus;
  proposal_url?: string;              // Final shareable URL
  created_at: string;
  updated_at: string;
  error_message?: string;
  // Tells the admin whether this session hit real Aurora, the mock
  // client, or fell through partially. Populated by the router.
  aurora_mode?: AuroraMode;
  // Names of Aurora calls that fell back to mock for this session.
  // e.g. ["ai_site_model"] means real Aurora was attempted but the
  // AI site model call failed and mock filled in.
  aurora_fallback_calls?: string[];
}

// ─────────────────────────────────────────────
// API RESPONSE SHAPES
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface IntakeSubmitResponse {
  session_id: string;
  status: SessionStatus;
  passed_gate: boolean;
  gate_evaluation: GateEvaluation;
  message: string;
}

export interface SessionStatusResponse {
  session_id: string;
  status: SessionStatus;
  proposal_url?: string;
  error_message?: string;
  progress_message: string; // Human-readable status for UI polling
}

// ─────────────────────────────────────────────
// ADMIN UI TYPES
// ─────────────────────────────────────────────

export interface AdminDashboardData {
  gate_config: GateConfig;
  credit_usage_today_usd: number;
  credit_usage_month_usd: number;
  recent_usage: CreditUsageEntry[];
  recent_sessions: SundialSession[];
  total_sessions_today: number;
  total_sessions_month: number;
  gate_pass_rate_today: number; // 0-1
}

export interface GateTestRequest {
  intake: Partial<Intake>;
}

export interface GateTestResponse {
  evaluation: GateEvaluation;
  config_version: number;
}
