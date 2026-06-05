"use client";

/**
 * Step 5: Roof Material
 * 6 options + "don't know" — card selection
 */

import type { RoofMaterial } from "@/lib/types";

const OPTIONS: {
  value: RoofMaterial;
  label: string;
  note?: string;
  warn?: boolean;
}[] = [
  { value: "asphalt_shingle", label: "Asphalt Shingle", note: "Most common, ideal for solar" },
  { value: "metal", label: "Metal Roof", note: "Excellent for solar, durable" },
  { value: "tile", label: "Tile (Clay/Concrete)", note: "Good, requires special mounting" },
  { value: "slate", label: "Slate", note: "Fragile — requires specialty installer", warn: true },
  { value: "wood_shake", label: "Wood Shake", note: "Fire risk — permit review needed", warn: true },
  { value: "flat_membrane", label: "Flat / TPO Membrane", note: "Commercial style, ballast mount" },
  { value: "dont_know", label: "I Don't Know", note: "We'll confirm during site visit" },
];

const ROOF_ICONS: Record<RoofMaterial, string> = {
  asphalt_shingle: "▤",
  metal: "▥",
  tile: "◫",
  slate: "◧",
  wood_shake: "▦",
  flat_membrane: "▬",
  dont_know: "?",
};

interface Props {
  value: RoofMaterial | "";
  onChange: (v: RoofMaterial) => void;
}

export default function Step5Roof({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`option-card flex flex-col items-start p-4 text-left relative ${
            value === opt.value ? "selected" : ""
          }`}
        >
          {/* Warn badge */}
          {opt.warn && (
            <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/20">
              REVIEW
            </span>
          )}

          <span className="text-xl mb-2 text-amber-500/60">{ROOF_ICONS[opt.value]}</span>
          <span className="text-sm font-semibold text-slate-100">{opt.label}</span>
          <span className="text-[11px] text-slate-400 mt-1 leading-relaxed">{opt.note}</span>

          {value === opt.value && (
            <div className="absolute bottom-2 right-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
