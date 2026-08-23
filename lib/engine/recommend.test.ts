import { describe, expect, it } from "vitest";

import { OPENAI_FIXTURE_MODELS } from "@/lib/data/fixtures/openai";
import { buildRecommendation } from "@/lib/engine/recommend";
import { makeModel, makeSpec } from "@/lib/test-support/factories";

const ids = (list: { model: { modelIdentifier: string } }[]) =>
  list.map((entry) => entry.model.modelIdentifier);

describe("buildRecommendation against the evidence-backed fixtures", () => {
  it("recommends the cheapest model that satisfies every mandatory requirement", () => {
    const spec = makeSpec({
      inputTypes: ["text", "images", "files"],
      outputTypes: ["json"],
      requestsPerDay: 1_000,
      averageInputTokens: 1_200,
      averageOutputTokens: 300,
      maximumContextRequired: 8_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);

    expect(result.primary?.model.modelIdentifier).toBe("gpt-4.1-nano");
    expect(result.primary?.cost).toMatchObject({ kind: "estimated", totalCost: 7.2 });
    expect(ids(result.otherCompatible)).toEqual(["gpt-4o-mini"]);
  });

  it("puts models with an unverifiable mandatory capability in their own bucket", () => {
    const spec = makeSpec({
      inputTypes: ["text", "images", "files"],
      outputTypes: ["json"],
      maximumContextRequired: 8_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);

    // The GPT-5.6 family documents file_search but not file_uploads, so document
    // input cannot be confirmed either way.
    expect(ids(result.cannotVerify).sort()).toEqual([
      "gpt-5.6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
    ]);
    expect(result.cannotVerify.every((e) => e.failureReasons.length === 0)).toBe(true);
  });

  it("rejects a model with an exact, quotable reason", () => {
    const spec = makeSpec({
      inputTypes: ["text", "images"],
      outputTypes: ["json"],
      maximumContextRequired: 8_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);
    const turbo = result.rejected.find(
      (e) => e.model.modelIdentifier === "gpt-3.5-turbo",
    );

    expect(turbo).toBeDefined();
    expect(turbo!.failureReasons.join(" ")).toContain(
      "image input is not supported",
    );
  });

  it("explains cheaper models that were passed over", () => {
    const spec = makeSpec({
      inputTypes: ["text", "images"],
      outputTypes: ["json"],
      requestsPerDay: 1_000,
      averageInputTokens: 1_200,
      averageOutputTokens: 40_000,
      maximumContextRequired: 100_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);

    expect(result.primary?.model.modelIdentifier).toBe("gpt-5.6-luna");

    // Both are genuinely cheaper, and both fail on maximum output length.
    expect(result.whyNotCheaper.map((entry) => entry.evaluation.model.modelIdentifier))
      .toEqual(["gpt-4.1-nano", "gpt-4o-mini"]);
    expect(result.whyNotCheaper[0].reasons.join(" ")).toContain("output tokens");
    expect(result.whyNotCheaper[0].monthlyCost).toBeLessThan(
      result.primary!.cost.kind === "estimated"
        ? result.primary!.cost.totalCost
        : 0,
    );
  });

  it("refuses to price a workload above the documented tier", () => {
    const spec = makeSpec({
      inputTypes: ["text"],
      outputTypes: ["free_text"],
      averageOutputTokens: 300,
      maximumContextRequired: 500_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);

    expect(ids(result.cannotEstimate).sort()).toEqual([
      "gpt-5.6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
    ]);
    expect(result.primary?.model.modelIdentifier).toBe("gpt-4.1-nano");
  });

  it("offers a stronger alternative only when it costs more AND adds verified value", () => {
    const spec = makeSpec({
      inputTypes: ["text", "images"],
      outputTypes: ["json"],
      averageOutputTokens: 300,
      maximumContextRequired: 200_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);
    expect(result.primary?.model.modelIdentifier).toBe("gpt-4.1-nano");

    const luna = result.strongerAlternatives.find(
      (alt) => alt.evaluation.model.modelIdentifier === "gpt-5.6-luna",
    );
    expect(luna).toBeDefined();
    expect(luna!.extraMonthlyCost).toBeGreaterThan(0);
    expect(luna!.additionalBenefits.length).toBeGreaterThan(0);

    for (const alternative of result.strongerAlternatives) {
      expect(alternative.additionalBenefits.length).toBeGreaterThan(0);
      expect(alternative.extraMonthlyCost).toBeGreaterThan(0);
    }
  });

  it("never leaves a compatible model cheaper than the primary", () => {
    const spec = makeSpec({
      inputTypes: ["text", "images"],
      outputTypes: ["json"],
      maximumContextRequired: 8_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);
    const primaryCost =
      result.primary!.cost.kind === "estimated"
        ? result.primary!.cost.totalCostExact
        : Number.POSITIVE_INFINITY;

    const others = [
      ...result.otherCompatible,
      ...result.strongerAlternatives.map((alt) => alt.evaluation),
    ];

    for (const other of others) {
      const cost =
        other.cost.kind === "estimated" ? other.cost.totalCostExact : Infinity;
      expect(cost).toBeGreaterThanOrEqual(primaryCost);
    }
  });

  it("returns no primary when nothing satisfies the requirements", () => {
    const spec = makeSpec({
      inputTypes: ["text", "audio"],
      outputTypes: ["json"],
      maximumContextRequired: 8_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);
    expect(result.primary).toBeNull();
    expect(result.whyNotCheaper).toHaveLength(0);
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("never recommends a model whose mandatory capability is unverified", () => {
    const spec = makeSpec({
      inputTypes: ["text", "files"],
      outputTypes: ["json"],
      maximumContextRequired: 8_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);
    expect(result.primary?.verdict).toBe("compatible");
    expect(result.primary?.unknowns).toHaveLength(0);
  });
});

describe("stronger-alternative materiality", () => {
  it("ignores a context-window edge below ten percent", () => {
    const spec = makeSpec({
      inputTypes: ["text", "images"],
      outputTypes: ["json"],
      averageOutputTokens: 300,
      maximumContextRequired: 200_000,
    });

    const result = buildRecommendation(spec, OPENAI_FIXTURE_MODELS);
    expect(result.primary?.model.modelIdentifier).toBe("gpt-4.1-nano");

    const luna = result.strongerAlternatives.find(
      (alt) => alt.evaluation.model.modelIdentifier === "gpt-5.6-luna",
    );

    // 1,050,000 vs 1,047,576 is a 0.2% edge and must not be sold as a benefit,
    // but the 128,000 vs 32,768 output limit genuinely is one.
    expect(luna).toBeDefined();
    expect(luna!.additionalBenefits.join(" ")).not.toContain("context window");
    expect(luna!.additionalBenefits.join(" ")).toContain("output tokens");
  });

  it("reports a context window that is materially larger", () => {
    const spec = makeSpec({
      inputTypes: ["text"],
      outputTypes: ["free_text"],
      maximumContextRequired: 50_000,
    });

    const cheap = makeModel({
      modelIdentifier: "cheap-small-context",
      inputPricePerMillion: 0.1,
      outputPricePerMillion: 0.4,
      contextWindow: 100_000,
      pricingValidUpToContext: 100_000,
    });
    const roomy = makeModel({
      modelIdentifier: "dear-large-context",
      inputPricePerMillion: 1,
      outputPricePerMillion: 4,
      contextWindow: 1_000_000, // 10x
      pricingValidUpToContext: 1_000_000,
    });

    const result = buildRecommendation(spec, [cheap, roomy]);
    expect(result.primary?.model.modelIdentifier).toBe("cheap-small-context");
    expect(result.strongerAlternatives[0]?.additionalBenefits.join(" ")).toContain(
      "context window",
    );
  });

  it("drops a candidate whose only edge is below the threshold", () => {
    const spec = makeSpec({
      inputTypes: ["text"],
      outputTypes: ["free_text"],
      maximumContextRequired: 50_000,
    });

    const cheap = makeModel({
      modelIdentifier: "cheap",
      inputPricePerMillion: 0.1,
      outputPricePerMillion: 0.4,
      contextWindow: 100_000,
      pricingValidUpToContext: 100_000,
    });
    const barely = makeModel({
      modelIdentifier: "barely-bigger",
      inputPricePerMillion: 1,
      outputPricePerMillion: 4,
      contextWindow: 105_000, // +5%, not material
      pricingValidUpToContext: 105_000,
    });

    const result = buildRecommendation(spec, [cheap, barely]);
    expect(result.strongerAlternatives).toHaveLength(0);
    // It is still compatible — just not worth paying more for.
    expect(result.otherCompatible.map((e) => e.model.modelIdentifier)).toEqual([
      "barely-bigger",
    ]);
  });

  it("never emits a stronger alternative with no benefits at all", () => {
    for (const context of [8_000, 100_000, 200_000]) {
      const result = buildRecommendation(
        makeSpec({
          inputTypes: ["text", "images"],
          outputTypes: ["json"],
          averageOutputTokens: 300,
          maximumContextRequired: context,
        }),
        OPENAI_FIXTURE_MODELS,
      );
      for (const alternative of result.strongerAlternatives) {
        expect(alternative.additionalBenefits.length).toBeGreaterThan(0);
      }
    }
  });
});
