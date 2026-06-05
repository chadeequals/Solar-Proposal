"use client";

/**
 * Step 6: Utility Bill + Provider
 * Slider $40-$650 + utility dropdown + real-time savings estimate
 */

import { useState } from "react";

// All approved utilities from the gate config seed
const UTILITIES = [
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
  // Other
  "Other",
];

interface Props {
  bill: number;
  utility: string;
  onBillChange: (v: number) => void;
  onUtilityChange: (v: string) => void;
}

/** Simple savings estimate: solar saves ~90% of bill, 25-year projection */
function calcSavings(monthlyBill: number) {
  const monthlySavings = monthlyBill * 0.88;
  const annualSavings = monthlySavings * 12;
  const lifetime = annualSavings * 25;
  return { monthly: Math.round(monthlySavings), annual: Math.round(annualSavings), lifetime: Math.round(lifetime) };
}

/** Estimate system size from monthly bill */
function estimateSystemKw(bill: number): string {
  const kw = Math.max(3, Math.min(20, (bill / 0.135 / 12) * (1 / 1400) * 12));
  return kw.toFixed(1);
}

export default function Step6Bill({
  bill,
  utility,
  onBillChange,
  onUtilityChange,
}: Props) {
  const savings = calcSavings(bill);
  const systemKw = estimateSystemKw(bill);

  // Track slider interaction for animated feedback
  const [touched, setTouched] = useState(false);

  return (
    <div className="space-y-6">
      {/* Bill slider */}
      <div>
        <div className="flex items-end justify-between mb-2">
          <label className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
            Avg Monthly Electric Bill
          </label>
          <div className="text-right">
            <span className="text-3xl font-bold text-amber-400 font-mono">${bill}</span>
            <span className="text-xs text-slate-500 ml-1">/mo</span>
          </div>
        </div>

        <input
          type="range"
          min={40}
          max={650}
          step={5}
          value={bill}
          onChange={(e) => {
            onBillChange(Number(e.target.value));
            setTouched(true);
          }}
          className="w-full"
          style={{
            background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${((bill - 40) / (650 - 40)) * 100}%, rgba(255,255,255,0.1) ${((bill - 40) / (650 - 40)) * 100}%, rgba(255,255,255,0.1) 100%)`
          }}
        />

        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>$40</span>
          <span>$650</span>
        </div>
      </div>

      {/* Real-time savings card */}
      <div className="card-navy p-5 space-y-3 relative overflow-hidden">
        {/* Accent glow */}
        <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-amber-500/10 blur-xl" />

        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs font-semibold tracking-wide text-amber-500 uppercase">
            Estimated Solar Savings
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xl font-bold text-green-400 font-mono">
              ${savings.monthly}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">per month</div>
          </div>
          <div className="text-center border-x border-white/5">
            <div className="text-xl font-bold text-green-400 font-mono">
              ${savings.annual.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">per year</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-amber-400 font-mono">
              ${savings.lifetime.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">25-year total</div>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Estimated system size</span>
            <span className="font-mono font-semibold text-amber-400">{systemKw} kW</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-600">
          *Estimates based on typical production in your region. Exact numbers in your proposal.
        </p>
      </div>

      {/* Utility dropdown */}
      <div>
        <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
          Electric Utility Provider
        </label>
        <select
          value={utility}
          onChange={(e) => onUtilityChange(e.target.value)}
          className="input-dark w-full px-4 py-3 text-sm"
        >
          <option value="">Select your utility…</option>
          {UTILITIES.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Your utility determines your rate, net metering policy, and interconnection timeline.
        </p>
      </div>
    </div>
  );
}
