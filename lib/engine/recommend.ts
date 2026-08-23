import { CAPABILITY_LABELS, type CapabilityKey, type NormalizedModel } from "@/lib/domain/model";
import type { TaskSpec } from "@/lib/domain/spec";
import { COST_DISCLAIMER, roundCurrency } from "@/lib/engine/cost";
import { evaluateModels, type ModelEvaluation } from "@/lib/engine/filter";
import { computeRequirementFit, type RequirementFit } from "@/lib/engine/fit";
import { rankCandidates } from "@/lib/engine/rank";

const CAPABILITY_KEYS: CapabilityKey[] = [
  "supportsText",
  "supportsImages",
  "supportsAudio",
  "supportsFiles",
  "supportsTools",
  "supportsStructuredOutput",
];

export interface StrongerAlternative {
  evaluation: ModelEvaluation;
  fit: RequirementFit;
  /** How much more per month than the primary. Always positive. */
  extraMonthlyCost: number;
  /** Specific, verified advantages over the primary. Never empty. */
  additionalBenefits: string[];
}

export interface CheaperButIncompatible {
  evaluation: ModelEvaluation;
  monthlyCost: number;
  /** Exact reasons this cheaper model was passed over. */
  reasons: string[];
}

export interface Recommendation {
  primary: ModelEvaluation | null;
  primaryFit: RequirementFit | null;
  strongerAlternatives: StrongerAlternative[];
  /** Compatible, but neither cheapest nor demonstrably stronger. */
  otherCompatible: ModelEvaluation[];
  /** Cheaper than the primary, but cannot satisfy or verify a requirement. */
  whyNotCheaper: CheaperButIncompatible[];
  cannotVerify: ModelEvaluation[];
  cannotEstimate: ModelEvaluation[];
  rejected: ModelEvaluation[];
  evaluatedCount: number;
  disclaimer: string;
}

function costOrNull(evaluation: ModelEvaluation): number | null {
  return evaluation.cost.kind === "estimated"
    ? evaluation.cost.totalCostExact
    : null;
}

/**
 * A bigger number is only an advantage if it is big enough to change a decision.
 * Ten percent is the floor: without it a 2,424-token edge on a ~1,050,000-token
 * window (0.2%) would be presented as a reason to pay more, which is noise.
 */
const MATERIAL_INCREASE = 1.1;

function materiallyLarger(candidate: number | null, primary: number | null): boolean {
  if (candidate === null || primary === null || primary <= 0) return false;
  return candidate >= primary * MATERIAL_INCREASE;
}

/**
 * Verified advantages of `candidate` over `primary`.
 *
 * Only counts capabilities the candidate has confirmed `true` where the primary
 * does not — an unverified capability is never presented as an advantage — and
 * only counts size differences that clear the materiality floor.
 */
function additionalBenefitsOver(
  candidate: NormalizedModel,
  primary: NormalizedModel,
): string[] {
  const benefits: string[] = [];

  for (const key of CAPABILITY_KEYS) {
    if (candidate[key] === true && primary[key] !== true) {
      benefits.push(`Adds verified ${CAPABILITY_LABELS[key].toLowerCase()}`);
    }
  }

  if (materiallyLarger(candidate.contextWindow, primary.contextWindow)) {
    const times = (candidate.contextWindow! / primary.contextWindow!).toFixed(1);
    benefits.push(
      `${candidate.contextWindow!.toLocaleString("en-US")}-token context window, ${times}x the primary`,
    );
  }

  if (materiallyLarger(candidate.maxOutputTokens, primary.maxOutputTokens)) {
    const times = (candidate.maxOutputTokens! / primary.maxOutputTokens!).toFixed(1);
    benefits.push(
      `Can emit ${candidate.maxOutputTokens!.toLocaleString("en-US")} output tokens, ${times}x the primary`,
    );
  }

  return benefits;
}

/**
 * Deterministic recommendation.
 *
 * The primary is the cheapest model satisfying every mandatory requirement, so
 * there is deliberately no "cheaper alternative" — it cannot exist. Cheaper
 * models that were passed over appear under `whyNotCheaper` with exact reasons.
 */
export function buildRecommendation(
  spec: TaskSpec,
  models: NormalizedModel[],
): Recommendation {
  const evaluations = evaluateModels(spec, models);

  const compatible = evaluations.filter(
    (evaluation) =>
      evaluation.verdict === "compatible" && evaluation.cost.kind === "estimated",
  );
  const cannotVerify = evaluations.filter(
    (evaluation) => evaluation.verdict === "unverifiable",
  );
  const cannotEstimate = evaluations.filter(
    (evaluation) => evaluation.verdict === "rejected" && evaluation.costEstimateFailed,
  );
  const rejected = evaluations.filter(
    (evaluation) => evaluation.verdict === "rejected" && !evaluation.costEstimateFailed,
  );

  const ranked = rankCandidates(compatible, spec);
  const primary = ranked[0] ?? null;

  if (!primary) {
    return {
      primary: null,
      primaryFit: null,
      strongerAlternatives: [],
      otherCompatible: [],
      whyNotCheaper: [],
      cannotVerify,
      cannotEstimate,
      rejected,
      evaluatedCount: evaluations.length,
      disclaimer: COST_DISCLAIMER,
    };
  }

  const primaryCost = costOrNull(primary) ?? 0;
  const strongerAlternatives: StrongerAlternative[] = [];
  const otherCompatible: ModelEvaluation[] = [];

  for (const candidate of ranked.slice(1)) {
    const candidateCost = costOrNull(candidate) ?? 0;
    const benefits = additionalBenefitsOver(candidate.model, primary.model);

    if (candidateCost > primaryCost && benefits.length > 0) {
      strongerAlternatives.push({
        evaluation: candidate,
        fit: computeRequirementFit(candidate, spec),
        extraMonthlyCost: roundCurrency(candidateCost - primaryCost),
        additionalBenefits: benefits,
      });
    } else {
      otherCompatible.push(candidate);
    }
  }

  // Cheaper models that did not qualify. These also appear in their own bucket;
  // this view exists so the page can answer "why not the cheap one?" directly.
  const whyNotCheaper: CheaperButIncompatible[] = [...cannotVerify, ...cannotEstimate, ...rejected]
    .map((evaluation) => ({ evaluation, cost: costOrNull(evaluation) }))
    .filter(
      (entry): entry is { evaluation: ModelEvaluation; cost: number } =>
        entry.cost !== null && entry.cost < primaryCost,
    )
    .sort((a, b) => a.cost - b.cost)
    .map(({ evaluation, cost }) => ({
      evaluation,
      monthlyCost: roundCurrency(cost),
      reasons:
        evaluation.failureReasons.length > 0
          ? evaluation.failureReasons
          : evaluation.unknowns,
    }));

  return {
    primary,
    primaryFit: computeRequirementFit(primary, spec),
    strongerAlternatives,
    otherCompatible,
    whyNotCheaper,
    cannotVerify,
    cannotEstimate,
    rejected,
    evaluatedCount: evaluations.length,
    disclaimer: COST_DISCLAIMER,
  };
}
