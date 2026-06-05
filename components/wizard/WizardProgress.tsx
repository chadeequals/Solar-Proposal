"use client";

/**
 * WizardProgress — progress bar + step indicator for the 8-step wizard
 */

interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = [
  "ADDRESS",
  "OWNERSHIP",
  "HOME DETAILS",
  "SHADE ANALYSIS",
  "ROOF TYPE",
  "UTILITY BILL",
  "CONTACT INFO",
  "REVIEW",
];

export default function WizardProgress({ currentStep, totalSteps }: WizardProgressProps) {
  const pct = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="w-full mb-8">
      {/* Step label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-widest text-amber-500 uppercase">
          {STEP_LABELS[currentStep - 1] ?? `Step ${currentStep}`}
        </span>
        <span className="text-xs text-slate-500 font-mono">
          {currentStep} <span className="text-slate-600">/</span> {totalSteps}
        </span>
      </div>

      {/* Progress track */}
      <div className="progress-bar-track h-1.5 w-full">
        <div
          className="progress-bar-fill h-full"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
        />
      </div>

      {/* Step dots */}
      <div className="flex justify-between mt-2">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          return (
            <div
              key={stepNum}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                isDone
                  ? "bg-amber-500"
                  : isCurrent
                  ? "bg-amber-400 scale-125 shadow-[0_0_6px_rgba(245,158,11,0.8)]"
                  : "bg-white/10"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
