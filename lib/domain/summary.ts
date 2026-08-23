import {
  deriveMandatoryRequirements,
  derivePreferredRequirements,
  requiredContextTokens,
  type MandatoryRequirement,
  type PreferredRequirement,
} from "@/lib/domain/requirements";
import {
  DAYS_PER_MONTH,
  INPUT_TYPE_LABELS,
  OUTPUT_TYPE_LABELS,
  PRIORITY_LABELS,
  type TaskSpec,
} from "@/lib/domain/spec";

/*
  The structured specification — a reviewable, exportable artefact.

  `expectedFailureCases` and `acceptanceTests` are produced by fixed rules over
  the user's answers. They are starting points a human should edit, not model
  output and not predictions about any particular model's behaviour.
*/

export const GENERATED_NOTE =
  "Failure cases and acceptance tests are generated from your answers by fixed rules. Treat them as a starting checklist to edit, not as findings about any specific model.";

export interface SpecSummary {
  goal: string;
  exampleInput: string;
  expectedOutput: string;
  inputTypes: { value: string; label: string }[];
  outputTypes: { value: string; label: string }[];
  mandatory: MandatoryRequirement[];
  preferred: PreferredRequirement[];
  workload: {
    requestsPerDay: number;
    monthlyRequests: number;
    averageInputTokens: number;
    averageOutputTokens: number;
    maximumContextRequired: number;
    effectiveContextRequired: number;
  };
  budgetUsd: number | null;
  excludedProviders: string[];
  priority: { value: string; label: string };
  expectedFailureCases: string[];
  acceptanceTests: string[];
  generatedNote: string;
}

function failureCasesFor(spec: TaskSpec): string[] {
  const cases: string[] = [];

  if (spec.inputTypes.includes("images")) {
    cases.push("Low-resolution, rotated or skewed images reduce extraction quality.");
  }
  if (spec.inputTypes.includes("files")) {
    cases.push("Long or scanned multi-page documents exceed the assumed input length.");
  }
  if (spec.inputTypes.includes("audio")) {
    cases.push("Background noise, overlapping speakers or strong accents degrade accuracy.");
  }
  if (spec.outputTypes.includes("json")) {
    cases.push("The model returns prose or malformed JSON instead of the declared schema.");
  }
  if (spec.outputTypes.includes("extraction")) {
    cases.push("Fields absent from the source are invented instead of returned as null.");
  }
  if (spec.outputTypes.includes("classification")) {
    cases.push("Inputs matching no category are forced into the nearest available label.");
  }
  if (spec.outputTypes.includes("tool_calls")) {
    cases.push("A tool is called with missing or malformed arguments.");
  }
  if (spec.outputTypes.includes("code")) {
    cases.push("Generated code references APIs or parameters that do not exist.");
  }
  if (spec.outputTypes.includes("long_form")) {
    cases.push("Output is truncated at the model's maximum output length.");
  }

  cases.push(
    `Real inputs run longer than the assumed ${spec.averageInputTokens.toLocaleString("en-US")} tokens, pushing cost above the estimate.`,
  );

  if (spec.maxMonthlyBudgetUsd !== null) {
    cases.push(
      `Sustained traffic above ${spec.requestsPerDay.toLocaleString("en-US")} requests per day pushes monthly cost past the $${spec.maxMonthlyBudgetUsd.toLocaleString("en-US")} ceiling.`,
    );
  }

  return cases;
}

function acceptanceTestsFor(spec: TaskSpec): string[] {
  const tests: string[] = [];

  if (spec.outputTypes.includes("json")) {
    tests.push("Confirm 20 sampled responses parse as JSON and validate against the declared schema.");
  }
  if (spec.outputTypes.includes("extraction")) {
    tests.push("On 20 labelled samples, measure field-level exact match and require agreement on every mandatory field.");
  }
  if (spec.outputTypes.includes("classification")) {
    tests.push("On a labelled set covering every category, measure per-class accuracy including the none-of-these case.");
  }
  if (spec.outputTypes.includes("tool_calls")) {
    tests.push("Assert the correct tool is selected and its arguments validate against the tool schema for 20 sampled inputs.");
  }
  if (spec.outputTypes.includes("code")) {
    tests.push("Execute generated code against a fixture test suite and require it to compile and pass.");
  }
  if (spec.outputTypes.includes("long_form")) {
    tests.push("Confirm outputs reach the required length without truncating at the maximum output limit.");
  }
  if (spec.inputTypes.includes("images")) {
    tests.push("Include low-resolution and rotated samples in the evaluation set.");
  }
  if (spec.inputTypes.includes("files")) {
    tests.push("Include at least one document longer than the assumed average input length.");
  }
  if (spec.inputTypes.includes("audio")) {
    tests.push("Include noisy and multi-speaker recordings in the evaluation set.");
  }

  tests.push("Measure p95 latency and actual token usage on 50 representative requests before committing.");
  tests.push("Re-run the evaluation set against the pinned model snapshot before each deploy.");

  return tests;
}

export function buildSpecSummary(spec: TaskSpec): SpecSummary {
  return {
    goal: spec.goal,
    exampleInput: spec.exampleInput,
    expectedOutput: spec.expectedOutput,
    inputTypes: spec.inputTypes.map((value) => ({
      value,
      label: INPUT_TYPE_LABELS[value],
    })),
    outputTypes: spec.outputTypes.map((value) => ({
      value,
      label: OUTPUT_TYPE_LABELS[value],
    })),
    mandatory: deriveMandatoryRequirements(spec),
    preferred: derivePreferredRequirements(spec),
    workload: {
      requestsPerDay: spec.requestsPerDay,
      monthlyRequests: spec.requestsPerDay * DAYS_PER_MONTH,
      averageInputTokens: spec.averageInputTokens,
      averageOutputTokens: spec.averageOutputTokens,
      maximumContextRequired: spec.maximumContextRequired,
      effectiveContextRequired: requiredContextTokens(spec),
    },
    budgetUsd: spec.maxMonthlyBudgetUsd,
    excludedProviders: spec.excludedProviders,
    priority: { value: spec.priority, label: PRIORITY_LABELS[spec.priority] },
    expectedFailureCases: failureCasesFor(spec),
    acceptanceTests: acceptanceTestsFor(spec),
    generatedNote: GENERATED_NOTE,
  };
}

function bullets(items: string[]): string {
  return items.length > 0
    ? items.map((item) => `- ${item}`).join("\n")
    : "- (none)";
}

export function summaryToMarkdown(summary: SpecSummary): string {
  const n = (value: number) => value.toLocaleString("en-US");

  return [
    "# Task specification",
    "",
    "## Goal",
    "",
    summary.goal,
    "",
    "## Example input",
    "",
    summary.exampleInput,
    "",
    "## Expected output",
    "",
    summary.expectedOutput,
    "",
    "## Input types",
    "",
    bullets(summary.inputTypes.map((type) => type.label)),
    "",
    "## Output types",
    "",
    bullets(summary.outputTypes.map((type) => type.label)),
    "",
    "## Mandatory requirements",
    "",
    bullets(summary.mandatory.map((req) => `${req.label} — ${req.because}`)),
    "",
    "## Preferred requirements",
    "",
    bullets(summary.preferred.map((req) => req.label)),
    "",
    "## Workload assumptions",
    "",
    `- Requests per day: ${n(summary.workload.requestsPerDay)}`,
    `- Requests per month (30 days): ${n(summary.workload.monthlyRequests)}`,
    `- Average input tokens: ${n(summary.workload.averageInputTokens)}`,
    `- Average output tokens: ${n(summary.workload.averageOutputTokens)}`,
    `- Maximum context required: ${n(summary.workload.maximumContextRequired)}`,
    `- Effective context required: ${n(summary.workload.effectiveContextRequired)}`,
    "",
    "## Budget",
    "",
    summary.budgetUsd === null
      ? "- No hard monthly ceiling set"
      : `- Maximum $${n(summary.budgetUsd)} per month`,
    summary.excludedProviders.length > 0
      ? `- Excluded providers: ${summary.excludedProviders.join(", ")}`
      : "- No providers excluded",
    "",
    "## Selection priority",
    "",
    `- ${summary.priority.label}`,
    "",
    "## Expected failure cases",
    "",
    bullets(summary.expectedFailureCases),
    "",
    "## Recommended acceptance tests",
    "",
    bullets(summary.acceptanceTests),
    "",
    "---",
    "",
    `_${summary.generatedNote}_`,
    "",
  ].join("\n");
}

export function summaryToJson(summary: SpecSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}
