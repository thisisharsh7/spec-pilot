import type {
  CapabilityKey,
  CapabilityState,
  NormalizedModel,
} from "@/lib/domain/model";
import type { CollectorRecord } from "@/lib/brightdata/schema";

/*
  Raw collector rows -> NormalizedModel.

  Every rule here is deliberately conservative:

  · Absence is never evidence. A capability missing from the page's feature list
    becomes null, not false. Only an explicit "Not supported" yields false.
  · `pricing_note` is preserved verbatim and every tier field is PARSED from it,
    so a reader can always check the derivation against the provider's own words.
  · Prose we cannot turn into a number (promotional rates, cache-write
    multipliers) is surfaced as a warning rather than discarded or acted on.
*/

export interface ParsedPricingNote {
  validUpToContext: number | null;
  longContextInputMultiplier: number | null;
  longContextOutputMultiplier: number | null;
  /** Sentences that are not the tier rule. Shown to the user, never applied. */
  warnings: string[];
}

const EMPTY_NOTE: ParsedPricingNote = {
  validUpToContext: null,
  longContextInputMultiplier: null,
  longContextOutputMultiplier: null,
  warnings: [],
};

const SCALE: Record<string, number> = { k: 1_000, m: 1_000_000 };

/** ">272K input tokens" -> 272000. Also handles "1.5M" and a bare "128000". */
function parseThreshold(sentence: string): number | null {
  const match = sentence.match(
    /(?:>|over|above|more than)\s*([\d.,]+)\s*([km])?\s*(?:input\s+)?tokens/i,
  );
  if (!match) return null;

  const magnitude = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(magnitude) || magnitude <= 0) return null;

  const scale = match[2] ? SCALE[match[2].toLowerCase()] : 1;
  const value = magnitude * (scale ?? 1);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function parseMultiplier(sentence: string, side: "input" | "output"): number | null {
  const pattern = new RegExp(`([\\d.]+)\\s*x\\s+${side}\\b`, "i");
  const match = sentence.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function splitSentences(note: string): string[] {
  return note
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Parse a provider pricing note into tier facts plus leftover prose.
 *
 * A threshold is mandatory for any tier data: multipliers with no context ceiling
 * cannot be applied to anything, and emitting half a rule invites misuse. If no
 * threshold is found, all three tier fields stay null and the whole note becomes
 * a warning.
 */
export function parsePricingNote(note: string | null): ParsedPricingNote {
  if (note === null || note.trim() === "") return EMPTY_NOTE;

  const sentences = splitSentences(note);
  const warnings: string[] = [];

  let validUpToContext: number | null = null;
  let longContextInputMultiplier: number | null = null;
  let longContextOutputMultiplier: number | null = null;

  for (const sentence of sentences) {
    const threshold = parseThreshold(sentence);
    const isTierRule = threshold !== null && /priced at|priced as/i.test(sentence);

    if (isTierRule && validUpToContext === null) {
      validUpToContext = threshold;
      longContextInputMultiplier = parseMultiplier(sentence, "input");
      longContextOutputMultiplier = parseMultiplier(sentence, "output");
      continue;
    }

    // Anything we did not convert into a rule stays visible to the user.
    warnings.push(sentence);
  }

  if (validUpToContext === null) {
    return { ...EMPTY_NOTE, warnings: sentences };
  }

  return {
    validUpToContext,
    longContextInputMultiplier,
    longContextOutputMultiplier,
    warnings,
  };
}

/* ── Capabilities ───────────────────────────────────────────── */

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Human feature labels on the rendered page -> capability fields. */
const FEATURE_CAPABILITY: Record<string, CapabilityKey> = {
  functioncalling: "supportsTools",
  toolcalling: "supportsTools",
  tools: "supportsTools",
  structuredoutputs: "supportsStructuredOutput",
  structuredoutput: "supportsStructuredOutput",
  jsonmode: "supportsStructuredOutput",
  fileuploads: "supportsFiles",
  fileupload: "supportsFiles",
  fileinputs: "supportsFiles",
  imageinput: "supportsImages",
  imageinputs: "supportsImages",
  vision: "supportsImages",
  audioinput: "supportsAudio",
  audioinputs: "supportsAudio",
};

const MODALITY_CAPABILITY: Record<string, CapabilityKey> = {
  text: "supportsText",
  image: "supportsImages",
  images: "supportsImages",
  audio: "supportsAudio",
  file: "supportsFiles",
  files: "supportsFiles",
  document: "supportsFiles",
  documents: "supportsFiles",
};

/** Only an explicit statement counts. Anything else is unverified. */
function statusToState(status: string): CapabilityState {
  const normalized = slug(status);
  if (normalized === "supported") return true;
  if (normalized === "notsupported" || normalized === "unsupported") return false;
  return null;
}

export function normalizeModalities(values: readonly string[]): string[] {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

interface CapabilityResolution {
  capabilities: Record<CapabilityKey, CapabilityState>;
  inputModalities: string[];
  outputModalities: string[];
}

function resolveCapabilities(record: CollectorRecord): CapabilityResolution {
  const capabilities: Record<CapabilityKey, CapabilityState> = {
    supportsText: null,
    supportsImages: null,
    supportsAudio: null,
    supportsFiles: null,
    supportsTools: null,
    supportsStructuredOutput: null,
  };

  // Explicit feature statuses first.
  for (const feature of record.features) {
    const key = FEATURE_CAPABILITY[slug(feature.feature_name)];
    if (!key) continue;
    const state = statusToState(feature.status);
    if (state !== null) capabilities[key] = state;
  }

  // A listed input modality is a positive statement and outranks silence, but it
  // is never used to infer a negative: a modality that is simply absent from the
  // list stays null, because this source does not enumerate what it excludes.
  const inputModalities = normalizeModalities(record.input_modalities);
  for (const modality of inputModalities) {
    const key = MODALITY_CAPABILITY[modality];
    if (key) capabilities[key] = true;
  }

  return {
    capabilities,
    inputModalities,
    outputModalities: normalizeModalities(record.output_modalities),
  };
}

/* ── Assembly ───────────────────────────────────────────────── */

export interface NormalizeContext {
  provider: string;
  /** Timestamp of the collector run that produced the row. */
  verifiedAt: string;
  sourceLabel: string;
}

export function normalizeCollectorRecord(
  record: CollectorRecord,
  context: NormalizeContext,
): NormalizedModel {
  const pricing = parsePricingNote(record.pricing_note);
  const { capabilities } = resolveCapabilities(record);
  const pageUrl = record.input?.url ?? record.url;

  if (!pageUrl) {
    // Unreachable via the schema, which refuses rows without an approved URL.
    throw new Error("Cannot normalize a record without a source URL.");
  }

  return {
    provider: context.provider,
    modelIdentifier: record.model_id.trim(),
    displayName: record.display_name?.trim() || record.model_id.trim(),

    inputPricePerMillion: record.standard_input_usd_per_1m,
    cachedInputPricePerMillion: record.standard_cached_input_usd_per_1m,
    outputPricePerMillion: record.standard_output_usd_per_1m,
    currency: record.standard_input_usd_per_1m === null ? null : "USD",
    pricingMode: "standard",
    pricingNote: record.pricing_note,
    pricingWarnings: pricing.warnings,
    longContextInputMultiplier: pricing.longContextInputMultiplier,
    longContextOutputMultiplier: pricing.longContextOutputMultiplier,
    pricingValidUpToContext: pricing.validUpToContext,

    contextWindow: record.context_window_tokens,
    maxOutputTokens: record.max_output_tokens,

    ...capabilities,

    scrapeUrl: pageUrl,
    sourceUrl: pageUrl,
    sourceLabel: context.sourceLabel,
    verifiedAt: context.verifiedAt,
  };
}

export function normalizeCollectorRecords(
  records: CollectorRecord[],
  context: NormalizeContext,
): NormalizedModel[] {
  return records.map((record) => normalizeCollectorRecord(record, context));
}
