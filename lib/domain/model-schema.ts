import { z } from "zod";

import { isApprovedSourceUrl } from "@/lib/brightdata/schema";

/*
  Zod mirror of `NormalizedModel`, used to validate stored JSONB on the way OUT of
  the database as well as on the way in.

  Re-validating on read is deliberate. A snapshot may have been written by an
  older deploy, seeded by hand, or edited directly in the Supabase console. The
  cost of checking is trivial next to serving a malformed price as fact.
*/

const capabilityState = z.union([z.literal(true), z.literal(false), z.null()]);

const price = z
  .number()
  .refine(Number.isFinite, "Price must be finite.")
  .nonnegative("Price must not be negative.")
  .nullable();

const tokenCount = z
  .number()
  .int("Token counts must be whole numbers.")
  .nonnegative("Token counts must not be negative.")
  .nullable();

const approvedUrl = z
  .string()
  .refine(isApprovedSourceUrl, "Source URL is not an approved provider domain.");

export const normalizedModelSchema = z.object({
  provider: z.string().trim().min(1),
  modelIdentifier: z.string().trim().min(1),
  displayName: z.string().trim().min(1),

  inputPricePerMillion: price,
  cachedInputPricePerMillion: price,
  outputPricePerMillion: price,
  currency: z.string().trim().min(1).nullable(),
  pricingMode: z.literal("standard"),
  pricingNote: z.string().nullable(),
  pricingWarnings: z.array(z.string()),
  longContextInputMultiplier: z.number().positive().nullable(),
  longContextOutputMultiplier: z.number().positive().nullable(),
  pricingValidUpToContext: tokenCount,

  contextWindow: tokenCount,
  maxOutputTokens: tokenCount,

  supportsText: capabilityState,
  supportsImages: capabilityState,
  supportsAudio: capabilityState,
  supportsFiles: capabilityState,
  supportsTools: capabilityState,
  supportsStructuredOutput: capabilityState,

  scrapeUrl: approvedUrl,
  sourceUrl: approvedUrl,
  sourceLabel: z.string().trim().min(1),
  verifiedAt: z.string().refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "verifiedAt must be a valid timestamp.",
  ),
});

export const normalizedModelsSchema = z.array(normalizedModelSchema);

export interface ModelsParseResult {
  models: z.infer<typeof normalizedModelsSchema>;
  rejected: { index: number; modelIdentifier: string | null; issues: string[] }[];
}

/**
 * Validate a stored `models` array, keeping the good rows and reporting the bad.
 *
 * Partial acceptance is right here: one corrupt row should not blank the catalog,
 * but it must never be served either.
 */
export function parseStoredModels(value: unknown): ModelsParseResult {
  if (!Array.isArray(value)) {
    return {
      models: [],
      rejected: [{ index: -1, modelIdentifier: null, issues: ["models is not an array"] }],
    };
  }

  const models: z.infer<typeof normalizedModelsSchema> = [];
  const rejected: ModelsParseResult["rejected"] = [];

  value.forEach((row, index) => {
    const result = normalizedModelSchema.safeParse(row);
    if (result.success) {
      models.push(result.data);
      return;
    }

    const identifier =
      row !== null && typeof row === "object" && "modelIdentifier" in row
        ? String((row as { modelIdentifier?: unknown }).modelIdentifier ?? "") || null
        : null;

    rejected.push({
      index,
      modelIdentifier: identifier,
      issues: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    });
  });

  return { models, rejected };
}
