import { z } from "zod";

/*
  The task specification — the six wizard steps, in order.

  Step 2 offers "mixed" input by selecting more than one type rather than by a
  separate `mixed` value, so the set stays orthogonal.
*/

export const INPUT_TYPES = ["text", "images", "audio", "files"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

export const OUTPUT_TYPES = [
  "free_text",
  "json",
  "classification",
  "extraction",
  "code",
  "tool_calls",
  "long_form",
] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

export const PRIORITIES = [
  "lowest_cost",
  "largest_context",
  "most_capabilities",
  "freshest_evidence",
] as const;
export type Priority = (typeof PRIORITIES)[number];

export const INPUT_TYPE_LABELS: Record<InputType, string> = {
  text: "Text",
  images: "Images",
  audio: "Audio",
  files: "Documents / files",
};

export const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  free_text: "Free-form text",
  json: "Structured JSON",
  classification: "Classification",
  extraction: "Data extraction",
  code: "Code",
  tool_calls: "Tool calls",
  long_form: "Long-form content",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  lowest_cost: "Lowest cost",
  largest_context: "Largest verified context window",
  most_capabilities: "Most verified preferred capabilities",
  freshest_evidence: "Freshest evidence",
};

/**
 * Priority only ever breaks ties between models that cost the same. The primary
 * recommendation is always the cheapest compatible model — see `lib/engine/rank.ts`.
 */
export const PRIORITY_NOTE =
  "Priority breaks ties between models of equal cost. The primary recommendation is always the cheapest model that satisfies every mandatory requirement.";

/** Billing month used for every workload projection. */
export const DAYS_PER_MONTH = 30;

const MAX_TOKENS = 100_000_000;

export const taskSpecSchema = z.object({
  // Step 1 — task
  goal: z.string().trim().min(10, "Describe the task in at least 10 characters."),
  exampleInput: z.string().trim().min(1, "Provide an example input."),
  expectedOutput: z.string().trim().min(1, "Describe the expected output."),

  // Step 2 — input
  inputTypes: z
    .array(z.enum(INPUT_TYPES))
    .min(1, "Select at least one input type."),

  // Step 3 — output
  outputTypes: z
    .array(z.enum(OUTPUT_TYPES))
    .min(1, "Select at least one output type."),

  // Step 4 — workload
  requestsPerDay: z.number().int().min(1).max(100_000_000),
  averageInputTokens: z.number().int().min(1).max(MAX_TOKENS),
  averageOutputTokens: z.number().int().min(1).max(MAX_TOKENS),
  maximumContextRequired: z.number().int().min(1).max(MAX_TOKENS),

  // Step 5 — mandatory requirements
  requireImageInput: z.boolean(),
  requireToolUse: z.boolean(),
  requireStructuredOutput: z.boolean(),
  minimumContextWindow: z.number().int().min(0).max(MAX_TOKENS),
  maxMonthlyBudgetUsd: z.number().positive().max(10_000_000).nullable(),
  excludedProviders: z.array(z.string().trim().min(1)),

  // Step 6 — priority
  priority: z.enum(PRIORITIES),
});

export type TaskSpec = z.infer<typeof taskSpecSchema>;

/**
 * Defaults are deliberately modest and clearly explained in the wizard rather
 * than hidden, so a user can tell which numbers are theirs and which are ours.
 */
export function defaultTaskSpec(): TaskSpec {
  return {
    goal: "",
    exampleInput: "",
    expectedOutput: "",
    inputTypes: ["text"],
    outputTypes: ["json"],
    requestsPerDay: 1_000,
    averageInputTokens: 1_200,
    averageOutputTokens: 300,
    maximumContextRequired: 8_000,
    requireImageInput: false,
    requireToolUse: false,
    requireStructuredOutput: false,
    minimumContextWindow: 0,
    maxMonthlyBudgetUsd: null,
    excludedProviders: [],
    priority: "lowest_cost",
  };
}

export function parseTaskSpec(value: unknown) {
  return taskSpecSchema.safeParse(value);
}
