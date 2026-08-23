import { isApprovedSourceUrl } from "@/lib/brightdata/schema";

/*
  The approved scrape batch.

  These are the five rendered OpenAI model reference pages signed off for the
  first collector. Rendered HTML, not the `.md` variant — the collector's
  selectors were generated against the rendered page, and the `.md` target failed
  AI generation outright.

  This list is a constant on purpose. Scrape targets are never taken from user
  input or a query parameter.
*/

export interface ProviderTargets {
  provider: string;
  collectorEnvKey: string;
  sourceLabel: string;
  urls: string[];
}

const OPENAI_MODEL_PAGE = "https://developers.openai.com/api/docs/models";

export const OPENAI_TARGETS: ProviderTargets = {
  provider: "openai",
  collectorEnvKey: "BRIGHT_DATA_OPENAI_COLLECTOR_ID",
  sourceLabel: "OpenAI model reference",
  urls: [
    `${OPENAI_MODEL_PAGE}/gpt-5.6-sol`,
    `${OPENAI_MODEL_PAGE}/gpt-5.6-terra`,
    `${OPENAI_MODEL_PAGE}/gpt-5.6-luna`,
    `${OPENAI_MODEL_PAGE}/gpt-4.1-nano`,
    `${OPENAI_MODEL_PAGE}/gpt-4o-mini`,
  ],
};

export const PROVIDER_TARGETS: Record<string, ProviderTargets> = {
  openai: OPENAI_TARGETS,
};

export function getProviderTargets(provider: string): ProviderTargets | null {
  return PROVIDER_TARGETS[provider.toLowerCase()] ?? null;
}

/** Defence in depth: the constant list is still checked against the allowlist. */
export function assertTargetsApproved(targets: ProviderTargets): void {
  const rejected = targets.urls.filter((url) => !isApprovedSourceUrl(url));
  if (rejected.length > 0) {
    throw new Error(
      `Refusing to scrape ${rejected.length} URL(s) outside the approved provider domains.`,
    );
  }
}
