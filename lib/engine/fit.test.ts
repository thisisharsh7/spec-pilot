import { describe, expect, it } from "vitest";

import { evaluateModel } from "@/lib/engine/filter";
import { computeRequirementFit } from "@/lib/engine/fit";
import { makeModel, makeSpec } from "@/lib/test-support/factories";

describe("computeRequirementFit", () => {
  it("counts an assumed criterion separately from a verified one", () => {
    const spec = makeSpec({ maximumContextRequired: 500_000 });
    const model = makeModel({
      contextWindow: 1_000_000,
      pricingValidUpToContext: null,
    });

    const fit = computeRequirementFit(evaluateModel(spec, model), spec);

    expect(fit.assumedCount).toBe(1);
    expect(fit.criteria.some((c) => c.state === "assumed")).toBe(true);
  });

  it("reports no assumptions when every ceiling is documented", () => {
    const spec = makeSpec({ maximumContextRequired: 100_000 });
    const model = makeModel({ pricingValidUpToContext: 272_000 });

    const fit = computeRequirementFit(evaluateModel(spec, model), spec);
    expect(fit.assumedCount).toBe(0);
  });

  it("awards weight for an assumption but keeps it visible", () => {
    const spec = makeSpec({ maximumContextRequired: 500_000 });
    const assumed = computeRequirementFit(
      evaluateModel(spec, makeModel({ contextWindow: 1_000_000, pricingValidUpToContext: null })),
      spec,
    );
    // The requirement is satisfied for practical purposes, so it scores...
    expect(assumed.score).toBeGreaterThan(0);
    // ...but the assumption is never hidden behind the headline number.
    expect(assumed.assumedCount).toBeGreaterThan(0);
  });

  it("gives an unverified mandatory requirement no credit", () => {
    const spec = makeSpec({ inputTypes: ["text", "files"] });
    const model = makeModel({ supportsFiles: null });

    const fit = computeRequirementFit(evaluateModel(spec, model), spec);
    const files = fit.criteria.find((c) => c.id === "capability:supportsFiles")!;
    expect(files.state).toBe("unverified");
    expect(fit.score).toBeLessThan(100);
  });

  it("never exceeds 100", () => {
    const spec = makeSpec();
    const fit = computeRequirementFit(evaluateModel(spec, makeModel()), spec);
    expect(fit.score).toBeLessThanOrEqual(100);
  });
});
