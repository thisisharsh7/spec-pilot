/**
 * Normalized model record — the single shape every data source produces.
 *
 * Honesty contract: `CapabilityState` is a three-state value.
 *   true  — an official provider page states the capability IS supported
 *   false — an official provider page states it is NOT supported
 *   null  — the capability could not be verified from an official page
 *
 * `null` is NOT a synonym for `false`. Unverified is not unsupported, and the UI
 * must never render `null` as a failure.
 */
export type CapabilityState = true | false | null;

export interface NormalizedModel {
  provider: string;
  modelIdentifier: string;
  displayName: string;

  /**
   * Standard on-demand token pricing only. Batch, Flex, Priority, regional and
   * promotional tiers are deliberately never mixed into these fields.
   */
  inputPricePerMillion: number | null;
  cachedInputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  currency: string | null;
  pricingMode: "standard";
  /**
   * The provider's own pricing prose, preserved verbatim. Every derived tier
   * field below is parsed from this string, so the derivation is always auditable
   * against what the page actually said.
   */
  pricingNote: string | null;
  /**
   * Free-text pricing caveats a user should see but which must not silently
   * change the estimate — promotional rates, cache-write multipliers, and so on.
   * Never treated as a capability.
   */
  pricingWarnings: string[];
  /** Rate multipliers that apply above `pricingValidUpToContext`. */
  longContextInputMultiplier: number | null;
  longContextOutputMultiplier: number | null;
  /**
   * Largest context the quoted price is actually valid for.
   *
   * Providers tier prices by prompt size — OpenAI's GPT-5.6 family, for example,
   * documents "prompts with >272K input tokens are priced at 2x input and 1.5x
   * output", so the quoted rate holds only up to 272,000 tokens even though the
   * context window is 1,050,000. Quoting the cheap tier for a workload above the
   * ceiling would understate cost, so the engine refuses to estimate instead.
   *
   * `null` means the ceiling could not be determined.
   */
  pricingValidUpToContext: number | null;

  contextWindow: number | null;
  maxOutputTokens: number | null;

  supportsText: CapabilityState;
  supportsImages: CapabilityState;
  supportsAudio: CapabilityState;
  supportsFiles: CapabilityState;
  supportsTools: CapabilityState;
  supportsStructuredOutput: CapabilityState;

  /** Internal collector target. May be a machine-readable `.md` variant. */
  scrapeUrl: string;
  /** Human-readable official page shown to users as evidence. */
  sourceUrl: string;
  sourceLabel: string;
  verifiedAt: string;
}

/** Which capability fields the engine can require. */
export type CapabilityKey =
  | "supportsText"
  | "supportsImages"
  | "supportsAudio"
  | "supportsFiles"
  | "supportsTools"
  | "supportsStructuredOutput";

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  supportsText: "Text input",
  supportsImages: "Image input",
  supportsAudio: "Audio input",
  supportsFiles: "Document / file input",
  supportsTools: "Tool calling",
  supportsStructuredOutput: "Structured output",
};

/**
 * Where the catalog is coming from right now.
 *
 * `snapshot` is real collector output persisted locally; `fixtures` is
 * hand-transcribed development data. Only `fixtures` gets the warning badge.
 */
export type DataMode = "snapshot" | "fixtures" | "supabase" | "unconfigured";

export type HealthState =
  | "healthy"
  | "partial"
  | "stale"
  | "failed"
  | "not_configured";

export type Freshness = "fresh" | "stale" | "fixture" | "unknown";

export interface ProviderHealth {
  provider: string;
  displayName: string;
  /** Human-readable official documentation page. */
  sourceUrl: string;
  collectorConfigured: boolean;
  /** Environment variable NAME only. Never a value. */
  collectorEnvKey: string;
  lastSuccessfulRefreshAt: string | null;
  recordsReceived: number | null;
  recordsValid: number | null;
  state: HealthState;
  /** Pre-sanitised message safe to render. Never raw provider output. */
  lastErrorMessage: string | null;
  freshness: Freshness;
}
