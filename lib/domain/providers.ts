/** The providers SpecPilot covers. Scope is deliberately two, not a marketplace. */
export interface ProviderInfo {
  slug: string;
  displayName: string;
  /** Human-readable official documentation entry point. */
  sourceUrl: string;
  /** Environment variable NAME for the collector. Never a value. */
  collectorEnvKey: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    slug: "openai",
    displayName: "OpenAI",
    sourceUrl: "https://developers.openai.com/api/docs/models",
    collectorEnvKey: "BRIGHT_DATA_OPENAI_COLLECTOR_ID",
  },
  {
    slug: "anthropic",
    displayName: "Anthropic",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/models/overview",
    collectorEnvKey: "BRIGHT_DATA_ANTHROPIC_COLLECTOR_ID",
  },
];

export function providerDisplayName(slug: string): string {
  return PROVIDERS.find((provider) => provider.slug === slug)?.displayName ?? slug;
}
