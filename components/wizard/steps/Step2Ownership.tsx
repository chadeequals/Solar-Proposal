"use client";

/**
 * Step 2: Ownership
 * Own / Buying / Rent — card selection
 */

import type { Ownership } from "@/lib/types";

const OPTIONS: { value: Ownership; label: string; desc: string; icon: string }[] = [
  {
    value: "own",
    label: "I Own It",
    desc: "Free and clear or with a mortgage",
    icon: "🏠",
  },
  {
    value: "buying",
    label: "Buying It",
    desc: "In escrow or under contract",
    icon: "📋",
  },
  {
    value: "rent",
    label: "I Rent",
    desc: "I don't own the property",
    icon: "🔑",
  },
];

interface Props {
  value: Ownership | "";
  onChange: (v: Ownership) => void;
}

export default function Step2Ownership({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`option-card w-full flex items-center gap-4 p-4 text-left ${
            value === opt.value ? "selected" : ""
          }`}
        >
          <span className="text-2xl flex-shrink-0">{opt.icon}</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-100">{opt.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
          </div>
          {value === opt.value && (
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      ))}

      {value === "rent" && (
        <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-300 leading-relaxed">
            <span className="font-semibold">Renters can&apos;t install solar</span> — but we can help!
            Share this with your landlord and we&apos;ll add you to our community solar waitlist.
          </p>
        </div>
      )}
    </div>
  );
}
