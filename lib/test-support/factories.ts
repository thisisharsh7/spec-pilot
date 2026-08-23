import type { NormalizedModel } from "@/lib/domain/model";
import { defaultTaskSpec, type TaskSpec } from "@/lib/domain/spec";

/** A fully-verified, unremarkable model. Override only what a test cares about. */
export function makeModel(
  overrides: Partial<NormalizedModel> = {},
): NormalizedModel {
  return {
    provider: "testprovider",
    modelIdentifier: "test-model",
    displayName: "Test Model",
    inputPricePerMillion: 1,
    cachedInputPricePerMillion: 0.1,
    outputPricePerMillion: 4,
    currency: "USD",
    pricingMode: "standard",
    pricingValidUpToContext: 200_000,
    pricingNote: null,
    pricingWarnings: [],
    longContextInputMultiplier: null,
    longContextOutputMultiplier: null,
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    supportsText: true,
    supportsImages: true,
    supportsAudio: false,
    supportsFiles: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    scrapeUrl: "https://developers.openai.com/api/docs/models/test-model",
    sourceUrl: "https://developers.openai.com/api/docs/models/test-model",
    sourceLabel: "Test source",
    verifiedAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

export function makeSpec(overrides: Partial<TaskSpec> = {}): TaskSpec {
  return {
    ...defaultTaskSpec(),
    goal: "Extract vendor name, invoice total and due date from scanned invoices.",
    exampleInput: "A scanned PDF invoice.",
    expectedOutput: "Strict JSON with vendor, total and dueDate.",
    ...overrides,
  };
}
