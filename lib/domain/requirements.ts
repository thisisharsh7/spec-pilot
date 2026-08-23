import type { CapabilityKey } from "@/lib/domain/model";
import { CAPABILITY_LABELS } from "@/lib/domain/model";
import {
  INPUT_TYPE_LABELS,
  OUTPUT_TYPE_LABELS,
  type TaskSpec,
} from "@/lib/domain/spec";

/*
  Requirements are DERIVED from the specification, not asked for twice.

  Selecting an input type in step 2 is a statement that you need it, so it becomes
  mandatory. Step 5's explicit toggles add requirements on top. Every requirement
  records `because` — the answer that made it mandatory — so the result page can
  explain each rejection in the user's own terms.
*/

export type MandatoryRequirementKind =
  | "capability"
  | "context_window"
  | "max_output_tokens"
  | "pricing_available"
  | "pricing_tier_covers_context"
  | "budget"
  | "provider_allowed";

export interface MandatoryRequirement {
  id: string;
  kind: MandatoryRequirementKind;
  label: string;
  because: string;
  capability?: CapabilityKey;
  threshold?: number;
}

export interface PreferredRequirement {
  id: string;
  label: string;
  capability?: CapabilityKey;
  threshold?: number;
}

/**
 * The context a model must actually be able to hold: whichever is largest of the
 * user's stated minimum, their stated maximum, and one round trip of tokens.
 */
export function requiredContextTokens(spec: TaskSpec): number {
  return Math.max(
    spec.minimumContextWindow,
    spec.maximumContextRequired,
    spec.averageInputTokens + spec.averageOutputTokens,
  );
}

const INPUT_TYPE_CAPABILITY: Record<string, CapabilityKey> = {
  text: "supportsText",
  images: "supportsImages",
  audio: "supportsAudio",
  files: "supportsFiles",
};

export function deriveMandatoryRequirements(
  spec: TaskSpec,
): MandatoryRequirement[] {
  const requirements: MandatoryRequirement[] = [];
  const seen = new Set<CapabilityKey>();

  const addCapability = (capability: CapabilityKey, because: string) => {
    if (seen.has(capability)) return;
    seen.add(capability);
    requirements.push({
      id: `capability:${capability}`,
      kind: "capability",
      label: CAPABILITY_LABELS[capability],
      because,
      capability,
    });
  };

  for (const inputType of spec.inputTypes) {
    const capability = INPUT_TYPE_CAPABILITY[inputType];
    if (capability) {
      addCapability(
        capability,
        `You selected "${INPUT_TYPE_LABELS[inputType]}" as an input type.`,
      );
    }
  }

  // Only strict JSON forces structured-output mode. Classification and extraction
  // can be produced as plain text, so they are treated as preferences instead of
  // rejecting models that could genuinely do the job.
  if (spec.outputTypes.includes("json")) {
    addCapability(
      "supportsStructuredOutput",
      `You selected "${OUTPUT_TYPE_LABELS.json}" as an output type.`,
    );
  }
  if (spec.outputTypes.includes("tool_calls")) {
    addCapability(
      "supportsTools",
      `You selected "${OUTPUT_TYPE_LABELS.tool_calls}" as an output type.`,
    );
  }

  if (spec.requireImageInput) {
    addCapability("supportsImages", "You marked image input as mandatory.");
  }
  if (spec.requireToolUse) {
    addCapability("supportsTools", "You marked tool use as mandatory.");
  }
  if (spec.requireStructuredOutput) {
    addCapability(
      "supportsStructuredOutput",
      "You marked structured output as mandatory.",
    );
  }

  const contextNeeded = requiredContextTokens(spec);
  requirements.push({
    id: "context_window",
    kind: "context_window",
    label: "Context window",
    because: `Your workload needs ${contextNeeded.toLocaleString("en-US")} tokens of context.`,
    threshold: contextNeeded,
  });

  requirements.push({
    id: "max_output_tokens",
    kind: "max_output_tokens",
    label: "Maximum output length",
    because: `You expect about ${spec.averageOutputTokens.toLocaleString("en-US")} output tokens per request.`,
    threshold: spec.averageOutputTokens,
  });

  requirements.push({
    id: "pricing_available",
    kind: "pricing_available",
    label: "Published pricing",
    because: "A cost estimate cannot be produced without official token pricing.",
  });

  requirements.push({
    id: "pricing_tier_covers_context",
    kind: "pricing_tier_covers_context",
    label: "Pricing valid at this context size",
    because: `Quoted rates must remain valid at ${contextNeeded.toLocaleString("en-US")} tokens.`,
    threshold: contextNeeded,
  });

  if (spec.maxMonthlyBudgetUsd !== null) {
    requirements.push({
      id: "budget",
      kind: "budget",
      label: "Monthly budget",
      because: `You set a hard ceiling of $${spec.maxMonthlyBudgetUsd.toLocaleString("en-US")} per month.`,
      threshold: spec.maxMonthlyBudgetUsd,
    });
  }

  if (spec.excludedProviders.length > 0) {
    requirements.push({
      id: "provider_allowed",
      kind: "provider_allowed",
      label: "Provider not excluded",
      because: `You excluded: ${spec.excludedProviders.join(", ")}.`,
    });
  }

  return requirements;
}

/**
 * Preferences never reject a model. They break ties between models of equal cost
 * and feed the requirement-fit breakdown.
 */
export function derivePreferredRequirements(
  spec: TaskSpec,
): PreferredRequirement[] {
  const mandatory = new Set(
    deriveMandatoryRequirements(spec)
      .map((requirement) => requirement.capability)
      .filter((capability): capability is CapabilityKey => Boolean(capability)),
  );

  const preferred: PreferredRequirement[] = [];
  const contextNeeded = requiredContextTokens(spec);

  preferred.push({
    id: "context_headroom",
    label: "Context headroom (2x what you need)",
    threshold: contextNeeded * 2,
  });

  preferred.push({
    id: "cached_pricing",
    label: "Published cached-input pricing",
  });

  const wantsStructure = spec.outputTypes.some((outputType) =>
    ["classification", "extraction", "code"].includes(outputType),
  );
  if (wantsStructure && !mandatory.has("supportsStructuredOutput")) {
    preferred.push({
      id: "structured_output_available",
      label: CAPABILITY_LABELS.supportsStructuredOutput,
      capability: "supportsStructuredOutput",
    });
  }

  if (!mandatory.has("supportsTools")) {
    preferred.push({
      id: "tools_available",
      label: CAPABILITY_LABELS.supportsTools,
      capability: "supportsTools",
    });
  }

  return preferred;
}
