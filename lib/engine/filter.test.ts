import { describe, expect, it } from "vitest";

import { UNTIERED_PRICING_ASSUMPTION, evaluateModel } from "@/lib/engine/filter";
import { makeModel, makeSpec } from "@/lib/test-support/factories";

function checkFor(spec = makeSpec(), model = makeModel()) {
  return (id: string) => {
    const evaluation = evaluateModel(spec, model);
    const check = evaluation.checks.find((c) => c.requirementId === id);
    if (!check) throw new Error(`no check with id ${id}`);
    return check;
  };
}

describe("mandatory capability filtering", () => {
  it("rejects a model whose documentation denies a required capability", () => {
    const spec = makeSpec({ inputTypes: ["text", "images"] });
    const model = makeModel({ supportsImages: false });

    const evaluation = evaluateModel(spec, model);
    expect(evaluation.verdict).toBe("rejected");
    expect(evaluation.failureReasons.join(" ")).toContain("image input is not supported");
  });

  it("marks a model unverifiable when a required capability is unknown", () => {
    const spec = makeSpec({ inputTypes: ["text", "files"] });
    const model = makeModel({ supportsFiles: null });

    const evaluation = evaluateModel(spec, model);
    expect(evaluation.verdict).toBe("unverifiable");
    expect(evaluation.failureReasons).toHaveLength(0);
    expect(evaluation.unknowns.join(" ")).toContain("does not state");
  });

  it("does not treat unknown as unsupported", () => {
    const spec = makeSpec({ inputTypes: ["text", "files"] });
    const unknown = evaluateModel(spec, makeModel({ supportsFiles: null }));
    const denied = evaluateModel(spec, makeModel({ supportsFiles: false }));

    expect(unknown.verdict).toBe("unverifiable");
    expect(denied.verdict).toBe("rejected");
  });

  it("requires tool calling when tool calls are a selected output", () => {
    const spec = makeSpec({ outputTypes: ["tool_calls"] });
    expect(evaluateModel(spec, makeModel({ supportsTools: false })).verdict).toBe(
      "rejected",
    );
  });

  it("requires structured output when strict JSON is a selected output", () => {
    const spec = makeSpec({ outputTypes: ["json"] });
    expect(
      evaluateModel(spec, makeModel({ supportsStructuredOutput: false })).verdict,
    ).toBe("rejected");
  });

  it("honours the explicit step-5 toggles even when inputs do not imply them", () => {
    const spec = makeSpec({
      inputTypes: ["text"],
      outputTypes: ["free_text"],
      requireImageInput: true,
    });
    expect(evaluateModel(spec, makeModel({ supportsImages: false })).verdict).toBe(
      "rejected",
    );
  });
});

describe("numeric filtering", () => {
  it("rejects a context window smaller than the workload needs", () => {
    const spec = makeSpec({ maximumContextRequired: 32_000 });
    const model = makeModel({ contextWindow: 16_385, pricingValidUpToContext: 16_385 });

    const evaluation = evaluateModel(spec, model);
    expect(evaluation.verdict).toBe("rejected");
    expect(evaluation.failureReasons.join(" ")).toContain("smaller than");
  });

  it("rejects a model that cannot emit the expected output length", () => {
    const spec = makeSpec({ averageOutputTokens: 8_000 });
    const check = checkFor(spec, makeModel({ maxOutputTokens: 4_096 }))(
      "max_output_tokens",
    );
    expect(check.state).toBe("fail");
  });

  it("rejects a model whose estimated cost exceeds a hard budget", () => {
    const spec = makeSpec({
      requestsPerDay: 1_000,
      averageInputTokens: 1_000,
      averageOutputTokens: 500,
      maximumContextRequired: 4_000,
      maxMonthlyBudgetUsd: 50,
    });
    // 30M in @ $2 + 15M out @ $10 = $210
    const model = makeModel({ inputPricePerMillion: 2, outputPricePerMillion: 10 });

    const evaluation = evaluateModel(spec, model);
    expect(evaluation.verdict).toBe("rejected");
    expect(evaluation.failureReasons.join(" ")).toContain("exceeds the $50 ceiling");
  });

  it("accepts a cost exactly equal to the budget", () => {
    const spec = makeSpec({
      requestsPerDay: 1_000,
      averageInputTokens: 1_000,
      averageOutputTokens: 500,
      maximumContextRequired: 4_000,
      maxMonthlyBudgetUsd: 210,
    });
    const model = makeModel({ inputPricePerMillion: 2, outputPricePerMillion: 10 });
    expect(evaluateModel(spec, model).verdict).toBe("compatible");
  });
});

describe("provider exclusion", () => {
  it("rejects an excluded provider case-insensitively", () => {
    const spec = makeSpec({ excludedProviders: ["TestProvider"] });
    const evaluation = evaluateModel(spec, makeModel({ provider: "testprovider" }));

    expect(evaluation.verdict).toBe("rejected");
    expect(evaluation.failureReasons.join(" ")).toContain("You excluded");
  });

  it("leaves other providers alone", () => {
    const spec = makeSpec({ excludedProviders: ["anthropic"] });
    expect(evaluateModel(spec, makeModel({ provider: "openai" })).verdict).toBe(
      "compatible",
    );
  });
});

describe("pricing checks", () => {
  it("flags a missing price as a pricing failure, not a capability failure", () => {
    const evaluation = evaluateModel(
      makeSpec(),
      makeModel({ outputPricePerMillion: null }),
    );
    expect(evaluation.verdict).toBe("rejected");
    expect(evaluation.costEstimateFailed).toBe(true);
  });

  it("flags a context-tier overrun as a pricing failure", () => {
    const spec = makeSpec({ maximumContextRequired: 500_000 });
    const model = makeModel({
      contextWindow: 1_050_000,
      pricingValidUpToContext: 272_000,
    });
    const evaluation = evaluateModel(spec, model);

    expect(evaluation.verdict).toBe("rejected");
    expect(evaluation.costEstimateFailed).toBe(true);
  });

  it("does not call it a pricing failure when a capability also failed", () => {
    const spec = makeSpec({ inputTypes: ["text", "images"] });
    const model = makeModel({
      supportsImages: false,
      outputPricePerMillion: null,
    });
    expect(evaluateModel(spec, model).costEstimateFailed).toBe(false);
  });
});

describe("pricing tier when the page documents none", () => {
  it("records an explicit assumption rather than a verified pass", () => {
    const spec = makeSpec({ maximumContextRequired: 500_000 });
    const model = makeModel({
      contextWindow: 1_000_000,
      pricingValidUpToContext: null,
      pricingNote: null,
    });

    const evaluation = evaluateModel(spec, model);
    const check = evaluation.checks.find(
      (c) => c.requirementId === "pricing_tier_covers_context",
    )!;

    // Not "pass": the requirement is met on an assumption, not on evidence.
    expect(check.state).toBe("assumed");
    expect(check.detail).toBe(UNTIERED_PRICING_ASSUMPTION);
    expect(evaluation.assumptions).toContain(UNTIERED_PRICING_ASSUMPTION);
    expect(evaluation.unknowns).not.toContain(UNTIERED_PRICING_ASSUMPTION);
  });

  it("uses the agreed wording and never claims the tier was verified", () => {
    expect(UNTIERED_PRICING_ASSUMPTION).toBe(
      "No context-based pricing tier is stated on this model page. This estimate assumes the listed Standard rate applies at the selected context size.",
    );
    expect(UNTIERED_PRICING_ASSUMPTION).not.toMatch(/documents no context-based price tier/);
  });

  it("does not block the model as unverifiable", () => {
    const spec = makeSpec({ maximumContextRequired: 500_000 });
    const model = makeModel({
      contextWindow: 1_000_000,
      // No tier sentence on the page.
      pricingValidUpToContext: null,
      pricingNote: null,
    });

    const evaluation = evaluateModel(spec, model);
    expect(evaluation.verdict).toBe("compatible");

    expect(evaluation.assumptions).toHaveLength(1);
  });

  it("still fails when a documented ceiling is exceeded", () => {
    const spec = makeSpec({ maximumContextRequired: 500_000 });
    const model = makeModel({
      contextWindow: 1_000_000,
      pricingValidUpToContext: 272_000,
    });

    const evaluation = evaluateModel(spec, model);
    expect(evaluation.verdict).toBe("rejected");
    expect(evaluation.costEstimateFailed).toBe(true);
  });

  it("does not let an absent tier rule mask a real capability failure", () => {
    const spec = makeSpec({ inputTypes: ["text", "images"] });
    const model = makeModel({
      supportsImages: false,
      pricingValidUpToContext: null,
    });
    expect(evaluateModel(spec, model).verdict).toBe("rejected");
  });
});
