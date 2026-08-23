import { describe, expect, it } from "vitest";

import {
  normalizeCollectorRecord,
  normalizeModalities,
  parsePricingNote,
} from "@/lib/brightdata/normalize";
import {
  REAL_RUN_GPT_41_NANO,
  REAL_RUN_GPT_56_LUNA,
} from "@/lib/brightdata/sample-responses";
import { collectorRecordSchema, validateCollectorRows } from "@/lib/brightdata/schema";

const CONTEXT = {
  provider: "openai",
  verifiedAt: "2026-08-23T06:00:00.000Z",
  sourceLabel: "OpenAI model reference",
};

function normalizeReal(raw: unknown) {
  const parsed = collectorRecordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`real collector output failed validation: ${parsed.error.message}`);
  }
  return normalizeCollectorRecord(parsed.data, CONTEXT);
}

/* ── Real collector output: gpt-5.6-luna ────────────────────── */

describe("real output — gpt-5.6-luna", () => {
  const model = normalizeReal(REAL_RUN_GPT_56_LUNA);

  it("preserves the pricing note verbatim", () => {
    expect(model.pricingNote).toBe(REAL_RUN_GPT_56_LUNA.pricing_note);
    expect(model.pricingNote).toContain(">272K input tokens");
  });

  it("parses the >272K tier rule into numbers", () => {
    expect(model.pricingValidUpToContext).toBe(272_000);
    expect(model.longContextInputMultiplier).toBe(2);
    expect(model.longContextOutputMultiplier).toBe(1.5);
  });

  it("keeps the cache-write sentence as a warning, not a tier rule", () => {
    expect(model.pricingWarnings).toHaveLength(1);
    expect(model.pricingWarnings[0]).toContain("Cache writes");
    // 1.25x must not have leaked into either applied multiplier.
    expect(model.longContextInputMultiplier).not.toBe(1.25);
    expect(model.longContextOutputMultiplier).not.toBe(1.25);
  });

  it("reads prices, context and output limit correctly", () => {
    expect(model.inputPricePerMillion).toBe(0.2);
    expect(model.cachedInputPricePerMillion).toBe(0.02);
    expect(model.outputPricePerMillion).toBe(1.2);
    expect(model.currency).toBe("USD");
    expect(model.contextWindow).toBe(1_050_000);
    expect(model.maxOutputTokens).toBe(128_000);
  });

  it("captures explicit Supported statuses as true", () => {
    expect(model.supportsTools).toBe(true);
    expect(model.supportsStructuredOutput).toBe(true);
  });

  it("captures image input from the modality list", () => {
    expect(model.supportsImages).toBe(true);
    expect(model.supportsText).toBe(true);
  });

  it("leaves capabilities the page never mentions as null", () => {
    // The rendered page lists no file-upload feature at all.
    expect(model.supportsFiles).toBeNull();
    // Audio is absent from the input-modality list; absence is not a denial.
    expect(model.supportsAudio).toBeNull();
  });

  it("never infers an unsupported capability", () => {
    const states = [
      model.supportsText,
      model.supportsImages,
      model.supportsAudio,
      model.supportsFiles,
      model.supportsTools,
      model.supportsStructuredOutput,
    ];
    // Nothing on this page states a negative for any capability we track, so no
    // `false` may appear. (Fine-tuning is "Not supported" but is not a tracked
    // capability, and must not bleed into one.)
    expect(states).not.toContain(false);
  });
});

/* ── Real collector output: gpt-4.1-nano ────────────────────── */

describe("real output — gpt-4.1-nano", () => {
  const model = normalizeReal(REAL_RUN_GPT_41_NANO);

  it("accepts a record whose pricing_note key is absent entirely", () => {
    expect("pricing_note" in REAL_RUN_GPT_41_NANO).toBe(false);
    expect(model.pricingNote).toBeNull();
  });

  it("leaves every derived tier field null when there is no note", () => {
    expect(model.pricingValidUpToContext).toBeNull();
    expect(model.longContextInputMultiplier).toBeNull();
    expect(model.longContextOutputMultiplier).toBeNull();
    expect(model.pricingWarnings).toEqual([]);
  });

  it("still reads the rest of the record", () => {
    expect(model.modelIdentifier).toBe("gpt-4.1-nano");
    expect(model.displayName).toBe("GPT-4.1 nano");
    expect(model.inputPricePerMillion).toBe(0.1);
    expect(model.cachedInputPricePerMillion).toBe(0.025);
    expect(model.outputPricePerMillion).toBe(0.4);
    expect(model.contextWindow).toBe(1_047_576);
    expect(model.maxOutputTokens).toBe(32_768);
  });

  it("lowercases modality names", () => {
    expect(REAL_RUN_GPT_41_NANO.input_modalities).toEqual(["Text", "Image"]);
    expect(model.supportsText).toBe(true);
    expect(model.supportsImages).toBe(true);
  });

  it("uses the echoed run input as the evidence URL", () => {
    expect(model.sourceUrl).toBe(
      "https://developers.openai.com/api/docs/models/gpt-4.1-nano",
    );
    expect(model.verifiedAt).toBe(CONTEXT.verifiedAt);
  });
});

/* ── Explicit feature statuses ──────────────────────────────── */

describe("feature status mapping", () => {
  const base = {
    model_id: "m",
    input_modalities: [],
    output_modalities: [],
    input: { url: "https://developers.openai.com/api/docs/models/m" },
  };

  const withFeatures = (features: { feature_name: string; status: string }[]) =>
    normalizeReal({ ...base, features });

  it("maps Supported to true", () => {
    const model = withFeatures([
      { feature_name: "Function calling", status: "Supported" },
      { feature_name: "Structured outputs", status: "Supported" },
    ]);
    expect(model.supportsTools).toBe(true);
    expect(model.supportsStructuredOutput).toBe(true);
  });

  it("maps Not supported to false", () => {
    const model = withFeatures([
      { feature_name: "Function calling", status: "Not supported" },
      { feature_name: "Structured outputs", status: "Not supported" },
    ]);
    expect(model.supportsTools).toBe(false);
    expect(model.supportsStructuredOutput).toBe(false);
  });

  it("leaves a missing feature null rather than false", () => {
    const model = withFeatures([
      { feature_name: "Function calling", status: "Supported" },
    ]);
    expect(model.supportsTools).toBe(true);
    expect(model.supportsStructuredOutput).toBeNull();
    expect(model.supportsFiles).toBeNull();
  });

  it("treats an unrecognised status as unverified, not as a denial", () => {
    const model = withFeatures([
      { feature_name: "Function calling", status: "Preview" },
    ]);
    expect(model.supportsTools).toBeNull();
  });

  it("ignores features that map to no tracked capability", () => {
    const model = withFeatures([
      { feature_name: "Fine-tuning", status: "Not supported" },
      { feature_name: "Predicted outputs", status: "Supported" },
    ]);
    expect(model.supportsTools).toBeNull();
    expect(model.supportsStructuredOutput).toBeNull();
    expect(model.supportsFiles).toBeNull();
  });

  it("captures an explicit file-upload feature when a page states one", () => {
    const model = withFeatures([{ feature_name: "File uploads", status: "Supported" }]);
    expect(model.supportsFiles).toBe(true);
  });
});

/* ── Pricing note parsing ───────────────────────────────────── */

describe("parsePricingNote", () => {
  it("returns nothing for an absent note", () => {
    expect(parsePricingNote(null)).toEqual({
      validUpToContext: null,
      longContextInputMultiplier: null,
      longContextOutputMultiplier: null,
      warnings: [],
    });
  });

  it("returns nothing for a blank note", () => {
    expect(parsePricingNote("   ").validUpToContext).toBeNull();
  });

  it("scales K and M suffixes", () => {
    expect(
      parsePricingNote("Prompts with >272K input tokens are priced at 2x input.")
        .validUpToContext,
    ).toBe(272_000);
    expect(
      parsePricingNote("Prompts with >1.5M input tokens are priced at 3x input.")
        .validUpToContext,
    ).toBe(1_500_000);
  });

  it("handles an unsuffixed threshold", () => {
    expect(
      parsePricingNote("Prompts over 128000 tokens are priced at 2x input.")
        .validUpToContext,
    ).toBe(128_000);
  });

  it("emits no tier data when there is no threshold, and keeps the prose", () => {
    const note =
      "Cache writes are billed at 1.25x the uncached input token rate. Batch API pricing is 50% lower.";
    const parsed = parsePricingNote(note);

    expect(parsed.validUpToContext).toBeNull();
    expect(parsed.longContextInputMultiplier).toBeNull();
    expect(parsed.longContextOutputMultiplier).toBeNull();
    expect(parsed.warnings).toHaveLength(2);
  });

  it("preserves promotional prose without inventing a tier", () => {
    const note =
      "GPT-5.6 Sol costs $4 per million input tokens and $20 per million output tokens, a 20% reduction in input pricing and a 33% reduction in output pricing. GPT-5.6 Sol's promotional pricing is available at least through November 21, 2026. Prompts with >272K input tokens are priced at 2x input and 1.5x output for the full request. Cache writes are billed at 1.25x the uncached input token rate.";
    const parsed = parsePricingNote(note);

    // The real tier rule is still found...
    expect(parsed.validUpToContext).toBe(272_000);
    expect(parsed.longContextInputMultiplier).toBe(2);
    expect(parsed.longContextOutputMultiplier).toBe(1.5);

    // ...and the promotional wording survives as a visible warning.
    const warnings = parsed.warnings.join(" ");
    expect(warnings).toContain("promotional pricing");
    expect(warnings).toContain("20% reduction");
    expect(warnings).toContain("Cache writes");

    // The "20%"/"33%" reductions must not have become multipliers.
    expect(parsed.longContextInputMultiplier).not.toBe(0.2);
    expect(parsed.longContextOutputMultiplier).not.toBe(0.33);
  });
});

/* ── Schema behaviour ───────────────────────────────────────── */

describe("collector row validation", () => {
  const good = REAL_RUN_GPT_56_LUNA;

  it("accepts both real records", () => {
    const outcome = validateCollectorRows([REAL_RUN_GPT_41_NANO, REAL_RUN_GPT_56_LUNA]);
    expect(outcome.valid).toHaveLength(2);
    expect(outcome.failures).toEqual([]);
  });

  it("rejects a negative price instead of coercing it", () => {
    const outcome = validateCollectorRows([
      { ...good, standard_input_usd_per_1m: -1 },
    ]);
    expect(outcome.valid).toHaveLength(0);
    expect(outcome.failures[0].issues.join(" ")).toContain("negative");
  });

  it("rejects a blank model identifier", () => {
    const outcome = validateCollectorRows([{ ...good, model_id: "  " }]);
    expect(outcome.valid).toHaveLength(0);
    expect(outcome.failures[0].issues.join(" ")).toContain("model_id");
  });

  it("rejects a source URL outside the approved domains", () => {
    const outcome = validateCollectorRows([
      { ...good, url: "https://example.com/pricing", input: { url: "https://example.com/pricing" } },
    ]);
    expect(outcome.valid).toHaveLength(0);
  });

  it("tolerates unrequested extra fields", () => {
    const outcome = validateCollectorRows([{ ...good, locale: "en_US", surprise: 1 }]);
    expect(outcome.valid).toHaveLength(1);
  });

  it("reports the offending model id without throwing", () => {
    const outcome = validateCollectorRows([
      { ...good, context_window_tokens: -5 },
    ]);
    expect(outcome.failures[0].modelId).toBe("gpt-5.6-luna");
  });
});

describe("normalizeModalities", () => {
  it("lowercases and trims", () => {
    expect(normalizeModalities([" Text ", "Image", "AUDIO"])).toEqual([
      "text",
      "image",
      "audio",
    ]);
  });
});
