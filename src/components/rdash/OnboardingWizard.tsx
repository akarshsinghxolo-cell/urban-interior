"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import {
  X, ArrowRight, ArrowLeft, Check, Sparkles,
  Users, FileText, Wrench, MapPin, Wallet, ShieldCheck,
} from "lucide-react";

/**
 * OnboardingWizard — a 4-step guided tour for first-time users.
 * Shows on first login (detected via localStorage flag).
 *
 * Features:
 * - 4 steps: Welcome → Customers → Sales Pipeline → Finance → Get Started
 * - Animated entrance (fade + scale)
 * - Progress dots + step counter
 * - Skip button (remembers dismissal)
 * - "Don't show again" on final step
 * - Color-coded step icons
 * - Backdrop blur overlay
 */

const STORAGE_KEY = "uc_onboarding_completed";

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  tips: string[];
}

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to Urban Castle",
    description: "Your all-in-one construction & contracting workspace. Let's take a quick tour.",
    icon: Sparkles,
    color: "text-primary bg-primary/10",
    tips: [
      "Manage CRM, sales, execution, procurement, and finance in one place",
      "Use keyboard shortcuts (press ? anytime) to navigate faster",
      "Pin favorite records with the star button for quick access",
    ],
  },
  {
    id: "customers",
    title: "Customer Desk",
    description: "Your customer portfolio — sites, commercial context, and history at a glance.",
    icon: Users,
    color: "text-success bg-success/10",
    tips: [
      "Create customers from the Quick Actions toolbar (Alt+1)",
      "View each customer's sites, quotations, and payment history",
      "Track customer satisfaction and engagement",
    ],
  },
  {
    id: "pipeline",
    title: "Sales Pipeline",
    description: "Drag-and-drop kanban to track leads from enquiry to acceptance.",
    icon: FileText,
    color: "text-warning bg-warning/10",
    tips: [
      "Drag leads between stages to update their status",
      "Each column shows the total pipeline value",
      "Click a card to open the customer detail panel",
    ],
  },
  {
    id: "finance",
    title: "Finance & Health",
    description: "Monitor cash flow, profitability, and workspace integrity in real-time.",
    icon: Wallet,
    color: "text-primary bg-primary/10",
    tips: [
      "The Health Dashboard shows your workspace integrity score",
      "Cash Flow Chart visualizes 7-day inflows vs outflows",
      "Profitability Snapshot tracks margins per work order",
    ],
  },
];

export function OnboardingWizard() {
  const [show, setShow] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  // Check localStorage on mount — show if not completed
  React.useEffect(() => {
    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) setShow(true);
    } catch { /* non-fatal */ }
  }, []);

  const dismiss = React.useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* non-fatal */ }
    setShow(false);
  }, []);

  // Escape dismisses (the backdrop div never receives keyboard focus, so the
  // handler must live on the document while the wizard is open).
  React.useEffect(() => {
    if (!show) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [show, dismiss]);

  if (!show) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in" onClick={dismiss}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in rd-scroll"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Skip onboarding"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step icon */}
        <div className="mb-4 flex justify-center">
          <div className={cn("flex h-16 w-16 items-center justify-center rounded-2xl", current.color)}>
            <Icon className="h-8 w-8" />
          </div>
        </div>

        {/* Step counter */}
        <div className="mb-2 flex items-center justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-muted"
              )}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Title + description */}
        <h2 id="onboarding-title" className="text-center text-lg font-bold tracking-tight">{current.title}</h2>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{current.description}</p>

        {/* Tips */}
        <div className="mt-4 space-y-2">
          {current.tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              <span className="text-muted-foreground">{tip}</span>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={dismiss}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:shadow-md active:scale-95"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Get started
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:shadow-md active:scale-95"
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
