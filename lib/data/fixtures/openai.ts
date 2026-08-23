import type { NormalizedModel } from "@/lib/domain/model";

/*
  ─────────────────────────────────────────────────────────────────────────────
  DEVELOPMENT FIXTURES — NOT LIVE DATA
  ─────────────────────────────────────────────────────────────────────────────

  Every value below was transcribed by hand from the official OpenAI model-detail
  page named in each record's `sourceUrl`, fetched on the fixed date in
  FIXTURE_VERIFIED_AT. Nothing here is recalled from memory or inferred.

  These records are replaced wholesale once the Bright Data collector runs against
  the same pages. Until then the UI must show the "Development data" badge and
  must not describe this as live or recently verified.

  Transcription rules, applied uniformly:

  · supportsText / supportsImages / supportsAudio come from the page's explicit
    "Input modalities:" line, which enumerates the supported modalities. A
    modality absent from that enumeration is a documented negative -> false.

  · supportsTools    <- "function_calling"    in "## Supported features"
    supportsStructuredOutput <- "structured_outputs" in the same list.
    Absent from that list -> false (the list is an explicit enumeration).

  · supportsFiles <- "file_uploads" in "## Supported features" -> true.
    Absent -> null, NOT false. "Input modalities" describes token modalities and
    does not speak to document upload, and several models list the `file_search`
    retrieval tool without listing `file_uploads`. That is genuine ambiguity, so
    the honest value is "cannot verify".

  · pricingValidUpToContext: where a page documents a price tier boundary
    ("Prompts with >272K input tokens are priced at 2x input and 1.5x output"),
    the boundary is recorded. Where a page documents no boundary, the quoted rate
    covers the whole window, so the value equals contextWindow.

  · Prices are the Standard text-token rates only. Batch, Flex, Priority, cache
    writes and regional multipliers are deliberately excluded.
*/

/** Fixed. Never "now" — fixtures must not look freshly verified. */
export const FIXTURE_VERIFIED_AT = "2026-08-23T00:00:00.000Z";

const PROVIDER = "openai";

type PricingExtras = Pick<
  NormalizedModel,
  | "pricingNote"
  | "pricingWarnings"
  | "longContextInputMultiplier"
  | "longContextOutputMultiplier"
>;

type ModelCore = Omit<
  NormalizedModel,
  | "provider"
  | "currency"
  | "pricingMode"
  | "scrapeUrl"
  | "sourceUrl"
  | "sourceLabel"
  | "verifiedAt"
  | keyof PricingExtras
>;

function openaiModel(
  slug: string,
  record: ModelCore & Partial<PricingExtras>,
): NormalizedModel {
  // The collector targets the rendered page, so scrapeUrl and sourceUrl coincide
  // for OpenAI. They stay separate fields because other providers publish a
  // machine-readable variant at a different URL.
  const page = `https://developers.openai.com/api/docs/models/${slug}`;

  return {
    provider: PROVIDER,
    currency: "USD",
    pricingMode: "standard",
    pricingNote: null,
    pricingWarnings: [],
    longContextInputMultiplier: null,
    longContextOutputMultiplier: null,
    scrapeUrl: page,
    sourceUrl: page,
    sourceLabel: "OpenAI model reference",
    verifiedAt: FIXTURE_VERIFIED_AT,
    ...record,
  };
}

/** Verbatim from the GPT-5.6 family pricing sections. */
const TIER_NOTE_56 =
  "Prompts with >272K input tokens are priced at 2x input and 1.5x output for the full request. Cache writes are billed at 1.25x the uncached input token rate.";
const CACHE_WRITE_WARNING =
  "Cache writes are billed at 1.25x the uncached input token rate.";

export const OPENAI_FIXTURE_MODELS: NormalizedModel[] = [
  openaiModel("gpt-5.6-sol", {
    modelIdentifier: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    inputPricePerMillion: 4,
    cachedInputPricePerMillion: 0.4,
    outputPricePerMillion: 20,
    pricingValidUpToContext: 272_000,
    pricingNote: TIER_NOTE_56,
    longContextInputMultiplier: 2,
    longContextOutputMultiplier: 1.5,
    pricingWarnings: [
      "GPT-5.6 Sol's promotional pricing is available at least through November 21, 2026.",
      CACHE_WRITE_WARNING,
    ],
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    supportsText: true,
    supportsImages: true,
    supportsAudio: false,
    supportsFiles: null, // file_search listed, file_uploads not
    supportsTools: true,
    supportsStructuredOutput: true,
  }),

  openaiModel("gpt-5.6-terra", {
    modelIdentifier: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    inputPricePerMillion: 2,
    cachedInputPricePerMillion: 0.2,
    outputPricePerMillion: 12,
    pricingValidUpToContext: 272_000,
    pricingNote: TIER_NOTE_56,
    longContextInputMultiplier: 2,
    longContextOutputMultiplier: 1.5,
    pricingWarnings: [CACHE_WRITE_WARNING],
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    supportsText: true,
    supportsImages: true,
    supportsAudio: false,
    supportsFiles: null,
    supportsTools: true,
    supportsStructuredOutput: true,
  }),

  openaiModel("gpt-5.6-luna", {
    modelIdentifier: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    inputPricePerMillion: 0.2,
    cachedInputPricePerMillion: 0.02,
    outputPricePerMillion: 1.2,
    pricingValidUpToContext: 272_000,
    pricingNote: TIER_NOTE_56,
    longContextInputMultiplier: 2,
    longContextOutputMultiplier: 1.5,
    pricingWarnings: [CACHE_WRITE_WARNING],
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    supportsText: true,
    supportsImages: true,
    supportsAudio: false,
    supportsFiles: null,
    supportsTools: true,
    supportsStructuredOutput: true,
  }),

  openaiModel("gpt-4.1-nano", {
    modelIdentifier: "gpt-4.1-nano",
    displayName: "GPT-4.1 nano",
    inputPricePerMillion: 0.1,
    cachedInputPricePerMillion: 0.025,
    outputPricePerMillion: 0.4,
    // No tier boundary documented on the page: the rate covers the whole window.
    pricingValidUpToContext: 1_047_576,
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
    supportsText: true,
    supportsImages: true,
    supportsAudio: false,
    supportsFiles: true, // file_uploads listed
    supportsTools: true,
    supportsStructuredOutput: true,
  }),

  openaiModel("gpt-4o-mini", {
    modelIdentifier: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    inputPricePerMillion: 0.15,
    cachedInputPricePerMillion: 0.075,
    outputPricePerMillion: 0.6,
    pricingValidUpToContext: 128_000,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    supportsText: true,
    supportsImages: true,
    supportsAudio: false,
    supportsFiles: true, // file_uploads listed
    supportsTools: true,
    supportsStructuredOutput: true,
  }),

  openaiModel("gpt-3.5-turbo", {
    modelIdentifier: "gpt-3.5-turbo",
    displayName: "GPT-3.5 Turbo",
    inputPricePerMillion: 0.5,
    // Page's comparison table shows "-" for cached input on this model.
    cachedInputPricePerMillion: null,
    outputPricePerMillion: 1.5,
    pricingValidUpToContext: 16_385,
    contextWindow: 16_385,
    maxOutputTokens: 4_096,
    supportsText: true,
    supportsImages: false, // "Input modalities: text" only
    supportsAudio: false,
    supportsFiles: null,
    // "## Supported features" lists only fine_tuning.
    supportsTools: false,
    supportsStructuredOutput: false,
  }),
];
