import { describe, expect, it } from "vitest";

import { FIXTURE_VERIFIED_AT, OPENAI_FIXTURE_MODELS } from "@/lib/data/fixtures/openai";

const APPROVED_HOSTS = new Set([
  "openai.com",
  "platform.openai.com",
  "developers.openai.com",
  "anthropic.com",
  "docs.anthropic.com",
  "platform.claude.com",
  "docs.claude.com",
]);

const CAPABILITY_KEYS = [
  "supportsText",
  "supportsImages",
  "supportsAudio",
  "supportsFiles",
  "supportsTools",
  "supportsStructuredOutput",
] as const;

describe("OpenAI fixtures honour the data-honesty contract", () => {
  it("cites an approved official domain for every record", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      expect(APPROVED_HOSTS.has(new URL(model.sourceUrl).host)).toBe(true);
      expect(APPROVED_HOSTS.has(new URL(model.scrapeUrl).host)).toBe(true);
    }
  });

  it("records both a scrape target and a human evidence link", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      expect(model.scrapeUrl).toBeTruthy();
      expect(model.sourceUrl).toBeTruthy();
      // The live collector reads the rendered page, so neither is the .md variant.
      expect(model.sourceUrl.endsWith(".md")).toBe(false);
    }
  });

  it("derives tier fields only where a pricing note exists", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      if (model.pricingNote === null) {
        expect(model.longContextInputMultiplier).toBeNull();
        expect(model.longContextOutputMultiplier).toBeNull();
      } else {
        expect(model.pricingNote.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps promotional prose as a warning, never as a capability", () => {
    const sol = OPENAI_FIXTURE_MODELS.find(
      (model) => model.modelIdentifier === "gpt-5.6-sol",
    )!;
    expect(sol.pricingWarnings.join(" ")).toContain("promotional pricing");
    // Promotional wording must not have moved the quoted Standard rate.
    expect(sol.inputPricePerMillion).toBe(4);
    expect(sol.outputPricePerMillion).toBe(20);
  });

  it("uses only true, false or null for capabilities", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      for (const key of CAPABILITY_KEYS) {
        expect([true, false, null]).toContain(model[key]);
      }
    }
  });

  it("never carries a negative price", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      for (const price of [
        model.inputPricePerMillion,
        model.cachedInputPricePerMillion,
        model.outputPricePerMillion,
      ]) {
        if (price !== null) expect(price).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("states a currency wherever it states a price", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      if (model.inputPricePerMillion !== null) {
        expect(model.currency).toBeTruthy();
      }
    }
  });

  it("quotes standard pricing only", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      expect(model.pricingMode).toBe("standard");
    }
  });

  it("never lets the priced tier exceed the context window", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      if (model.pricingValidUpToContext !== null && model.contextWindow !== null) {
        expect(model.pricingValidUpToContext).toBeLessThanOrEqual(model.contextWindow);
      }
    }
  });

  it("shares one fixed verification timestamp", () => {
    for (const model of OPENAI_FIXTURE_MODELS) {
      expect(model.verifiedAt).toBe(FIXTURE_VERIFIED_AT);
    }
  });

  it("uses unique model identifiers", () => {
    const ids = OPENAI_FIXTURE_MODELS.map((model) => model.modelIdentifier);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes at least one model with a documented capability denial", () => {
    expect(
      OPENAI_FIXTURE_MODELS.some((model) => model.supportsImages === false),
    ).toBe(true);
  });

  it("includes at least one genuinely unverifiable capability", () => {
    expect(OPENAI_FIXTURE_MODELS.some((model) => model.supportsFiles === null)).toBe(
      true,
    );
  });

  it("includes at least one fully verifiable model for the primary path", () => {
    expect(
      OPENAI_FIXTURE_MODELS.some(
        (model) =>
          model.supportsImages === true &&
          model.supportsTools === true &&
          model.supportsStructuredOutput === true &&
          model.supportsFiles === true,
      ),
    ).toBe(true);
  });
});
