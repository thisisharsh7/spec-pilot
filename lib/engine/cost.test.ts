import { describe, expect, it } from "vitest";

import { estimateMonthlyCost, roundCurrency } from "@/lib/engine/cost";
import { makeModel, makeSpec } from "@/lib/test-support/factories";

describe("roundCurrency", () => {
  it("rounds to two decimal places", () => {
    expect(roundCurrency(1.234)).toBe(1.23);
    expect(roundCurrency(1.235)).toBe(1.24);
  });

  it("rounds exact halves up despite binary float representation", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(0.005)).toBe(0.01);
  });

  it("leaves whole numbers alone", () => {
    expect(roundCurrency(120)).toBe(120);
  });
});

describe("estimateMonthlyCost", () => {
  it("applies the documented formula over a 30-day month", () => {
    const spec = makeSpec({
      requestsPerDay: 1_000,
      averageInputTokens: 1_000,
      averageOutputTokens: 500,
      maximumContextRequired: 4_000,
    });
    const model = makeModel({
      inputPricePerMillion: 2,
      outputPricePerMillion: 10,
    });

    const cost = estimateMonthlyCost(spec, model);
    expect(cost.kind).toBe("estimated");
    if (cost.kind !== "estimated") return;

    // 1,000 x 30 = 30,000 requests
    expect(cost.monthlyRequests).toBe(30_000);
    expect(cost.monthlyInputTokens).toBe(30_000_000);
    expect(cost.monthlyOutputTokens).toBe(15_000_000);
    // 30M/1M * $2 = $60 ; 15M/1M * $10 = $150
    expect(cost.inputCost).toBe(60);
    expect(cost.outputCost).toBe(150);
    expect(cost.totalCost).toBe(210);
  });

  it("keeps the displayed total equal to the sum of the displayed parts", () => {
    const spec = makeSpec({
      requestsPerDay: 7,
      averageInputTokens: 1_111,
      averageOutputTokens: 777,
      maximumContextRequired: 4_000,
    });
    const cost = estimateMonthlyCost(spec, makeModel());
    if (cost.kind !== "estimated") throw new Error("expected an estimate");

    expect(cost.totalCost).toBe(roundCurrency(cost.inputCost + cost.outputCost));
  });

  it("refuses to estimate when the input price is missing", () => {
    const cost = estimateMonthlyCost(
      makeSpec(),
      makeModel({ inputPricePerMillion: null }),
    );
    expect(cost).toMatchObject({
      kind: "cannot-estimate",
      reason: "pricing-unavailable",
    });
  });

  it("refuses to estimate when the output price is missing", () => {
    const cost = estimateMonthlyCost(
      makeSpec(),
      makeModel({ outputPricePerMillion: null }),
    );
    expect(cost).toMatchObject({
      kind: "cannot-estimate",
      reason: "pricing-unavailable",
    });
  });

  it("treats a negative price as unusable rather than a discount", () => {
    const cost = estimateMonthlyCost(
      makeSpec(),
      makeModel({ inputPricePerMillion: -1 }),
    );
    expect(cost).toMatchObject({
      kind: "cannot-estimate",
      reason: "pricing-unavailable",
    });
  });

  it("never quotes a short-context rate for a long-context workload", () => {
    const spec = makeSpec({ maximumContextRequired: 500_000 });
    const model = makeModel({
      contextWindow: 1_050_000,
      pricingValidUpToContext: 272_000,
    });

    const cost = estimateMonthlyCost(spec, model);
    expect(cost).toMatchObject({
      kind: "cannot-estimate",
      reason: "context-exceeds-priced-tier",
    });
  });

  it("estimates when the workload sits inside the priced tier", () => {
    const spec = makeSpec({ maximumContextRequired: 200_000 });
    const model = makeModel({ pricingValidUpToContext: 272_000 });
    expect(estimateMonthlyCost(spec, model).kind).toBe("estimated");
  });

  it("counts one round trip of tokens toward the required context", () => {
    // 150k in + 130k out = 280k, above the 272k priced tier even though the
    // user's stated maximum is lower.
    const spec = makeSpec({
      averageInputTokens: 150_000,
      averageOutputTokens: 130_000,
      maximumContextRequired: 1_000,
    });
    const model = makeModel({
      contextWindow: 1_050_000,
      maxOutputTokens: 200_000,
      pricingValidUpToContext: 272_000,
    });
    expect(estimateMonthlyCost(spec, model)).toMatchObject({
      reason: "context-exceeds-priced-tier",
    });
  });

  it("reports a workload it cannot represent safely", () => {
    const spec = makeSpec({
      requestsPerDay: 100_000_000,
      averageInputTokens: 100_000_000,
      maximumContextRequired: 1_000,
    });
    const model = makeModel({ pricingValidUpToContext: null });
    expect(estimateMonthlyCost(spec, model)).toMatchObject({
      kind: "cannot-estimate",
      reason: "workload-out-of-range",
    });
  });
});
