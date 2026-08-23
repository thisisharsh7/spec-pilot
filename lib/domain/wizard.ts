import {
  defaultTaskSpec,
  taskSpecSchema,
  type TaskSpec,
} from "@/lib/domain/spec";

/*
  Wizard state as a reducer so the whole flow can be driven and asserted without
  a DOM. The UI is a thin rendering of this state.
*/

export const WIZARD_STEPS = [
  "task",
  "input",
  "output",
  "workload",
  "requirements",
  "priority",
  "review",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_TITLES: Record<WizardStep, string> = {
  task: "Describe the task",
  input: "What goes in",
  output: "What comes out",
  workload: "Expected volume",
  requirements: "Hard requirements",
  priority: "What matters most",
  review: "Review your specification",
};

/** Which specification fields each step owns, for scoped validation. */
const STEP_FIELDS: Record<WizardStep, (keyof TaskSpec)[]> = {
  task: ["goal", "exampleInput", "expectedOutput"],
  input: ["inputTypes"],
  output: ["outputTypes"],
  workload: [
    "requestsPerDay",
    "averageInputTokens",
    "averageOutputTokens",
    "maximumContextRequired",
  ],
  requirements: [
    "requireImageInput",
    "requireToolUse",
    "requireStructuredOutput",
    "minimumContextWindow",
    "maxMonthlyBudgetUsd",
    "excludedProviders",
  ],
  priority: ["priority"],
  review: [],
};

export type StepErrors = Partial<Record<keyof TaskSpec, string>>;

export interface WizardState {
  stepIndex: number;
  spec: TaskSpec;
  /** A step only shows errors once the user has tried to leave it. */
  touched: WizardStep[];
}

export type WizardAction =
  | { type: "patch"; patch: Partial<TaskSpec> }
  | { type: "next" }
  | { type: "back" }
  | { type: "goto"; step: WizardStep }
  | { type: "hydrate"; spec: TaskSpec }
  | { type: "reset" };

export function initialWizardState(spec: TaskSpec = defaultTaskSpec()): WizardState {
  return { stepIndex: 0, spec, touched: [] };
}

export function currentStep(state: WizardState): WizardStep {
  return WIZARD_STEPS[state.stepIndex];
}

export function isLastStep(state: WizardState): boolean {
  return state.stepIndex === WIZARD_STEPS.length - 1;
}

/**
 * Validate one step against the single source of truth (`taskSpecSchema`),
 * keeping only the issues that belong to that step's own fields. The review step
 * surfaces everything, so nothing can slip through by skipping ahead.
 */
export function validateStep(step: WizardStep, spec: TaskSpec): StepErrors {
  const result = taskSpecSchema.safeParse(spec);
  if (result.success) return {};

  const scoped = step === "review" ? null : new Set(STEP_FIELDS[step]);
  const errors: StepErrors = {};

  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof TaskSpec | undefined;
    if (!key) continue;
    if (scoped && !scoped.has(key)) continue;
    if (!errors[key]) errors[key] = issue.message;
  }

  return errors;
}

export function stepHasErrors(step: WizardStep, spec: TaskSpec): boolean {
  return Object.keys(validateStep(step, spec)).length > 0;
}

/** The step that owns a given field, so "Edit" on the review can jump to it. */
export function stepForField(field: keyof TaskSpec): WizardStep {
  for (const step of WIZARD_STEPS) {
    if (STEP_FIELDS[step].includes(field)) return step;
  }
  return "review";
}

/** The first step still holding a validation error, or null when all are clean. */
export function firstInvalidStep(spec: TaskSpec): WizardStep | null {
  for (const step of WIZARD_STEPS) {
    if (step === "review") continue;
    if (stepHasErrors(step, spec)) return step;
  }
  return null;
}

function touch(touched: WizardStep[], step: WizardStep): WizardStep[] {
  return touched.includes(step) ? touched : [...touched, step];
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "patch":
      return { ...state, spec: { ...state.spec, ...action.patch } };

    case "next": {
      const step = currentStep(state);
      const touched = touch(state.touched, step);
      if (stepHasErrors(step, state.spec)) {
        // Stay put and reveal the errors rather than advancing silently.
        return { ...state, touched };
      }
      return {
        ...state,
        touched,
        stepIndex: Math.min(state.stepIndex + 1, WIZARD_STEPS.length - 1),
      };
    }

    case "back":
      return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };

    case "goto":
      return { ...state, stepIndex: WIZARD_STEPS.indexOf(action.step) };

    case "hydrate":
      return { ...state, spec: action.spec };

    case "reset":
      return initialWizardState();

    default:
      return state;
  }
}
