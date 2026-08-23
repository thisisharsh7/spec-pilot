import { describe, expect, it } from "vitest";

import { evaluateModels } from "@/lib/engine/filter";
import { rankCandidates } from "@/lib/engine/rank";
import { makeModel, makeSpec } from "@/lib/test-support/factories";

const cheap = makeModel({
  modelIdentifier: "cheap",
  inputPricePerMillion: 0.1,
  outputPricePerMillion: 0.4,
  contextWindow: 100_000,
  pricingValidUpToContext: 100_000,
});

const dear = makeModel({
  modelIdentifier: "dear",
  inputPricePerMillion: 4,
  outputPricePerMillion: 20,
  contextWindow: 1_000_000,
  pricingValidUpToContext: 1_000_000,
});

function order(spec = makeSpec(), models = [dear, cheap]) {
  return rankCandidates(evaluateModels(spec, models), spec).map(
    (evaluation) => evaluation.model.modelIdentifier,
  );
}

describe("ranking", () => {
  it("puts the cheapest model first", () => {
    expect(order()[0]).toBe("cheap");
  });

  it("keeps cost primary even when the priority favours a pricier model", () => {
    const spec = makeSpec({ priority: "largest_context" });
    expect(order(spec)[0]).toBe("cheap");
  });

  it("uses priority only to break a tie at equal cost", () => {
    const small = makeModel({
      modelIdentifier: "small-context",
      contextWindow: 100_000,
      pricingValidUpToContext: 100_000,
    });
    const large = makeModel({
      modelIdentifier: "large-context",
      contextWindow: 900_000,
      pricingValidUpToContext: 900_000,
    });

    const byCost = makeSpec({ priority: "lowest_cost" });
    const byContext = makeSpec({ priority: "largest_context" });

    // Identical prices, so the tiebreak decides.
    expect(order(byContext, [small, large])[0]).toBe("large-context");
    // With no priority preference the deterministic fallbacks still order them.
    expect(order(byCost, [small, large])[0]).toBe("large-context");
  });

  it("is stable and deterministic for identical models", () => {
    const a = makeModel({ modelIdentifier: "aaa" });
    const b = makeModel({ modelIdentifier: "bbb" });
    const spec = makeSpec();

    expect(order(spec, [b, a])).toEqual(["aaa", "bbb"]);
    expect(order(spec, [a, b])).toEqual(["aaa", "bbb"]);
  });

  it("produces the same order regardless of input order", () => {
    const spec = makeSpec();
    expect(order(spec, [cheap, dear])).toEqual(order(spec, [dear, cheap]));
  });

  it("breaks ties on freshest evidence when asked", () => {
    const older = makeModel({
      modelIdentifier: "older",
      verifiedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = makeModel({
      modelIdentifier: "newer",
      verifiedAt: "2026-08-01T00:00:00.000Z",
    });
    const spec = makeSpec({ priority: "freshest_evidence" });
    expect(order(spec, [older, newer])[0]).toBe("newer");
  });
});
