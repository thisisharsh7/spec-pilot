import type { NormalizedModel } from "@/lib/domain/model";
import { requiredContextTokens } from "@/lib/domain/requirements";
import { DAYS_PER_MONTH, type TaskSpec } from "@/lib/domain/spec";

export { DAYS_PER_MONTH };

export const COST_DISCLAIMER =
  "Estimate based on published token pricing. Caching, tools, batch processing, regional pricing, taxes and provider-specific charges may change the final cost.";

export type CannotEstimateReason =
  | "pricing-unavailable"
  | "context-exceeds-priced-tier"
  | "workload-out-of-range";

export interface EstimatedCost {
  kind: "estimated";
  currency: string;
  monthlyRequests: number;
  monthlyInputTokens: number;
  monthlyOutputTokens: number;
  /** Rounded to 2dp for display. */
  inputCost: number;
  outputCost: number;
  /** Sum of the two rounded parts, so the displayed table always adds up. */
  totalCost: number;
  /** Full precision. Ranking and comparison use this, never the display value. */
  totalCostExact: number;
}

export interface CannotEstimate {
  kind: "cannot-estimate";
  reason: CannotEstimateReason;
  detail: string;
}

export type CostEstimate = EstimatedCost | CannotEstimate;

/**
 * Round half-up to 2dp. The epsilon nudge corrects the common binary-float case
 * where an exact half (1.005) is stored fractionally below and would round down.
 */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundExact(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

function isUsablePrice(price: number | null): price is number {
  return price !== null && Number.isFinite(price) && price >= 0;
}

function isSafeCount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

/**
 * Monthly cost for one model under one specification.
 *
 * Deliberately refuses rather than guesses:
 *  · a missing input or output price is not treated as zero
 *  · a price whose documented tier does not reach the required context is not
 *    applied to that workload, because doing so understates the real cost
 */
export function estimateMonthlyCost(
  spec: TaskSpec,
  model: NormalizedModel,
): CostEstimate {
  if (!isUsablePrice(model.inputPricePerMillion)) {
    return {
      kind: "cannot-estimate",
      reason: "pricing-unavailable",
      detail: "No published input price for this model.",
    };
  }

  if (!isUsablePrice(model.outputPricePerMillion)) {
    return {
      kind: "cannot-estimate",
      reason: "pricing-unavailable",
      detail: "No published output price for this model.",
    };
  }

  const contextNeeded = requiredContextTokens(spec);
  if (
    model.pricingValidUpToContext !== null &&
    contextNeeded > model.pricingValidUpToContext
  ) {
    return {
      kind: "cannot-estimate",
      reason: "context-exceeds-priced-tier",
      detail: `Published rates cover prompts up to ${model.pricingValidUpToContext.toLocaleString(
        "en-US",
      )} tokens, but this workload needs ${contextNeeded.toLocaleString("en-US")}. A higher pricing tier applies and is not quoted here.`,
    };
  }

  const monthlyRequests = spec.requestsPerDay * DAYS_PER_MONTH;
  const monthlyInputTokens = monthlyRequests * spec.averageInputTokens;
  const monthlyOutputTokens = monthlyRequests * spec.averageOutputTokens;

  if (
    !isSafeCount(monthlyRequests) ||
    !isSafeCount(monthlyInputTokens) ||
    !isSafeCount(monthlyOutputTokens)
  ) {
    return {
      kind: "cannot-estimate",
      reason: "workload-out-of-range",
      detail: "This workload is too large to estimate precisely.",
    };
  }

  const inputCostExact =
    (monthlyInputTokens / 1_000_000) * model.inputPricePerMillion;
  const outputCostExact =
    (monthlyOutputTokens / 1_000_000) * model.outputPricePerMillion;
  const totalExact = inputCostExact + outputCostExact;

  if (!Number.isFinite(totalExact)) {
    return {
      kind: "cannot-estimate",
      reason: "workload-out-of-range",
      detail: "This workload is too large to estimate precisely.",
    };
  }

  const inputCost = roundCurrency(inputCostExact);
  const outputCost = roundCurrency(outputCostExact);

  return {
    kind: "estimated",
    currency: model.currency ?? "USD",
    monthlyRequests,
    monthlyInputTokens,
    monthlyOutputTokens,
    inputCost,
    outputCost,
    totalCost: roundCurrency(inputCost + outputCost),
    totalCostExact: roundExact(totalExact),
  };
}
