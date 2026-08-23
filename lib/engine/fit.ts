import {
  derivePreferredRequirements,
  requiredContextTokens,
  type PreferredRequirement,
} from "@/lib/domain/requirements";
import type { TaskSpec } from "@/lib/domain/spec";
import type { CheckState, ModelEvaluation } from "@/lib/engine/filter";

/*
  "Requirement fit" — a deterministic score, always shown with its breakdown.

  This measures how well a model matches THIS SPECIFICATION. It is not a quality,
  benchmark or accuracy score, and must never be labelled as one.

  Mandatory criteria are weighted 3, preferences 1. An unverified mandatory
  requirement earns nothing: unknown is not credit.
*/

const MANDATORY_WEIGHT = 3;
const PREFERRED_WEIGHT = 1;

export interface FitCriterion {
  id: string;
  label: string;
  kind: "mandatory" | "preferred";
  weight: number;
  state: CheckState;
}

export interface RequirementFit {
  /** 0-100, integer. */
  score: number;
  criteria: FitCriterion[];
  earnedWeight: number;
  totalWeight: number;
  /**
   * How many criteria are satisfied only on a stated assumption. Reported
   * alongside the score so a headline number can never imply that every
   * criterion was independently verified.
   */
  assumedCount: number;
}

function evaluatePreference(
  preference: PreferredRequirement,
  evaluation: ModelEvaluation,
  spec: TaskSpec,
): FitCriterion["state"] {
  if (preference.capability) {
    const value = evaluation.model[preference.capability];
    if (value === true) return "pass";
    if (value === false) return "fail";
    return "unverified";
  }

  if (preference.id === "context_headroom") {
    const contextWindow = evaluation.model.contextWindow;
    if (contextWindow === null) return "unverified";
    return contextWindow >= requiredContextTokens(spec) * 2 ? "pass" : "fail";
  }

  if (preference.id === "cached_pricing") {
    return evaluation.model.cachedInputPricePerMillion !== null ? "pass" : "fail";
  }

  return "unverified";
}

export function computeRequirementFit(
  evaluation: ModelEvaluation,
  spec: TaskSpec,
): RequirementFit {
  const criteria: FitCriterion[] = evaluation.checks.map((check) => ({
    id: check.requirementId,
    label: check.label,
    kind: "mandatory",
    weight: MANDATORY_WEIGHT,
    state: check.state,
  }));

  for (const preference of derivePreferredRequirements(spec)) {
    criteria.push({
      id: preference.id,
      label: preference.label,
      kind: "preferred",
      weight: PREFERRED_WEIGHT,
      state: evaluatePreference(preference, evaluation, spec),
    });
  }

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const earnedWeight = criteria.reduce(
    (sum, c) => sum + (c.state === "pass" || c.state === "assumed" ? c.weight : 0),
    0,
  );
  const assumedCount = criteria.filter((c) => c.state === "assumed").length;

  return {
    score: totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100),
    criteria,
    earnedWeight,
    totalWeight,
    assumedCount,
  };
}
