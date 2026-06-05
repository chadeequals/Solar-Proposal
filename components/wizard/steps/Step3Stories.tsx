"use client";

/**
 * Step 3: Home Details
 * Stories (1 / 2 / 3+) + attached garage checkbox
 */

import type { Stories } from "@/lib/types";

const STORY_OPTIONS: { value: Stories; label: string; desc: string }[] = [
  { value: "1", label: "1 Story", desc: "Ranch or single-level" },
  { value: "2", label: "2 Stories", desc: "Two-level home" },
  { value: "3+", label: "3+ Stories", desc: "Three or more levels" },
];

interface Props {
  stories: Stories | "";
  attached_garage: boolean;
  onStoriesChange: (v: Stories) => void;
  onGarageChange: (v: boolean) => void;
}

export default function Step3Stories({
  stories,
  attached_garage,
  onStoriesChange,
  onGarageChange,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Stories toggle */}
      <div>
        <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-3">
          Number of Stories
        </label>
        <div className="flex gap-3">
          {STORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStoriesChange(opt.value)}
              className={`option-card flex-1 flex flex-col items-center justify-center p-4 text-center ${
                stories === opt.value ? "selected" : ""
              }`}
            >
              <span className="text-lg font-bold text-amber-400 mb-1">{opt.value}</span>
              <span className="text-xs text-slate-300">{opt.label.split(" ")[1]}</span>
              <span className="text-[10px] text-slate-500 mt-1">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Garage checkbox */}
      <div
        className={`option-card flex items-center gap-4 p-4 cursor-pointer ${
          attached_garage ? "selected" : ""
        }`}
        onClick={() => onGarageChange(!attached_garage)}
        role="checkbox"
        aria-checked={attached_garage}
        tabIndex={0}
        onKeyDown={(e) => e.key === " " && onGarageChange(!attached_garage)}
      >
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            attached_garage
              ? "bg-amber-500 border-amber-500"
              : "border-white/20 bg-transparent"
          }`}
        >
          {attached_garage && (
            <svg className="w-3 h-3 text-navy-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-100">Attached Garage</div>
          <div className="text-xs text-slate-400 mt-0.5">
            Including its roof in the solar analysis
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Home details help us accurately model roof area and panel placement.
      </p>
    </div>
  );
}
