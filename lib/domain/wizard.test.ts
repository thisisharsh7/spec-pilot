import { describe, expect, it } from "vitest";

import { buildRecommendation } from "@/lib/engine/recommend";
import { OPENAI_FIXTURE_MODELS } from "@/lib/data/fixtures/openai";
import { taskSpecSchema } from "@/lib/domain/spec";
import {
  WIZARD_STEPS,
  currentStep,
  firstInvalidStep,
  initialWizardState,
  isLastStep,
  stepForField,
  validateStep,
  wizardReducer,
  type WizardAction,
  type WizardState,
} from "@/lib/domain/wizard";

function run(state: WizardState, actions: WizardAction[]): WizardState {
  return actions.reduce(wizardReducer, state);
}

describe("wizard navigation", () => {
  it("starts on the first step with nothing touched", () => {
    const state = initialWizardState();
    expect(currentStep(state)).toBe("task");
    expect(state.touched).toEqual([]);
  });

  it("refuses to advance past an invalid step and reveals the errors", () => {
    const state = wizardReducer(initialWizardState(), { type: "next" });
    expect(currentStep(state)).toBe("task");
    expect(state.touched).toContain("task");
  });

  it("advances once the step is valid", () => {
    const state = run(initialWizardState(), [
      {
        type: "patch",
        patch: {
          goal: "Extract invoice fields from scanned PDFs.",
          exampleInput: "A scanned invoice.",
          expectedOutput: "Strict JSON.",
        },
      },
      { type: "next" },
    ]);
    expect(currentStep(state)).toBe("input");
  });

  it("goes back without validating", () => {
    let state = run(initialWizardState(), [
      { type: "goto", step: "workload" },
      { type: "back" },
    ]);
    expect(currentStep(state)).toBe("output");

    state = wizardReducer(initialWizardState(), { type: "back" });
    expect(currentStep(state)).toBe("task");
  });

  it("clamps at the last step", () => {
    const state = run(initialWizardState(), [
      { type: "goto", step: "review" },
      { type: "next" },
    ]);
    expect(isLastStep(state)).toBe(true);
  });
});

describe("step validation", () => {
  it("scopes errors to the fields the step owns", () => {
    const state = initialWizardState();
    expect(Object.keys(validateStep("task", state.spec))).toEqual(
      expect.arrayContaining(["goal", "exampleInput", "expectedOutput"]),
    );
    // The workload step's defaults are valid even though the task step is not.
    expect(validateStep("workload", state.spec)).toEqual({});
  });

  it("surfaces every outstanding error on the review step", () => {
    const errors = validateStep("review", initialWizardState().spec);
    expect(Object.keys(errors).length).toBeGreaterThan(0);
  });

  it("rejects a zero request volume on the workload step", () => {
    const spec = { ...initialWizardState().spec, requestsPerDay: 0 };
    expect(validateStep("workload", spec).requestsPerDay).toBeDefined();
  });

  it("maps a field back to the step that owns it", () => {
    expect(stepForField("goal")).toBe("task");
    expect(stepForField("inputTypes")).toBe("input");
    expect(stepForField("maxMonthlyBudgetUsd")).toBe("requirements");
    expect(stepForField("priority")).toBe("priority");
  });

  it("reports the first step still blocking submission", () => {
    expect(firstInvalidStep(initialWizardState().spec)).toBe("task");
  });
});

describe("completing the whole flow", () => {
  const answers: WizardAction[] = [
    {
      type: "patch",
      patch: {
        goal: "Extract vendor name, invoice total and due date from scanned invoices.",
        exampleInput: "A scanned PDF invoice from a supplier.",
        expectedOutput: "Strict JSON with vendor, total and dueDate.",
      },
    },
    { type: "next" },
    { type: "patch", patch: { inputTypes: ["text", "images"] } },
    { type: "next" },
    { type: "patch", patch: { outputTypes: ["json"] } },
    { type: "next" },
    {
      type: "patch",
      patch: {
        requestsPerDay: 1_000,
        averageInputTokens: 1_200,
        averageOutputTokens: 300,
        maximumContextRequired: 8_000,
      },
    },
    { type: "next" },
    { type: "patch", patch: { requireImageInput: true, maxMonthlyBudgetUsd: 100 } },
    { type: "next" },
    { type: "patch", patch: { priority: "lowest_cost" } },
    { type: "next" },
  ];

  it("walks all six steps and lands on the review", () => {
    const state = run(initialWizardState(), answers);
    expect(currentStep(state)).toBe("review");
    expect(firstInvalidStep(state.spec)).toBeNull();
  });

  it("produces a specification that passes full validation", () => {
    const state = run(initialWizardState(), answers);
    expect(taskSpecSchema.safeParse(state.spec).success).toBe(true);
  });

  it("feeds straight into a recommendation with reasons for every exclusion", () => {
    const state = run(initialWizardState(), answers);
    const result = buildRecommendation(state.spec, OPENAI_FIXTURE_MODELS);

    expect(result.primary?.model.modelIdentifier).toBe("gpt-4.1-nano");
    expect(result.rejected.length).toBeGreaterThan(0);
    for (const rejection of result.rejected) {
      expect(rejection.failureReasons.length).toBeGreaterThan(0);
    }
  });

  it("covers every declared step exactly once", () => {
    expect(new Set(WIZARD_STEPS).size).toBe(WIZARD_STEPS.length);
  });
});
