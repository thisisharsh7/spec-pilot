import { describe, expect, it } from "vitest";

import {
  buildSpecSummary,
  summaryToJson,
  summaryToMarkdown,
} from "@/lib/domain/summary";
import { makeSpec } from "@/lib/test-support/factories";

describe("buildSpecSummary", () => {
  it("projects the monthly workload over 30 days", () => {
    const summary = buildSpecSummary(makeSpec({ requestsPerDay: 1_000 }));
    expect(summary.workload.monthlyRequests).toBe(30_000);
  });

  it("counts one round trip toward the effective context requirement", () => {
    const summary = buildSpecSummary(
      makeSpec({
        averageInputTokens: 30_000,
        averageOutputTokens: 5_000,
        maximumContextRequired: 8_000,
        minimumContextWindow: 0,
      }),
    );
    expect(summary.workload.effectiveContextRequired).toBe(35_000);
  });

  it("derives failure cases from the selected input and output types", () => {
    const summary = buildSpecSummary(
      makeSpec({ inputTypes: ["images"], outputTypes: ["json"] }),
    );
    const text = summary.expectedFailureCases.join(" ");
    expect(text).toContain("rotated");
    expect(text).toContain("malformed JSON");
  });

  it("derives acceptance tests that match the output contract", () => {
    const summary = buildSpecSummary(makeSpec({ outputTypes: ["classification"] }));
    expect(summary.acceptanceTests.join(" ")).toContain("per-class accuracy");
  });

  it("always labels the generated sections as rule-generated", () => {
    const summary = buildSpecSummary(makeSpec());
    expect(summary.generatedNote).toContain("fixed rules");
  });
});

describe("markdown export", () => {
  const summary = buildSpecSummary(
    makeSpec({
      goal: "Extract invoice fields.",
      inputTypes: ["text", "images"],
      outputTypes: ["json"],
      maxMonthlyBudgetUsd: 50,
      excludedProviders: ["anthropic"],
    }),
  );
  const markdown = summaryToMarkdown(summary);

  it("includes every required section", () => {
    for (const heading of [
      "## Goal",
      "## Example input",
      "## Expected output",
      "## Input types",
      "## Output types",
      "## Mandatory requirements",
      "## Preferred requirements",
      "## Workload assumptions",
      "## Budget",
      "## Expected failure cases",
      "## Recommended acceptance tests",
    ]) {
      expect(markdown).toContain(heading);
    }
  });

  it("carries the user's own answers through", () => {
    expect(markdown).toContain("Extract invoice fields.");
    expect(markdown).toContain("Maximum $50 per month");
    expect(markdown).toContain("Excluded providers: anthropic");
  });

  it("states plainly when no budget was set", () => {
    const noBudget = summaryToMarkdown(
      buildSpecSummary(makeSpec({ maxMonthlyBudgetUsd: null })),
    );
    expect(noBudget).toContain("No hard monthly ceiling set");
  });

  it("ends with a trailing newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
  });
});

describe("json export", () => {
  it("round-trips as valid JSON", () => {
    const summary = buildSpecSummary(makeSpec());
    const parsed = JSON.parse(summaryToJson(summary));
    expect(parsed.workload.monthlyRequests).toBe(summary.workload.monthlyRequests);
  });
});
