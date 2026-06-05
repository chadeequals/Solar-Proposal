"use client";

/**
 * Step 8: Review + Submit
 * Summary card + consent checkboxes + CTA
 */

import type { Intake } from "@/lib/types";

interface Props {
  intake: Partial<Intake>;
  optInEmail: boolean;
  optInSms: boolean;
  onOptInEmailChange: (v: boolean) => void;
  onOptInSmsChange: (v: boolean) => void;
}

const ROOF_LABELS: Record<string, string> = {
  asphalt_shingle: "Asphalt Shingle",
  metal: "Metal",
  tile: "Tile",
  slate: "Slate",
  wood_shake: "Wood Shake",
  flat_membrane: "Flat Membrane",
  dont_know: "Unknown",
};

const TREE_LABELS: Record<string, string> = {
  none: "No shade",
  few: "Some shade",
  heavy: "Heavy shade",
};

export default function Step8Review({
  intake,
  optInEmail,
  optInSms,
  onOptInEmailChange,
  onOptInSmsChange,
}: Props) {
  const systemKw = intake.monthly_bill_usd
    ? Math.max(3, Math.min(20, (intake.monthly_bill_usd / 0.135 / 12) * (1 / 1400) * 12)).toFixed(1)
    : "--";

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="card-navy p-5 space-y-4">
        <h3 className="text-xs font-bold tracking-widest text-amber-500 uppercase">
          Your Solar Proposal Summary
        </h3>

        {/* Address */}
        <div className="flex items-start gap-3">
          <svg className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Property</div>
            <div className="text-sm text-slate-100">{intake.street}</div>
            <div className="text-sm text-slate-300">{intake.city}, {intake.state} {intake.zip}</div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-4 grid grid-cols-2 gap-4">
          {/* Home */}
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Home</div>
            <div className="text-xs text-slate-300 space-y-0.5">
              <div>{intake.stories} {Number(intake.stories) === 1 ? "story" : "stories"}</div>
              {intake.attached_garage && <div>Attached garage</div>}
              <div>{ROOF_LABELS[intake.roof ?? ""] ?? intake.roof}</div>
              <div>{TREE_LABELS[intake.trees ?? ""] ?? intake.trees}</div>
            </div>
          </div>

          {/* Bill */}
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Energy</div>
            <div className="text-xs text-slate-300 space-y-0.5">
              <div className="text-amber-400 font-semibold">${intake.monthly_bill_usd}/mo avg bill</div>
              <div>{intake.utility}</div>
              <div className="text-green-400">Est. {systemKw} kW system</div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Contact</div>
          <div className="text-xs text-slate-300">
            {intake.first} {intake.last} · {intake.email} · {intake.phone}
          </div>
        </div>
      </div>

      {/* Consent checkboxes */}
      <div className="space-y-3">
        <CheckboxRow
          checked={optInEmail}
          onChange={onOptInEmailChange}
          label="Email updates about my proposal and project"
          sublabel="Proposal ready notifications, design updates, permit milestones"
        />
        <CheckboxRow
          checked={optInSms}
          onChange={onOptInSmsChange}
          label="SMS/text message updates (recommended)"
          sublabel="Faster updates, appointment reminders. Msg & data rates may apply."
        />
      </div>

      {/* Legal */}
      <p className="text-[10px] text-slate-600 leading-relaxed">
        By clicking &quot;Generate My Proposal&quot; you authorize Victory Energy to contact you about your solar
        quote at the contact information provided, including via autodialed calls/texts. Consent not
        required to purchase. See our{" "}
        <a href="#" className="text-amber-500/70 hover:text-amber-400 underline">Privacy Policy</a>.
      </p>
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  sublabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel: string;
}) {
  return (
    <div
      className="flex items-start gap-3 cursor-pointer group"
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => e.key === " " && onChange(!checked)}
    >
      <div
        className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all border-2 ${
          checked
            ? "bg-amber-500 border-amber-500"
            : "border-white/20 bg-transparent group-hover:border-amber-500/40"
        }`}
      >
        {checked && (
          <svg className="w-3 h-3 text-navy-900 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div>
        <div className="text-sm text-slate-200">{label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{sublabel}</div>
      </div>
    </div>
  );
}
