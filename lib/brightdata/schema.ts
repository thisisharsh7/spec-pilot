import { z } from "zod";

/*
  Validation for raw Bright Data collector rows.

  Optional keys use `.nullish()` deliberately: the real collector OMITS a field
  rather than returning null when the page states no value (confirmed on
  gpt-4.1-nano, which has no `pricing_note` key at all). Requiring the key would
  reject a perfectly good record, so a missing key normalizes to null.

  Prices are rejected, not coerced, when negative — a negative rate is corrupt
  data, and silently treating it as null or zero would understate cost.
*/

/** Hosts we accept as official evidence. Nothing else may enter the catalog. */
export const APPROVED_SOURCE_HOSTS = new Set([
  "openai.com",
  "platform.openai.com",
  "developers.openai.com",
  "anthropic.com",
  "docs.anthropic.com",
  "platform.claude.com",
  "docs.claude.com",
]);

export function isApprovedSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && APPROVED_SOURCE_HOSTS.has(url.host);
  } catch {
    return false;
  }
}

const approvedUrl = z
  .string()
  .refine(isApprovedSourceUrl, "Source URL is not an approved provider domain.");

const price = z
  .number()
  .refine(Number.isFinite, "Price must be finite.")
  .nonnegative("Price must not be negative.");

const tokenCount = z
  .number()
  .int("Token counts must be whole numbers.")
  .nonnegative("Token counts must not be negative.");

const optionalString = z.string().nullish().transform((v) => v ?? null);

export const collectorFeatureSchema = z.object({
  feature_name: z.string().trim().min(1),
  status: z.string().trim().min(1),
});

export const collectorRecordSchema = z
  .object({
    model_id: z.string().trim().min(1, "Model identifier is required."),
    display_name: optionalString,
    input_modalities: z
      .array(z.string())
      .nullish()
      .transform((v) => v ?? []),
    output_modalities: z
      .array(z.string())
      .nullish()
      .transform((v) => v ?? []),
    context_window_tokens: tokenCount.nullish().transform((v) => v ?? null),
    max_output_tokens: tokenCount.nullish().transform((v) => v ?? null),
    features: z
      .array(collectorFeatureSchema)
      .nullish()
      .transform((v) => v ?? []),
    standard_input_usd_per_1m: price.nullish().transform((v) => v ?? null),
    standard_cached_input_usd_per_1m: price.nullish().transform((v) => v ?? null),
    standard_output_usd_per_1m: price.nullish().transform((v) => v ?? null),
    pricing_note: optionalString,
    url: approvedUrl.nullish().transform((v) => v ?? null),
    input: z
      .object({ url: approvedUrl })
      .nullish()
      .transform((v) => v ?? null),
  })
  // The collector adds fields we did not ask for (e.g. `locale`). Extra keys are
  // tolerated rather than treated as corruption.
  .loose()
  .refine(
    (record) => record.url !== null || record.input !== null,
    "A record must carry an approved source URL.",
  );

export type CollectorRecord = z.infer<typeof collectorRecordSchema>;

export interface RecordValidationFailure {
  index: number;
  modelId: string | null;
  issues: string[];
}

export interface ValidationOutcome {
  valid: CollectorRecord[];
  failures: RecordValidationFailure[];
}

/** Validate a whole dataset, keeping good rows and reporting bad ones safely. */
export function validateCollectorRows(rows: unknown[]): ValidationOutcome {
  const valid: CollectorRecord[] = [];
  const failures: RecordValidationFailure[] = [];

  rows.forEach((row, index) => {
    const result = collectorRecordSchema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
      return;
    }

    const modelId =
      row !== null && typeof row === "object" && "model_id" in row
        ? String((row as { model_id?: unknown }).model_id ?? "") || null
        : null;

    failures.push({
      index,
      modelId,
      issues: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    });
  });

  return { valid, failures };
}
