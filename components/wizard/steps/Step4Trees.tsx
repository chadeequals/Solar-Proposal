"use client";

/**
 * Step 4: Shade / Trees
 * none / few / heavy — card selection with visual impact indicator
 */

import type { TreeShade } from "@/lib/types";

const OPTIONS: {
  value: TreeShade;
  label: string;
  desc: string;
  production: string;
  color: string;
}[] = [
  {
    value: "none",
    label: "No Shade",
    desc: "Roof is fully exposed, no trees or obstructions",
    production: "Maximum production — ideal for solar",
    color: "text-green-400",
  },
  {
    value: "few",
    label: "Some Shade",
    desc: "A few trees or partial shading in certain hours",
    production: "5–15% production reduction — still excellent",
    color: "text-amber-400",
  },
  {
    value: "heavy",
    label: "Heavy Shade",
    desc: "Significant tree coverage or north-facing roof",
    production: "15–30% reduction — design review recommended",
    color: "text-orange-400",
  },
];

interface Props {
  value: TreeShade | "";
  onChange: (v: TreeShade) => void;
}

export default function Step4Trees({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`option-card w-full flex items-start gap-4 p-4 text-left ${
            value === opt.value ? "selected" : ""
          }`}
        >
          {/* Shade visual indicator */}
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-navy-800 flex items-center justify-center mt-0.5">
            {opt.value === "none" && (
              <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 1.78a1 1 0 011.42 1.42l-.71.71a1 1 0 01-1.42-1.42l.71-.71zm-9.86 0l.71.71A1 1 0 116.65 5.9l-.71-.71A1 1 0 016.36 3.78zM12 7a5 5 0 110 10A5 5 0 0112 7zm0 2a3 3 0 100 6 3 3 0 000-6zm9 3a1 1 0 110 2h-1a1 1 0 110-2h1zm-17 0a1 1 0 110 2H3a1 1 0 110-2h1zm14.36 5.64a1 1 0 011.42 1.42l-.71.71a1 1 0 01-1.42-1.42l.71-.71zm-12.72 0l.71.71a1 1 0 01-1.42 1.42l-.71-.71a1 1 0 011.42-1.42zM12 20a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" />
              </svg>
            )}
            {opt.value === "few" && (
              <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3l4 7H8l4-7zm0 8c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm-1 7h2v3h-2v-3z" />
              </svg>
            )}
            {opt.value === "heavy" && (
              <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3 5H9l3-5zm0 7c2 0 3.5 1.5 3.5 3.5S14 16 12 16s-3.5-1.5-3.5-3.5S10 9 12 9zm0 9c1 0 2 .3 2.8.8L16 21H8l1.2-2.2A5 5 0 0112 18z" />
              </svg>
            )}
          </div>

          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-100">{opt.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
            {value === opt.value && (
              <div className={`text-xs mt-1.5 font-medium ${opt.color}`}>
                ↑ {opt.production}
              </div>
            )}
          </div>

          {value === opt.value && (
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
