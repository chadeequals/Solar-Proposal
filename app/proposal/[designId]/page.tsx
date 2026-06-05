"use client";

/**
 * Sundial v2 — Solar Proposal Page
 *
 * Renders the complete proposal for a customer after Aurora pipeline completes.
 * URL: /proposal/[designId]
 *
 * Sections:
 *  1. Hero — property address + roof visualization (CSS/SVG, no images)
 *  2. System Specs — size, panels, production, CO2 offset
 *  3. Savings Chart — utility bill vs solar (CSS bar chart)
 *  4. Financing Table — 4 options side-by-side
 *  5. Call to Action — "Book your design call"
 *
 * In production:
 *  - Replace the session lookup with a Supabase query
 *  - Load real Aurora Web Proposal URL (or embed their hosted proposal)
 *  - Add PDF download via Puppeteer or Browserless
 *  - Add Calendly embed for the CTA
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { SundialSession, AuroraFinancingOption } from "@/lib/types";

export default function ProposalPage() {
  const params = useParams<{ designId: string }>();
  const designId = params?.designId;

  const [session, setSession] = useState<SundialSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!designId) return;
    fetchProposal(designId);
  }, [designId]);

  const fetchProposal = async (id: string) => {
    try {
      // Find the session that has this design ID
      // TODO: Replace with GET /api/proposals/[designId] → Supabase query
      const res = await fetch(`/api/proposal/${id}`);
      if (!res.ok) throw new Error("Proposal not found");
      const data = await res.json();
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ProposalSkeleton />;
  if (error || !session) return <ProposalError error={error} />;
  if (!session.aurora_design || !session.aurora_pricing) return <ProposalError error="Proposal data incomplete" />;

  const { intake, aurora_design: design, aurora_pricing: pricing, aurora_financing: financing } = session;

  return (
    <main className="min-h-screen pb-20">
      {/* ── Hero ─────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800" />
        {/* Solar grid overlay */}
        <div className="absolute inset-0 bg-solar-grid opacity-40" />
        {/* Radial glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]"
          style={{ background: "radial-gradient(ellipse at top, rgba(245,158,11,0.12) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-5xl mx-auto px-6 py-16">
          {/* Logo + badge */}
          <div className="flex items-center gap-3 mb-10">
            <SundialMark />
            <div>
              <div className="text-xs font-bold tracking-widest text-amber-500 uppercase">
                Sundial · Solar Proposal
              </div>
              <div className="text-xs text-slate-500">Powered by Victory Energy</div>
            </div>
            <div className="ml-auto">
              <span className="badge badge-green">Aurora Verified</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Address + intro */}
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold text-slate-100 leading-tight mb-3">
                Your Home.
                <br />
                <span className="font-serif italic text-amber-400">Solar Ready.</span>
              </h1>
              <p className="text-slate-400 text-lg mb-6">
                We&apos;ve analyzed your roof, sized your system, and built your
                custom proposal — all in minutes.
              </p>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <span>{intake.street}, {intake.city}, {intake.state} {intake.zip}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400 mt-1 ml-6">
                <span>Prepared for {intake.first} {intake.last}</span>
              </div>
            </div>

            {/* Roof visualization — pure CSS/SVG */}
            <RoofVisualization
              systemSizeKw={design.system_size_kw}
              panelCount={design.panel_count}
            />
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6 space-y-8 mt-8">
        {/* ── System Specs ──────────────────── */}
        <section>
          <SectionHeading tag="System Design" title="Your Solar System" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="System Size"
              value={`${design.system_size_kw} kW`}
              sub="DC nameplate"
              icon="⚡"
            />
            <StatCard
              label="Solar Panels"
              value={String(design.panel_count)}
              sub="400W REC Alpha"
              icon="☀️"
            />
            <StatCard
              label="Annual Production"
              value={design.annual_production_kwh.toLocaleString()}
              sub="kWh per year"
              icon="📈"
            />
            <StatCard
              label="CO₂ Offset"
              value={`${design.co2_offset_tons_annual} tons`}
              sub="per year"
              icon="🌱"
            />
          </div>

          {/* Bill of materials */}
          {design.bill_of_materials.length > 0 && (
            <div className="mt-4 card-navy p-5">
              <h3 className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-3">
                Equipment
              </h3>
              <div className="space-y-2">
                {design.bill_of_materials.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-slate-200 font-medium">{item.manufacturer} {item.model}</span>
                      <span className="text-slate-500 ml-2 text-xs">×{item.quantity}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-xs">
                      ${item.total_price_usd.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Savings Chart ─────────────────── */}
        <section>
          <SectionHeading tag="Financial Analysis" title="Your 25-Year" headingItalic="Savings" />
          <SavingsChart
            monthlyBill={intake.monthly_bill_usd}
            annualProduction={design.annual_production_kwh}
            netPrice={pricing.net_price_usd}
            grossPrice={pricing.gross_price_usd}
            itcCredit={pricing.itc_credit_usd}
          />
        </section>

        {/* ── Financing Options ─────────────── */}
        <section>
          <SectionHeading tag="Financing" title="Choose Your" headingItalic="Payment Option" />
          {financing && financing.length > 0 ? (
            <FinancingTable options={financing} netPrice={pricing.net_price_usd} />
          ) : (
            <p className="text-sm text-slate-500">Financing options loading…</p>
          )}
        </section>

        {/* ── CTA ───────────────────────────── */}
        <section className="text-center py-12">
          <div className="relative inline-block">
            {/* Glow ring */}
            <div className="absolute -inset-4 rounded-2xl bg-amber-500/10 blur-xl" />
            <div className="relative card-navy p-8 max-w-md mx-auto">
              <div className="text-3xl mb-4">☀️</div>
              <h2 className="text-2xl font-bold text-slate-100 mb-2">
                Ready to go solar,{" "}
                <span className="font-serif italic text-amber-400">{intake.first}?</span>
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Book a free design call with one of our solar engineers.
                We&apos;ll walk through your proposal and answer every question.
              </p>
              {/* TODO: Replace with real Calendly embed or booking system */}
              <button
                className="btn-gold w-full py-4 text-base font-bold rounded-xl"
                onClick={() => alert("In production: opens Calendly or booking flow")}
              >
                Book Your Design Call →
              </button>
              <p className="text-xs text-slate-600 mt-3">
                Free · No obligation · 30 minutes · Available same week
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="text-center mt-8 text-xs text-slate-700 pb-8">
        Proposal generated by Sundial v2 · Victory Energy · Design ID: {designId}
        <br />
        <a href="/" className="text-amber-500/30 hover:text-amber-500/60 mt-1 inline-block">
          Get a quote for another property →
        </a>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function SundialMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="16" y1="2" x2="16" y2="7" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="25" x2="16" y2="30" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="16" x2="7" y2="16" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="25" y1="16" x2="30" y2="16" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="5.5" y1="5.5" x2="9.2" y2="9.2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="22.8" y1="22.8" x2="26.5" y2="26.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="26.5" y1="5.5" x2="22.8" y2="9.2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="9.2" y1="22.8" x2="5.5" y2="26.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="6" fill="#f59e0b" />
      <circle cx="16" cy="16" r="4" fill="#fcd34d" />
    </svg>
  );
}

function SectionHeading({
  tag,
  title,
  headingItalic,
}: {
  tag: string;
  title: string;
  headingItalic?: string;
}) {
  return (
    <div className="mb-5">
      <span className="text-[10px] font-bold tracking-[0.2em] text-amber-500/70 uppercase">
        {tag}
      </span>
      <h2 className="text-2xl font-bold text-slate-100 mt-1">
        {title}{" "}
        {headingItalic && (
          <span className="font-serif italic text-amber-400">{headingItalic}</span>
        )}
      </h2>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: string;
}) {
  return (
    <div className="card-navy p-5 text-center">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-xl font-bold text-amber-400 font-mono">{value}</div>
      <div className="text-xs font-semibold text-slate-200 mt-1">{label}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function RoofVisualization({
  systemSizeKw,
  panelCount,
}: {
  systemSizeKw: number;
  panelCount: number;
}) {
  // Generate a panel grid layout — pure SVG, no images
  const cols = Math.min(8, Math.ceil(Math.sqrt(panelCount)));
  const rows = Math.ceil(panelCount / cols);
  const panels = Array.from({ length: panelCount });

  return (
    <div className="relative">
      <div
        className="card-navy p-6 relative overflow-hidden"
        style={{ background: "rgba(10, 14, 39, 0.9)" }}
      >
        {/* Roof background shape */}
        <div className="absolute inset-0 flex items-end justify-center pb-4">
          <svg viewBox="0 0 300 180" className="w-full opacity-10">
            <polygon points="0,180 150,20 300,180" fill="#f59e0b" />
          </svg>
        </div>

        {/* Panel grid */}
        <div className="relative z-10">
          <div className="text-xs text-amber-500/60 font-semibold tracking-widest uppercase text-center mb-4">
            Roof Layout — {systemSizeKw} kW System
          </div>
          <div
            className="grid gap-1 mx-auto"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              maxWidth: `${cols * 36}px`,
            }}
          >
            {panels.map((_, i) => (
              <div
                key={i}
                className="rounded-sm"
                style={{
                  width: "28px",
                  height: "20px",
                  background: "linear-gradient(135deg, #1e3a5f 0%, #1a3050 30%, #152540 60%, #0f1a2e 100%)",
                  border: "1px solid rgba(245, 158, 11, 0.2)",
                  boxShadow: "inset 0 0 4px rgba(245,158,11,0.1)",
                }}
              >
                {/* Panel cell lines */}
                <svg viewBox="0 0 28 20" className="w-full h-full opacity-40">
                  <line x1="14" y1="0" x2="14" y2="20" stroke="#f59e0b" strokeWidth="0.5" />
                  <line x1="0" y1="10" x2="28" y2="10" stroke="#f59e0b" strokeWidth="0.5" />
                </svg>
              </div>
            ))}
          </div>
          <div className="text-center mt-4 text-xs text-slate-500">
            {panelCount} × REC Alpha 400W panels
          </div>
        </div>
      </div>
    </div>
  );
}

function SavingsChart({
  monthlyBill,
  annualProduction,
  netPrice,
  grossPrice,
  itcCredit,
}: {
  monthlyBill: number;
  annualProduction: number;
  netPrice: number;
  grossPrice: number;
  itcCredit: number;
}) {
  const annualBill = monthlyBill * 12;
  const annualSolarCost = netPrice / 25; // Simple straight-line
  const annualSavings = annualBill - annualSolarCost;
  const lifetimeSavings = annualSavings * 25;
  const paybackYears = (netPrice / annualSavings).toFixed(1);

  // Build chart data — 5-year intervals
  const chartYears = [5, 10, 15, 20, 25];
  const maxVal = annualBill * 25; // Worst case

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <PriceCard label="System Cost (Gross)" value={`$${grossPrice.toLocaleString()}`} sub="Before ITC" />
        <PriceCard label="Federal ITC (30%)" value={`-$${itcCredit.toLocaleString()}`} sub="Tax credit" accent="green" />
        <PriceCard label="Net Cost" value={`$${netPrice.toLocaleString()}`} sub="After ITC" />
        <PriceCard label="25-Year Savings" value={`$${Math.max(0, lifetimeSavings).toLocaleString()}`} sub={`Payback: ~${paybackYears} yrs`} accent="gold" />
      </div>

      {/* CSS bar chart */}
      <div className="card-navy p-6">
        <div className="flex items-center gap-4 mb-5 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-slate-600" />
            <span className="text-slate-400">Utility Bill (no solar)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-amber-500" />
            <span className="text-slate-400">With Solar</span>
          </div>
        </div>

        <div className="flex items-end justify-around gap-3 h-40">
          {chartYears.map((year) => {
            const withoutSolar = annualBill * year;
            const withSolar = netPrice + (annualBill * 0.05 * year); // 5% residual bill
            const withoutPct = (withoutSolar / maxVal) * 100;
            const withPct = (withSolar / maxVal) * 100;

            return (
              <div key={year} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex gap-1 items-end" style={{ height: "100px" }}>
                  <div
                    className="flex-1 rounded-t-sm bg-slate-700/60"
                    style={{ height: `${withoutPct}%` }}
                  />
                  <div
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${withPct}%`,
                      background: "linear-gradient(to top, #d97706, #f59e0b)",
                    }}
                  />
                </div>
                <span className="text-[10px] text-slate-500">Yr {year}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
          <span>Total without solar (25 yr): ${(annualBill * 25).toLocaleString()}</span>
          <span className="text-green-400 font-semibold">
            You save: ${Math.max(0, lifetimeSavings).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function PriceCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "green" | "gold" | "red";
}) {
  const colors = {
    green: "text-green-400",
    gold: "text-amber-400",
    red: "text-red-400",
    default: "text-slate-200",
  };
  return (
    <div className="card-navy p-4 text-center">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${colors[accent ?? "default"]}`}>{value}</div>
      <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>
    </div>
  );
}

function FinancingTable({ options, netPrice }: { options: AuroraFinancingOption[]; netPrice: number }) {
  const TYPE_ICON: Record<string, string> = {
    loan: "💳",
    ppa: "📄",
    lease: "🏠",
    cash: "💵",
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {options.map((opt, i) => (
        <div
          key={opt.id}
          className={`card-navy p-5 flex flex-col gap-3 ${i === 0 ? "ring-1 ring-amber-500/40" : ""}`}
        >
          {i === 0 && (
            <span className="badge badge-yellow text-[9px] -mt-1 self-start">Most Popular</span>
          )}

          <div className="text-xl">{TYPE_ICON[opt.type] ?? "💰"}</div>

          <div>
            <div className="text-xs text-amber-500 font-semibold">{opt.lender}</div>
            <div className="text-sm font-bold text-slate-100 mt-0.5">{opt.product_name}</div>
          </div>

          <div>
            {opt.monthly_payment_usd > 0 ? (
              <>
                <span className="text-3xl font-bold text-amber-400 font-mono">
                  ${opt.monthly_payment_usd}
                </span>
                <span className="text-xs text-slate-500">/mo</span>
              </>
            ) : (
              <div>
                <span className="text-2xl font-bold text-amber-400 font-mono">
                  ${opt.down_payment_usd.toLocaleString()}
                </span>
                <div className="text-xs text-slate-500">cash purchase</div>
              </div>
            )}
          </div>

          <div className="space-y-1 text-xs text-slate-400 flex-1">
            <div className="flex justify-between">
              <span>Term</span>
              <span className="text-slate-200">{opt.term_years} years</span>
            </div>
            {opt.apr_percentage && (
              <div className="flex justify-between">
                <span>APR</span>
                <span className="text-slate-200">{opt.apr_percentage}%</span>
              </div>
            )}
            {opt.escalator_percentage && (
              <div className="flex justify-between">
                <span>Escalator</span>
                <span className="text-slate-200">{opt.escalator_percentage}%/yr</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Down payment</span>
              <span className="text-slate-200">${opt.down_payment_usd.toLocaleString()}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/5">
            <div className="text-[10px] text-slate-500 mb-0.5">25-Year Savings</div>
            <div className={`text-sm font-bold font-mono ${opt.total_25_year_savings_usd > 0 ? "text-green-400" : "text-slate-500"}`}>
              {opt.total_25_year_savings_usd > 0 ? "+" : ""}
              ${Math.abs(opt.total_25_year_savings_usd).toLocaleString()}
            </div>
          </div>

          <p className="text-[10px] text-slate-600 leading-relaxed">{opt.description}</p>
        </div>
      ))}
    </div>
  );
}

function ProposalSkeleton() {
  return (
    <main className="min-h-screen p-8 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 animate-pulse mx-auto mb-4" />
        <div className="text-sm text-slate-400">Loading your proposal…</div>
      </div>
    </main>
  );
}

function ProposalError({ error }: { error: string }) {
  return (
    <main className="min-h-screen p-8 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-100 mb-2">Proposal Not Found</h2>
        <p className="text-sm text-slate-400 mb-4">{error || "This proposal may have expired or the link is invalid."}</p>
        <a href="/" className="btn-gold inline-block px-6 py-3 text-sm font-bold rounded-lg">
          Get a New Quote
        </a>
      </div>
    </main>
  );
}
