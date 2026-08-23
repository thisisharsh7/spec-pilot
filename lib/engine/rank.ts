import type { CapabilityKey } from "@/lib/domain/model";
import { requiredContextTokens } from "@/lib/domain/requirements";
import type { Priority, TaskSpec } from "@/lib/domain/spec";
import type { ModelEvaluation } from "@/lib/engine/filter";

/*
  Ranking order — cost is never displaced.

    1. estimated monthly cost, ascending   <- ALWAYS the primary key
    2. the user's priority                 <- tiebreak only, at equal cost
    3. context headroom, descending
    4. verified capability breadth, descending
    5. evidence freshness, newest first
    6. model identifier, ascending         <- makes the order fully deterministic

  The primary recommendation is therefore always the cheapest model that
  satisfies every mandatory requirement. A "cheaper compatible alternative"
  cannot exist by construction.
*/

const CAPABILITY_KEYS: CapabilityKey[] = [
  "supportsText",
  "supportsImages",
  "supportsAudio",
  "supportsFiles",
  "supportsTools",
  "supportsStructuredOutput",
];

export function verifiedCapabilityCount(evaluation: ModelEvaluation): number {
  return CAPABILITY_KEYS.filter((key) => evaluation.model[key] === true).length;
}

export function contextHeadroom(
  evaluation: ModelEvaluation,
  spec: TaskSpec,
): number {
  const contextWindow = evaluation.model.contextWindow;
  if (contextWindow === null) return 0;
  return contextWindow - requiredContextTokens(spec);
}

function costOf(evaluation: ModelEvaluation): number {
  return evaluation.cost.kind === "estimated"
    ? evaluation.cost.totalCostExact
    : Number.POSITIVE_INFINITY;
}

function freshnessOf(evaluation: ModelEvaluation): number {
  const time = Date.parse(evaluation.model.verifiedAt);
  return Number.isNaN(time) ? 0 : time;
}

/** Applied only when two models cost exactly the same. */
function priorityTiebreak(
  a: ModelEvaluation,
  b: ModelEvaluation,
  priority: Priority,
): number {
  switch (priority) {
    case "largest_context":
      return (b.model.contextWindow ?? 0) - (a.model.contextWindow ?? 0);
    case "most_capabilities":
      return verifiedCapabilityCount(b) - verifiedCapabilityCount(a);
    case "freshest_evidence":
      return freshnessOf(b) - freshnessOf(a);
    case "lowest_cost":
    default:
      return 0;
  }
}

export function compareCandidates(
  a: ModelEvaluation,
  b: ModelEvaluation,
  spec: TaskSpec,
): number {
  const byCost = costOf(a) - costOf(b);
  if (byCost !== 0) return byCost;

  const byPriority = priorityTiebreak(a, b, spec.priority);
  if (byPriority !== 0) return byPriority;

  const byHeadroom = contextHeadroom(b, spec) - contextHeadroom(a, spec);
  if (byHeadroom !== 0) return byHeadroom;

  const byCapabilities = verifiedCapabilityCount(b) - verifiedCapabilityCount(a);
  if (byCapabilities !== 0) return byCapabilities;

  const byFreshness = freshnessOf(b) - freshnessOf(a);
  if (byFreshness !== 0) return byFreshness;

  return a.model.modelIdentifier.localeCompare(b.model.modelIdentifier);
}

export function rankCandidates(
  evaluations: ModelEvaluation[],
  spec: TaskSpec,
): ModelEvaluation[] {
  return [...evaluations].sort((a, b) => compareCandidates(a, b, spec));
}
