import { describe, expect, it } from "vitest";

import { defaultTaskSpec, parseTaskSpec } from "@/lib/domain/spec";
import { makeSpec } from "@/lib/test-support/factories";

describe("taskSpecSchema", () => {
  it("accepts a fully populated specification", () => {
    expect(parseTaskSpec(makeSpec()).success).toBe(true);
  });

  it("rejects an empty goal", () => {
    const result = parseTaskSpec(makeSpec({ goal: "" }));
    expect(result.success).toBe(false);
  });

  it("requires at least one input type", () => {
    expect(parseTaskSpec(makeSpec({ inputTypes: [] })).success).toBe(false);
  });

  it("requires at least one output type", () => {
    expect(parseTaskSpec(makeSpec({ outputTypes: [] })).success).toBe(false);
  });

  it("rejects a non-positive request volume", () => {
    expect(parseTaskSpec(makeSpec({ requestsPerDay: 0 })).success).toBe(false);
  });

  it("rejects fractional token counts", () => {
    expect(parseTaskSpec(makeSpec({ averageInputTokens: 10.5 })).success).toBe(false);
  });

  it("rejects a negative budget but allows no budget at all", () => {
    expect(parseTaskSpec(makeSpec({ maxMonthlyBudgetUsd: -1 })).success).toBe(false);
    expect(parseTaskSpec(makeSpec({ maxMonthlyBudgetUsd: null })).success).toBe(true);
  });

  it("rejects an unknown priority", () => {
    const result = parseTaskSpec({ ...makeSpec(), priority: "cheapest_ever" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown input types", () => {
    const result = parseTaskSpec({ ...makeSpec(), inputTypes: ["telepathy"] });
    expect(result.success).toBe(false);
  });

  it("ships defaults that are themselves incomplete until the user answers", () => {
    // The defaults exist to prefill the workload step, not to pass validation.
    expect(parseTaskSpec(defaultTaskSpec()).success).toBe(false);
  });
});
