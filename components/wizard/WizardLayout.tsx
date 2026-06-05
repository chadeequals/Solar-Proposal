"use client";

/**
 * WizardLayout — shell wrapper for each wizard step.
 * Contains the step tag, heading, description, content slot,
 * and the Back/Continue navigation buttons.
 */

import WizardProgress from "./WizardProgress";

interface WizardLayoutProps {
  currentStep: number;
  totalSteps: number;
  stepTag: string;         // e.g. "SHADE ANALYSIS"
  heading: string;         // e.g. "How much shade does your roof get?"
  headingItalic?: string;  // Optional italic serif accent on heading
  description?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
}

export default function WizardLayout({
  currentStep,
  totalSteps,
  stepTag,
  heading,
  headingItalic,
  description,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  isLoading = false,
}: WizardLayoutProps) {
  return (
    <div className="animate-fade-in w-full">
      <WizardProgress currentStep={currentStep} totalSteps={totalSteps} />

      {/* Step heading */}
      <div className="mb-8">
        <span className="inline-block text-[10px] font-bold tracking-[0.2em] text-amber-500/70 uppercase mb-2">
          {stepTag}
        </span>
        <h2 className="text-2xl sm:text-3xl font-semibold text-slate-100 leading-tight">
          {heading}
          {headingItalic && (
            <span className="font-serif italic text-amber-400 ml-2">
              {headingItalic}
            </span>
          )}
        </h2>
        {description && (
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">{description}</p>
        )}
      </div>

      {/* Step content */}
      <div className="mb-10">{children}</div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="btn-ghost px-6 py-3 text-sm font-medium flex-shrink-0"
          >
            ← Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || isLoading}
          className={`btn-gold px-8 py-3.5 text-sm font-bold flex-1 sm:flex-initial transition-all ${
            nextDisabled || isLoading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing…
            </span>
          ) : (
            nextLabel
          )}
        </button>
      </div>
    </div>
  );
}
