import type { NormalizedModel } from "@/lib/domain/model";
import { CAPABILITY_LABELS } from "@/lib/domain/model";
import {
  deriveMandatoryRequirements,
  type MandatoryRequirement,
} from "@/lib/domain/requirements";
import type { TaskSpec } from "@/lib/domain/spec";
import { estimateMonthlyCost, type CostEstimate } from "@/lib/engine/cost";

/**
 * `assumed` is deliberately distinct from `pass`. It marks a requirement we treat
 * as satisfied on a stated assumption rather than on published evidence, so the
 * UI can never present it as a verified fact.
 */
/**
 * Stated once, used everywhere, so the wording cannot drift between the check
 * list and the pricing caveats.
 */
export const UNTIERED_PRICING_ASSUMPTION =
  "No context-based pricing tier is stated on this model page. This estimate assumes the listed Standard rate applies at the selected context size.";

export type CheckState = "pass" | "fail" | "unverified" | "assumed";

export interface RequirementCheck {
  requirementId: string;
  label: string;
  state: CheckState;
  /** What the official evidence actually says. */
  detail: string;
  /** Which of the user's answers made this mandatory. */
  because: string;
}

/**
 * Three-way outcome. `unverifiable` exists so that a model is never rejected for
 * a capability nobody could confirm — and never recommended on one either.
 */
export type Verdict = "compatible" | "unverifiable" | "rejected";

export interface ModelEvaluation {
  model: NormalizedModel;
  cost: CostEstimate;
  checks: RequirementCheck[];
  verdict: Verdict;
  /** Exact reasons the model was rejected. Empty unless verdict is "rejected". */
  failureReasons: string[];
  /** Requirements that could not be verified from official evidence. */
  unknowns: string[];
  /** Requirements satisfied on a stated assumption, not on published evidence. */
  assumptions: string[];
  /** True when the only thing standing in the way is the cost estimate itself. */
  costEstimateFailed: boolean;
}

function n(value: number): string {
  return value.toLocaleString("en-US");
}

function checkCapability(
  requirement: MandatoryRequirement,
  model: NormalizedModel,
): RequirementCheck {
  const capability = requirement.capability!;
  const state = model[capability];
  const label = CAPABILITY_LABELS[capability];

  if (state === true) {
    return {
      requirementId: requirement.id,
      label,
      state: "pass",
      detail: `Official documentation confirms ${label.toLowerCase()} is supported.`,
      because: requirement.because,
    };
  }

  if (state === false) {
    return {
      requirementId: requirement.id,
      label,
      state: "fail",
      detail: `Official documentation states ${label.toLowerCase()} is not supported.`,
      because: requirement.because,
    };
  }

  return {
    requirementId: requirement.id,
    label,
    state: "unverified",
    detail: `Official documentation does not state whether ${label.toLowerCase()} is supported.`,
    because: requirement.because,
  };
}

function evaluateRequirement(
  requirement: MandatoryRequirement,
  model: NormalizedModel,
  spec: TaskSpec,
  cost: CostEstimate,
): RequirementCheck {
  switch (requirement.kind) {
    case "capability":
      return checkCapability(requirement, model);

    case "context_window": {
      const needed = requirement.threshold!;
      if (model.contextWindow === null) {
        return {
          requirementId: requirement.id,
          label: requirement.label,
          state: "unverified",
          detail: "Context window is not published for this model.",
          because: requirement.because,
        };
      }
      const ok = model.contextWindow >= needed;
      return {
        requirementId: requirement.id,
        label: requirement.label,
        state: ok ? "pass" : "fail",
        detail: ok
          ? `Context window of ${n(model.contextWindow)} tokens covers the ${n(needed)} required.`
          : `Context window of ${n(model.contextWindow)} tokens is smaller than the ${n(needed)} required.`,
        because: requirement.because,
      };
    }

    case "max_output_tokens": {
      const needed = requirement.threshold!;
      if (model.maxOutputTokens === null) {
        return {
          requirementId: requirement.id,
          label: requirement.label,
          state: "unverified",
          detail: "Maximum output length is not published for this model.",
          because: requirement.because,
        };
      }
      const ok = model.maxOutputTokens >= needed;
      return {
        requirementId: requirement.id,
        label: requirement.label,
        state: ok ? "pass" : "fail",
        detail: ok
          ? `Can emit up to ${n(model.maxOutputTokens)} output tokens.`
          : `Can emit only ${n(model.maxOutputTokens)} output tokens, fewer than the ${n(needed)} expected.`,
        because: requirement.because,
      };
    }

    case "pricing_available": {
      const unavailable =
        cost.kind === "cannot-estimate" && cost.reason === "pricing-unavailable";
      return {
        requirementId: requirement.id,
        label: requirement.label,
        state: unavailable ? "fail" : "pass",
        detail: unavailable
          ? cost.detail
          : "Official token pricing is published for this model.",
        because: requirement.because,
      };
    }

    case "pricing_tier_covers_context": {
      const exceeded =
        cost.kind === "cannot-estimate" &&
        cost.reason === "context-exceeds-priced-tier";
      if (model.pricingValidUpToContext === null) {
        // No tier sentence on the page is the ORDINARY case, and it means the
        // published rate is the whole story — not that we failed to verify
        // something. Treating it as unverifiable would make every untiered model
        // unrecommendable, which is both useless and wrong. The assumption is
        // surfaced as a caveat on the result page instead of hidden here.
        return {
          requirementId: requirement.id,
          label: requirement.label,
          state: "assumed",
          detail: UNTIERED_PRICING_ASSUMPTION,
          because: requirement.because,
        };
      }
      return {
        requirementId: requirement.id,
        label: requirement.label,
        state: exceeded ? "fail" : "pass",
        detail: exceeded
          ? cost.detail
          : `Published rate is valid up to ${n(model.pricingValidUpToContext)} tokens.`,
        because: requirement.because,
      };
    }

    case "budget": {
      const budget = requirement.threshold!;
      if (cost.kind !== "estimated") {
        return {
          requirementId: requirement.id,
          label: requirement.label,
          state: "unverified",
          detail: "Cost could not be estimated, so the budget cannot be checked.",
          because: requirement.because,
        };
      }
      const ok = cost.totalCostExact <= budget;
      return {
        requirementId: requirement.id,
        label: requirement.label,
        state: ok ? "pass" : "fail",
        detail: ok
          ? `Estimated $${cost.totalCost.toFixed(2)} per month is within the $${n(budget)} ceiling.`
          : `Estimated $${cost.totalCost.toFixed(2)} per month exceeds the $${n(budget)} ceiling.`,
        because: requirement.because,
      };
    }

    case "provider_allowed": {
      const excluded = spec.excludedProviders.some(
        (provider) => provider.trim().toLowerCase() === model.provider.toLowerCase(),
      );
      return {
        requirementId: requirement.id,
        label: requirement.label,
        state: excluded ? "fail" : "pass",
        detail: excluded
          ? `You excluded ${model.provider}.`
          : `${model.provider} is not excluded.`,
        because: requirement.because,
      };
    }
  }
}

export function evaluateModel(
  spec: TaskSpec,
  model: NormalizedModel,
): ModelEvaluation {
  const cost = estimateMonthlyCost(spec, model);
  const requirements = deriveMandatoryRequirements(spec);
  const checks = requirements.map((requirement) =>
    evaluateRequirement(requirement, model, spec, cost),
  );

  const failed = checks.filter((check) => check.state === "fail");
  const unverified = checks.filter((check) => check.state === "unverified");
  const assumed = checks.filter((check) => check.state === "assumed");

  const verdict: Verdict =
    failed.length > 0 ? "rejected" : unverified.length > 0 ? "unverifiable" : "compatible";

  const pricingRequirementIds = new Set([
    "pricing_available",
    "pricing_tier_covers_context",
  ]);
  const costEstimateFailed =
    failed.length > 0 &&
    failed.every((check) => pricingRequirementIds.has(check.requirementId));

  return {
    model,
    cost,
    checks,
    verdict,
    failureReasons: failed.map((check) => check.detail),
    unknowns: unverified.map((check) => check.detail),
    /** Requirements met only under a stated assumption. */
    assumptions: assumed.map((check) => check.detail),
    costEstimateFailed,
  };
}

export function evaluateModels(
  spec: TaskSpec,
  models: NormalizedModel[],
): ModelEvaluation[] {
  return models.map((model) => evaluateModel(spec, model));
}
