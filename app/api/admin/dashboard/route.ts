/**
 * Sundial v2 — Admin Dashboard Data API
 *
 * GET /api/admin/dashboard
 *   Returns aggregate data for the admin dashboard:
 *   - Credit usage (today / month)
 *   - Recent Aurora API calls
 *   - Recent sessions
 *   - Gate pass rate
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGateConfig,
  getTodaySpendUsd,
  getMonthSpendUsd,
  getRecentCreditUsage,
  getRecentSessions,
  getCreditUsageToday,
  getCreditUsageThisMonth,
} from "@/lib/store";

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token") ??
    req.cookies.get("sundial_admin")?.value;
  const expected = process.env.ADMIN_TOKEN ?? "sundial2026";
  return token === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    config,
    sessions,
    creditToday,
    creditMonth,
    recentUsage,
    todayUsage,
    monthUsage,
  ] = await Promise.all([
    getGateConfig(),
    getRecentSessions(20),
    getTodaySpendUsd(),
    getMonthSpendUsd(),
    getRecentCreditUsage(50),
    getCreditUsageToday(),
    getCreditUsageThisMonth(),
  ]);

  // Calculate gate pass rate today
  const todaySessions = sessions.filter((s) => {
    const created = new Date(s.created_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return created >= today;
  });

  const passedToday = todaySessions.filter(
    (s) => s.status !== "gate_failed"
  ).length;

  const gatePassRateToday = todaySessions.length > 0
    ? passedToday / todaySessions.length
    : 0;

  return NextResponse.json({
    success: true,
    data: {
      gate_config: config,
      credit_usage_today_usd: creditToday,
      credit_usage_month_usd: creditMonth,
      recent_usage: recentUsage,
      recent_sessions: sessions,
      total_sessions_today: todaySessions.length,
      total_sessions_month: sessions.length, // Approximate (last 20 sessions)
      gate_pass_rate_today: gatePassRateToday,
      today_usage_entries: todayUsage.length,
      month_usage_entries: monthUsage.length,
    },
  });
}
