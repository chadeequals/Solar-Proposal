"use client";

/**
 * Sundial v2 — Solar Quote Wizard
 *
 * Main entry point: 8-step intake wizard that collects homeowner data
 * and submits to the intake API, which evaluates the Aurora gate and
 * initiates the design pipeline if the lead qualifies.
 *
 * Flow:
 *  Steps 1-8 → POST /api/intake → poll /api/intake/[sessionId]/status
 *  → redirect to /proposal/[designId] OR show fallback message
 */

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import type { Intake, Ownership, Stories, TreeShade, RoofMaterial, SessionStatus } from "@/lib/types";

import WizardLayout from "@/components/wizard/WizardLayout";
import Step1Address from "@/components/wizard/steps/Step1Address";
import Step2Ownership from "@/components/wizard/steps/Step2Ownership";
import Step3Stories from "@/components/wizard/steps/Step3Stories";
import Step4Trees from "@/components/wizard/steps/Step4Trees";
import Step5Roof from "@/components/wizard/steps/Step5Roof";
import Step6Bill from "@/components/wizard/steps/Step6Bill";
import Step7Contact from "@/components/wizard/steps/Step7Contact";
import Step8Review from "@/components/wizard/steps/Step8Review";

const TOTAL_STEPS = 8;

const STEP_CONFIG = [
  { tag: "YOUR ADDRESS", heading: "Where's your home?", headingItalic: undefined, description: "We'll analyze your roof's solar potential using satellite imagery." },
  { tag: "OWNERSHIP", heading: "Do you own this property?", headingItalic: undefined, description: "Only homeowners qualify for solar installation financing." },
  { tag: "HOME DETAILS", heading: "Tell us about your home", headingItalic: undefined, description: "We use this to calculate total usable roof area." },
  { tag: "SHADE ANALYSIS", heading: "How much shade does your roof get?", headingItalic: "honestly", description: "Shade affects your system's output — we'll model it accurately." },
  { tag: "ROOF TYPE", heading: "What's your roof made of?", headingItalic: undefined, description: "Different materials require different mounting systems and affect pricing." },
  { tag: "UTILITY BILL", heading: "What's your monthly electric bill?", headingItalic: undefined, description: "Your bill determines the optimal system size for maximum savings." },
  { tag: "CONTACT INFO", heading: "Who should we send the proposal to?", headingItalic: undefined, description: "Your proposal will be ready in about 60 seconds." },
  { tag: "REVIEW", heading: "Ready to see your proposal?", headingItalic: "instantly", description: "Review your info below and we'll generate your custom solar design." },
];

type PollingStatus = "idle" | "submitting" | "polling" | "done" | "failed" | "gate_failed";

export default function WizardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionId] = useState(() => uuidv4());

  // Controlled state for non-RHF fields (card selections, sliders)
  const [ownership, setOwnership] = useState<Ownership | "">("");
  const [stories, setStories] = useState<Stories | "">("");
  const [attachedGarage, setAttachedGarage] = useState(false);
  const [trees, setTrees] = useState<TreeShade | "">("");
  const [roof, setRoof] = useState<RoofMaterial | "">("");
  const [bill, setBill] = useState(150);
  const [utility, setUtility] = useState("");
  const [optInEmail, setOptInEmail] = useState(true);
  const [optInSms, setOptInSms] = useState(false);

  // Submit/polling state
  const [pollingStatus, setPollingStatus] = useState<PollingStatus>("idle");
  const [pollingMessage, setPollingMessage] = useState("");
  const [gateReason, setGateReason] = useState("");
  const [submitError, setSubmitError] = useState("");

  const {
    register,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<Intake>({
    defaultValues: {
      session_id: sessionId,
      step_completed: 1,
      attached_garage: false,
      opt_in_email: true,
      opt_in_sms: false,
    },
  });

  // ── Step validation ────────────────────────────────────────────────

  const validateStep = useCallback(async (step: number): Promise<boolean> => {
    switch (step) {
      case 1:
        return trigger(["street", "city", "state", "zip"]);
      case 2:
        return ownership !== "";
      case 3:
        return stories !== "";
      case 4:
        return trees !== "";
      case 5:
        return roof !== "";
      case 6:
        return bill > 0 && utility !== "";
      case 7:
        return trigger(["first", "last", "email", "phone"]);
      case 8:
        return true; // Review step has no required fields beyond previous
      default:
        return true;
    }
  }, [trigger, ownership, stories, trees, roof, bill, utility]);

  // ── Navigation ─────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleNext = useCallback(async () => {
    const valid = await validateStep(currentStep);
    if (!valid) return;

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
    } else {
      handleSubmit();
    }
  // handleSubmit is defined below and stable across renders
  }, [currentStep, validateStep]); // eslint-disable-line

  const handleBack = useCallback(() => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  // ── Submit + Polling ───────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setPollingStatus("submitting");
    setSubmitError("");

    const formValues = getValues();

    const intake: Intake = {
      ...formValues,
      ownership: ownership as Ownership,
      stories: stories as Stories,
      attached_garage: attachedGarage,
      trees: trees as TreeShade,
      roof: roof as RoofMaterial,
      monthly_bill_usd: bill,
      utility,
      opt_in_email: optInEmail,
      opt_in_sms: optInSms,
      session_id: sessionId,
      step_completed: TOTAL_STEPS,
      submitted_at: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intake),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Submission failed");
      }

      const data = await res.json();

      if (!data.passed_gate) {
        setPollingStatus("gate_failed");
        setGateReason(data.gate_evaluation?.reason ?? "Your home didn't meet our current qualification criteria.");
        return;
      }

      // Gate passed — start polling
      setPollingStatus("polling");
      setPollingMessage("Starting solar analysis…");
      pollStatus(sessionId);
    } catch (err) {
      setPollingStatus("failed");
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getValues, ownership, stories, attachedGarage, trees, roof, bill, utility, optInEmail, optInSms, sessionId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pollStatus = useCallback(async (sid: string) => {
    const MAX_POLLS = 30;
    let polls = 0;

    const doPoll = async () => {
      polls++;
      try {
        const res = await fetch(`/api/intake/${sid}/status`);
        if (!res.ok) throw new Error("Status check failed");

        const data = await res.json();
        setPollingMessage(data.progress_message ?? "Processing…");

        if (data.status === "complete" && data.proposal_url) {
          setPollingStatus("done");
          router.push(data.proposal_url);
          return;
        }

        if (data.status === "error") {
          setPollingStatus("failed");
          setSubmitError(data.error_message ?? "An error occurred during design generation.");
          return;
        }

        if (data.status === "gate_failed") {
          setPollingStatus("gate_failed");
          setGateReason(data.error_message ?? "Your home didn't qualify for instant proposals.");
          return;
        }

        if (polls < MAX_POLLS) {
          setTimeout(doPoll, 1500);
        } else {
          setPollingStatus("failed");
          setSubmitError("Design generation timed out. Our team will follow up with you.");
        }
      } catch {
        if (polls < MAX_POLLS) {
          setTimeout(doPoll, 2000);
        } else {
          setPollingStatus("failed");
          setSubmitError("Unable to check design status. Please try again.");
        }
      }
    };

    setTimeout(doPoll, 1000);
  }, [router]);

  // ── Rendering ──────────────────────────────────────────────────────

  const stepConfig = STEP_CONFIG[currentStep - 1];
  const isSubmitting = pollingStatus === "submitting" || pollingStatus === "polling";

  // Loading/polling overlay
  if (pollingStatus === "polling" || pollingStatus === "submitting" || pollingStatus === "done") {
    return <DesigningOverlay message={pollingMessage || "Initializing…"} />;
  }

  // Gate failed
  if (pollingStatus === "gate_failed") {
    return <GateFailedScreen reason={gateReason} />;
  }

  // Error state
  if (pollingStatus === "failed") {
    return (
      <ErrorScreen
        message={submitError}
        onRetry={() => {
          setPollingStatus("idle");
          setCurrentStep(TOTAL_STEPS);
        }}
      />
    );
  }

  const formValues = getValues();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Logo */}
      <div className="mb-8 text-center">
        <SundialLogo />
        <p className="text-xs text-slate-500 mt-1">by Victory Energy</p>
      </div>

      {/* Wizard card */}
      <div
        className="w-full max-w-lg card-navy p-6 sm:p-8"
        style={{ boxShadow: "0 8px 48px rgba(5,7,26,0.7), 0 0 0 1px rgba(245,158,11,0.06)" }}
      >
        <WizardLayout
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          stepTag={stepConfig.tag}
          heading={stepConfig.heading}
          headingItalic={stepConfig.headingItalic}
          description={stepConfig.description}
          onBack={currentStep > 1 ? handleBack : undefined}
          onNext={handleNext}
          nextLabel={currentStep === TOTAL_STEPS ? "Generate My Proposal ⚡" : "Continue →"}
          isLoading={isSubmitting}
        >
          {/* Step content */}
          {currentStep === 1 && (
            <Step1Address register={register} errors={errors} />
          )}
          {currentStep === 2 && (
            <Step2Ownership
              value={ownership}
              onChange={setOwnership}
            />
          )}
          {currentStep === 3 && (
            <Step3Stories
              stories={stories}
              attached_garage={attachedGarage}
              onStoriesChange={setStories}
              onGarageChange={setAttachedGarage}
            />
          )}
          {currentStep === 4 && (
            <Step4Trees value={trees} onChange={setTrees} />
          )}
          {currentStep === 5 && (
            <Step5Roof value={roof} onChange={setRoof} />
          )}
          {currentStep === 6 && (
            <Step6Bill
              bill={bill}
              utility={utility}
              onBillChange={setBill}
              onUtilityChange={setUtility}
            />
          )}
          {currentStep === 7 && (
            <Step7Contact register={register} errors={errors} />
          )}
          {currentStep === 8 && (
            <Step8Review
              intake={{
                ...formValues,
                ownership: ownership as Ownership,
                stories: stories as Stories,
                attached_garage: attachedGarage,
                trees: trees as TreeShade,
                roof: roof as RoofMaterial,
                monthly_bill_usd: bill,
                utility,
              }}
              optInEmail={optInEmail}
              optInSms={optInSms}
              onOptInEmailChange={setOptInEmail}
              onOptInSmsChange={setOptInSms}
            />
          )}
        </WizardLayout>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-slate-600 text-center">
        Victory Energy · Solar Proposals v2 ·{" "}
        <a href="/admin" className="text-amber-500/40 hover:text-amber-500/70 transition-colors">
          Admin
        </a>
      </p>
    </main>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function SundialLogo() {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Sundial logo"
      >
        {/* Sun rays */}
        <line x1="16" y1="2" x2="16" y2="7" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="25" x2="16" y2="30" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="2" y1="16" x2="7" y2="16" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="25" y1="16" x2="30" y2="16" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="5.5" y1="5.5" x2="9.2" y2="9.2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="22.8" y1="22.8" x2="26.5" y2="26.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="26.5" y1="5.5" x2="22.8" y2="9.2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="9.2" y1="22.8" x2="5.5" y2="26.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        {/* Sun core */}
        <circle cx="16" cy="16" r="6" fill="#f59e0b" />
        <circle cx="16" cy="16" r="4" fill="#fcd34d" />
      </svg>
      <span className="text-xl font-bold tracking-tight">
        <span className="text-slate-100">Sun</span>
        <span className="font-serif italic text-amber-400">dial</span>
      </span>
    </div>
  );
}

function DesigningOverlay({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-sm">
        {/* Animated sun */}
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
          <div className="absolute inset-2 rounded-full bg-amber-500/30 animate-pulse" />
          <div className="relative w-full h-full rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-gold">
            <svg className="w-10 h-10 text-navy-900" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-100 mb-2">
          Designing Your System
        </h2>
        <p className="text-sm text-slate-400 mb-6">{message}</p>

        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-amber-500"
              style={{
                animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Steps being run */}
        <div className="mt-8 space-y-2 text-left">
          {[
            "Creating Aurora Solar project",
            "Analyzing roof via satellite AI",
            "Generating optimal panel layout",
            "Calculating pricing & financing",
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
              <div className="w-3 h-3 rounded-full border border-amber-500/30 shimmer flex-shrink-0" />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function GateFailedScreen({ reason }: { reason: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-100 mb-3">
          We&apos;ll Be in Touch
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Your quote request was saved. One of our solar specialists will review your
          project and reach out within 1 business day.
        </p>
        <p className="text-xs text-slate-600 mb-6 italic">{reason}</p>
        <a
          href="/"
          className="inline-block btn-gold px-6 py-3 text-sm font-semibold rounded-lg"
        >
          Start Over
        </a>
      </div>
    </main>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-100 mb-3">Something Went Wrong</h2>
        <p className="text-sm text-slate-400 mb-6">{message}</p>
        <button onClick={onRetry} className="btn-gold px-6 py-3 text-sm font-semibold rounded-lg">
          Try Again
        </button>
      </div>
    </main>
  );
}
