/**
 * Sundial v2 — Gate Evaluator
 *
 * Evaluates an intake submission against admin-configured gate rules to
 * determine whether the Aurora Solar API pipeline should be triggered.
 *
 * Key design principles:
 *  - Deterministic: same intake + config always produces same result
 *  - Admin-owned: no hard-coded rules — all logic driven by GateConfig
 *  - Transparent: returns detailed failure reasons for admin UI
 *
 * TODO: In production, load gate config from Supabase (with Redis caching)
 *       instead of the in-memory store
 */

import type {
  Intake,
  GateConfig,
  GateRule,
  GateEvaluation,
  FailedRule,
  RuleOperator,
} from "./types";

// ─────────────────────────────────────────────
// OPERATOR LOGIC
// ─────────────────────────────────────────────

function applyOperator(
  actual: string | number | boolean | undefined,
  operator: RuleOperator,
  expected: string | number | string[] | number[]
): boolean {
  if (actual === undefined || actual === null) return false;

  switch (operator) {
    case "equals":
      return String(actual).toLowerCase() === String(expected).toLowerCase();

    case "not_equals":
      return String(actual).toLowerCase() !== String(expected).toLowerCase();

    case "in": {
      const list = Array.isArray(expected) ? expected : [expected];
      return list.map((v) => String(v).toLowerCase()).includes(String(actual).toLowerCase());
    }

    case "not_in": {
      const list = Array.isArray(expected) ? expected : [expected];
      return !list.map((v) => String(v).toLowerCase()).includes(String(actual).toLowerCase());
    }

    case "gte":
      return Number(actual) >= Number(expected);

    case "lte":
      return Number(actual) <= Number(expected);

    case "gt":
      return Number(actual) > Number(expected);

    case "lt":
      return Number(actual) < Number(expected);

    default:
      return false;
  }
}

// ─────────────────────────────────────────────
// RULE EVALUATOR
// ─────────────────────────────────────────────

function evaluateRule(intake: Intake, rule: GateRule): FailedRule | null {
  const actualValue = intake[rule.field] as string | number | boolean | undefined;
  const passes = applyOperator(actualValue, rule.operator, rule.value);

  if (passes) return null; // Rule passed — no failure

  const valueDisplay = Array.isArray(rule.value)
    ? rule.value.join(", ")
    : String(rule.value);

  return {
    rule,
    actual_value: actualValue,
    message: `"${rule.label}": expected ${rule.field} ${rule.operator} [${valueDisplay}], got "${actualValue}"`,
  };
}

// ─────────────────────────────────────────────
// CREDIT USAGE CHECK
// These functions are stubs — in production they query the usage log
// TODO: Replace with Supabase aggregate queries
// ─────────────────────────────────────────────

// Imported from the store to avoid circular deps
// Credit usage is checked externally before calling evaluateGate
export const ESTIMATED_AURORA_COST_USD = 18.50; // Mid-range estimate (~$15-22)

// ─────────────────────────────────────────────
// MAIN GATE EVALUATOR
// ─────────────────────────────────────────────

export function evaluateGate(
  intake: Intake,
  config: GateConfig,
  creditUsedTodayUsd: number = 0,
  creditUsedMonthUsd: number = 0
): GateEvaluation {
  const warnings: FailedRule[] = [];
  const failed_rules: FailedRule[] = [];

  // 1. Evaluate each rule
  for (const rule of config.rules) {
    const failure = evaluateRule(intake, rule);
    if (!failure) continue; // Rule passed

    if (rule.warn_only) {
      warnings.push(failure);
    } else if (rule.required) {
      failed_rules.push(failure);
    } else {
      // Non-required, non-warn: still record but doesn't block
      warnings.push(failure);
    }
  }

  const rulesPass = failed_rules.length === 0;

  // 2. Check trigger step
  const stepMet = intake.step_completed >= config.trigger_step;

  // 3. Check credit caps
  const dailyCapExceeded = creditUsedTodayUsd + ESTIMATED_AURORA_COST_USD > config.daily_credit_cap_usd;
  const monthlyCapExceeded = creditUsedMonthUsd + ESTIMATED_AURORA_COST_USD > config.monthly_credit_cap_usd;
  const capsOk = !dailyCapExceeded && !monthlyCapExceeded;

  // 4. Determine final pass/fail
  const passed = rulesPass && stepMet && config.aurora_enabled && capsOk;
  const should_trigger_aurora = passed;

  // 5. Build reason string for admin UI
  let reason = "";
  if (!config.aurora_enabled) {
    reason = "Aurora integration is globally disabled";
  } else if (!stepMet) {
    reason = `Trigger step not reached (${intake.step_completed} < ${config.trigger_step})`;
  } else if (dailyCapExceeded) {
    reason = `Daily credit cap would be exceeded ($${creditUsedTodayUsd.toFixed(2)} + $${ESTIMATED_AURORA_COST_USD} > $${config.daily_credit_cap_usd})`;
  } else if (monthlyCapExceeded) {
    reason = `Monthly credit cap would be exceeded ($${creditUsedMonthUsd.toFixed(2)} + $${ESTIMATED_AURORA_COST_USD} > $${config.monthly_credit_cap_usd})`;
  } else if (!rulesPass) {
    const labels = failed_rules.map((f) => f.rule.label).join(", ");
    reason = `Failed required rules: ${labels}`;
  } else {
    reason = "All conditions met — Aurora pipeline will be triggered";
  }

  return {
    passed,
    should_trigger_aurora,
    warnings,
    failed_rules,
    estimated_credit_cost_usd: ESTIMATED_AURORA_COST_USD,
    reason,
  };
}

// ─────────────────────────────────────────────
// DEFAULT SEED CONFIG
// This is the production-ready default for Victory Energy markets.
// Admin can modify at runtime without redeploying.
// ─────────────────────────────────────────────

export const DEFAULT_GATE_CONFIG: GateConfig = {
  version: 1,
  aurora_enabled: true,
  trigger_step: 8, // Trigger after full wizard completion
  monthly_credit_cap_usd: 2000, // ~108 Aurora projects/month
  daily_credit_cap_usd: 200,   // ~10 Aurora projects/day (conservative default)
  fallback_action: "lead_only",
  lender_pre_qual_required: false,
  // Real Aurora is off by default — admin opts in per session via allow-list
  aurora_real_enabled: false,
  aurora_allow_list_emails: [],
  aurora_allow_list_session_ids: [],
  updated_at: new Date().toISOString(),
  rules: [
    // ── State Eligibility ──────────────────────────────
    {
      id: "rule_state_approved",
      label: "State is in approved markets",
      field: "state",
      operator: "in",
      value: ["TX", "AZ", "NV", "FL", "CA"],
      required: true,
      warn_only: false,
    },

    // ── Utility Eligibility (approved utility territories) ──
    {
      id: "rule_utility_approved",
      label: "Utility is in approved list",
      field: "utility",
      operator: "in",
      value: [
        // Texas
        "Oncor",
        "CenterPoint Energy",
        "AEP Texas",
        "TNMP",
        // Arizona
        "APS",
        "SRP",
        // Nevada
        "NV Energy",
        // Florida
        "FPL",
        "Duke Energy Florida",
        // California
        "PG&E",
        "SCE",
        "SDG&E",
        // Other/Unknown (allow through — sales can qualify)
        "Other",
      ],
      required: true,
      warn_only: false,
    },

    // ── Ownership ─────────────────────────────────────
    {
      id: "rule_ownership",
      label: "Customer owns or is buying the property",
      field: "ownership",
      operator: "in",
      value: ["own", "buying"],
      required: true,
      warn_only: false,
    },

    // ── Minimum Bill ──────────────────────────────────
    // Below $80/mo: system too small to justify Aurora cost
    {
      id: "rule_min_bill",
      label: "Monthly bill is at least $80",
      field: "monthly_bill_usd",
      operator: "gte",
      value: 80,
      required: true,
      warn_only: false,
    },

    // ── Roof Material Warnings (design challenges, not blockers) ──
    {
      id: "rule_slate_warn",
      label: "Slate roof warning (higher install cost)",
      field: "roof",
      operator: "not_equals",
      value: "slate",
      required: false,
      warn_only: true,
    },
    {
      id: "rule_wood_shake_warn",
      label: "Wood shake roof warning (fire risk / permit issues)",
      field: "roof",
      operator: "not_equals",
      value: "wood_shake",
      required: false,
      warn_only: true,
    },

    // ── Heavy Shade Warning (production impact) ──────
    {
      id: "rule_heavy_shade_warn",
      label: "Heavy shade warning (significant production impact)",
      field: "trees",
      operator: "not_equals",
      value: "heavy",
      required: false,
      warn_only: true,
    },
  ],
};
