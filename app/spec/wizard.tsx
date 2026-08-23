"use client";

import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";

import {
  InputStep,
  OutputStep,
  PriorityStep,
  RequirementsStep,
  TaskStep,
  WorkloadStep,
  type StepProps,
} from "@/app/spec/steps";
import { SpecSummaryView } from "@/components/spec-summary-view";
import { Button } from "@/components/ui/primitives";
import { defaultTaskSpec, type TaskSpec } from "@/lib/domain/spec";
import {
  clearDraft,
  readDraft,
  saveDraft,
  savePendingSpec,
} from "@/lib/domain/spec-transport";
import {
  STEP_TITLES,
  WIZARD_STEPS,
  currentStep,
  firstInvalidStep,
  initialWizardState,
  validateStep,
  wizardReducer,
  type WizardStep,
} from "@/lib/domain/wizard";
import { cn } from "@/lib/cn";

const STEP_COMPONENTS: Record<
  Exclude<WizardStep, "review">,
  (props: StepProps) => React.ReactElement
> = {
  task: TaskStep,
  input: InputStep,
  output: OutputStep,
  workload: WorkloadStep,
  requirements: RequirementsStep,
  priority: PriorityStep,
};

const STEP_INTROS: Record<WizardStep, string> = {
  task: "Tell us the job in your own words. No model names needed.",
  input: "What the model receives determines which models can even be considered.",
  output: "The output contract decides which capabilities are mandatory.",
  workload: "Volume drives the cost estimate. Rough numbers are fine.",
  requirements: "Hard limits. Anything that fails these is excluded, with the reason shown.",
  priority: "Cost always decides first. This settles ties.",
  review: "Check the compiled specification before we compare it against the catalog.",
};

export function SpecWizard() {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, undefined, () =>
    initialWizardState(),
  );
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasMounted = useRef(false);

  const step = currentStep(state);
  const touched = state.touched.includes(step);
  const errors = touched ? validateStep(step, state.spec) : {};

  // sessionStorage does not exist during SSR, so restoring a draft has to happen
  // after mount — synchronising React with an external store, exactly once.
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      dispatch({ type: "hydrate", spec: { ...defaultTaskSpec(), ...draft } });
    }
  }, []);

  // Persist answers as they change. No React state involved.
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    saveDraft(state.spec);
  }, [state.spec]);

  // Move focus to the new step's heading so keyboard and screen-reader users are
  // not left at the bottom of the page after pressing Continue.
  useEffect(() => {
    headingRef.current?.focus();
  }, [state.stepIndex]);

  function submit() {
    const blocking = firstInvalidStep(state.spec);
    if (blocking) {
      dispatch({ type: "goto", step: blocking });
      return;
    }

    setSubmitting(true);
    savePendingSpec(state.spec as TaskSpec);
    clearDraft();
    router.push("/result");
  }

  const StepBody = step === "review" ? null : STEP_COMPONENTS[step];
  const stepNumber = state.stepIndex + 1;

  return (
    <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
      <Progress stepIndex={state.stepIndex} spec={state.spec} dispatch={dispatch} />

      <div>
        <p className="font-mono text-caption text-mute">
          STEP {stepNumber} OF {WIZARD_STEPS.length}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 text-display-md text-ink outline-none"
        >
          {STEP_TITLES[step]}
        </h2>
        <p className="mt-2 max-w-2xl text-body-md text-body">{STEP_INTROS[step]}</p>

        <div className="mt-8">
          {StepBody ? (
            <StepBody
              spec={state.spec}
              errors={errors}
              patch={(patch) => dispatch({ type: "patch", patch })}
            />
          ) : (
            <SpecSummaryView
              spec={state.spec}
              onEdit={(target) => dispatch({ type: "goto", step: target })}
            />
          )}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
          <Button
            scale="app"
            tone="secondary"
            onClick={() => dispatch({ type: "back" })}
            disabled={state.stepIndex === 0}
          >
            Previous
          </Button>

          {step === "review" ? (
            <Button scale="app" tone="primary" onClick={submit} disabled={submitting}>
              {submitting ? "Comparing models…" : "Find my model"}
            </Button>
          ) : (
            <Button
              scale="app"
              tone="primary"
              onClick={() => dispatch({ type: "next" })}
            >
              Continue
            </Button>
          )}

          {touched && Object.keys(errors).length > 0 ? (
            <p role="alert" className="text-caption text-error-deep">
              Fix the highlighted {Object.keys(errors).length === 1 ? "field" : "fields"} to continue.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Progress({
  stepIndex,
  spec,
  dispatch,
}: {
  stepIndex: number;
  spec: TaskSpec;
  dispatch: React.Dispatch<{ type: "goto"; step: WizardStep }>;
}) {
  return (
    <nav aria-label="Specification progress">
      {/* Compact bar on small screens, full list from lg up. */}
      <div className="lg:hidden">
        <div className="h-1 w-full overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full bg-ink transition-[width]"
            style={{ width: `${((stepIndex + 1) / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="hidden flex-col gap-1 lg:flex">
        {WIZARD_STEPS.map((step, index) => {
          const isCurrent = index === stepIndex;
          const isVisited = index < stepIndex;
          const invalid = isVisited && step !== "review" && Object.keys(validateStep(step, spec)).length > 0;

          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => dispatch({ type: "goto", step })}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-body-sm transition-colors",
                  isCurrent
                    ? "bg-canvas-soft-2 font-medium text-ink"
                    : "text-body hover:bg-canvas-soft",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]",
                    isCurrent
                      ? "bg-ink text-on-primary"
                      : isVisited
                        ? "bg-hairline text-body"
                        : "border border-hairline text-mute",
                  )}
                >
                  {index + 1}
                </span>
                <span className="flex-1">{STEP_TITLES[step]}</span>
                {invalid ? (
                  <span className="text-caption text-error-deep" aria-label="incomplete">
                    !
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
