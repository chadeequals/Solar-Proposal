/**
 * Sundial v2 — Admin Gate Test Endpoint
 *
 * POST /api/admin/gate-test
 *   Accepts a partial Intake JSON, runs it through the current gate config,
 *   returns pass/fail + details. Used in the admin test panel.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Intake } from "@/lib/types";
import { evaluateGate } from "@/lib/gate";
import { getGateConfig, getTodaySpendUsd, getMonthSpendUsd } from "@/lib/store";

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token") ??
    req.cookies.get("sundial_admin")?.value;
  const expected = process.env.ADMIN_TOKEN ?? "sundial2026";
  return token === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as Partial<Intake>;

    const [config, todaySpend, monthSpend] = await Promise.all([
      getGateConfig(),
      getTodaySpendUsd(),
      getMonthSpendUsd(),
    ]);

    // Fill required fields with defaults for test purposes
    const testIntake: Intake = {
      session_id: "test-" + Date.now(),
      step_completed: body.step_completed ?? 8,
      street: body.street ?? "123 Test St",
      city: body.city ?? "Austin",
      state: body.state ?? "TX",
      zip: body.zip ?? "78701",
      ownership: body.ownership ?? "own",
      stories: body.stories ?? "1",
      attached_garage: body.attached_garage ?? false,
      trees: body.trees ?? "none",
      roof: body.roof ?? "asphalt_shingle",
      monthly_bill_usd: body.monthly_bill_usd ?? 150,
      utility: body.utility ?? "Oncor",
      first: body.first ?? "Test",
      last: body.last ?? "User",
      email: body.email ?? "test@example.com",
      phone: body.phone ?? "5125550100",
      opt_in_email: body.opt_in_email ?? true,
      opt_in_sms: body.opt_in_sms ?? false,
      ...body,
    };

    const evaluation = evaluateGate(testIntake, config, todaySpend, monthSpend);

    return NextResponse.json({
      success: true,
      evaluation,
      config_version: config.version,
      test_intake: testIntake,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request", details: String(err) },
      { status: 400 }
    );
  }
}
