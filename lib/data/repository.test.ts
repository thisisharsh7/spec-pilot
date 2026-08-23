import { describe, expect, it } from "vitest";

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { FixtureModelRepository } from "@/lib/data/fixture-repository";
import { SnapshotModelRepository } from "@/lib/data/snapshot-repository";
import {
  DataSourceError,
  getDataMode,
  getModelRepository,
} from "@/lib/data/repository";

/** An empty snapshot directory, so "no real data yet" can be tested. */
const EMPTY_SNAPSHOTS = mkdtempSync(path.join(tmpdir(), "specpilot-empty-"));
/** The repo's real snapshot directory, holding genuine collector output. */
const REAL_SNAPSHOTS = path.join(process.cwd(), ".data", "snapshots");

/** Next augments ProcessEnv so NODE_ENV is required; default it, let tests override. */
function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    SPECPILOT_SNAPSHOT_DIR: EMPTY_SNAPSHOTS,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("getDataMode", () => {
  it("never downgrades to fixtures once Supabase is configured", async () => {
    // Supabase configured means Supabase serves, or nothing does. An unreachable
    // or empty project must surface as unconfigured, never as fake data — even
    // with the fixture flag set.
    const mode = await getDataMode(
      env({
        NEXT_PUBLIC_SUPABASE_URL: "https://unreachable.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "placeholder",
        SPECPILOT_SUPABASE_TIMEOUT_MS: "150",
        ENABLE_DEVELOPMENT_FIXTURES: "true",
      }),
    );
    expect(mode).not.toBe("fixtures");
    expect(mode).toBe("unconfigured");
  });

  it("uses fixtures in development when explicitly enabled", async () => {
    expect(await getDataMode(env({ ENABLE_DEVELOPMENT_FIXTURES: "true" }))).toBe(
      "fixtures",
    );
  });

  it("does not enable fixtures without the flag", async () => {
    expect(await getDataMode(env())).toBe("unconfigured");
  });

  it("refuses fixtures in production on the flag alone", async () => {
    const mode = await getDataMode(
      env({ NODE_ENV: "production", ENABLE_DEVELOPMENT_FIXTURES: "true" }),
    );
    expect(mode).toBe("unconfigured");
  });

  it("allows fixtures in production only with the second explicit opt-in", async () => {
    const mode = await getDataMode(
      env({
        NODE_ENV: "production",
        ENABLE_DEVELOPMENT_FIXTURES: "true",
        ALLOW_FIXTURES_IN_PRODUCTION: "true",
      }),
    );
    expect(mode).toBe("fixtures");
  });

  it("treats any value other than the string 'true' as off", async () => {
    expect(await getDataMode(env({ ENABLE_DEVELOPMENT_FIXTURES: "1" }))).toBe(
      "unconfigured",
    );
  });
});

describe("real data takes precedence over development data", () => {
  it("chooses the stored collector snapshot over fixtures", async () => {
    const mode = await getDataMode(
      env({
        SPECPILOT_SNAPSHOT_DIR: REAL_SNAPSHOTS,
        ENABLE_DEVELOPMENT_FIXTURES: "true",
      }),
    );
    expect(mode).toBe("snapshot");
  });

  it("returns the snapshot repository for that mode", async () => {
    const repository = await getModelRepository(
      env({
        SPECPILOT_SNAPSHOT_DIR: REAL_SNAPSHOTS,
        ENABLE_DEVELOPMENT_FIXTURES: "true",
      }),
    );
    expect(repository).toBeInstanceOf(SnapshotModelRepository);

    const models = await repository.listModels();
    expect(models.length).toBeGreaterThan(0);
    // Real collector output, not the hand-transcribed fixture timestamp.
    expect(models.every((m) => m.verifiedAt !== "2026-08-23T00:00:00.000Z")).toBe(true);
  });

  it("falls back to fixtures when no snapshot has been collected", async () => {
    const mode = await getDataMode(env({ ENABLE_DEVELOPMENT_FIXTURES: "true" }));
    expect(mode).toBe("fixtures");
  });

  it("never uses a filesystem snapshot in production", async () => {
    const mode = await getDataMode(
      env({ NODE_ENV: "production", SPECPILOT_SNAPSHOT_DIR: REAL_SNAPSHOTS }),
    );
    expect(mode).toBe("unconfigured");
  });

  it("reports OpenAI health from the real snapshot", async () => {
    const repository = new SnapshotModelRepository(
      env({
        SPECPILOT_SNAPSHOT_DIR: REAL_SNAPSHOTS,
        BRIGHT_DATA_OPENAI_COLLECTOR_ID: "c_example",
      }),
    );
    const health = await repository.getProviderHealth();
    const openai = health.find((entry) => entry.provider === "openai")!;

    expect(openai.state).toBe("healthy");
    expect(openai.recordsValid).toBe(5);
    expect(openai.recordsReceived).toBe(5);
    expect(openai.lastSuccessfulRefreshAt).toBeTruthy();
    expect(openai.freshness).toBe("fresh");
    expect(JSON.stringify(openai)).not.toContain("c_example");
  });

  it("still reports Anthropic as not configured", async () => {
    const repository = new SnapshotModelRepository(
      env({ SPECPILOT_SNAPSHOT_DIR: REAL_SNAPSHOTS }),
    );
    const health = await repository.getProviderHealth();
    const anthropic = health.find((entry) => entry.provider === "anthropic")!;

    expect(anthropic.state).toBe("not_configured");
    expect(anthropic.recordsValid).toBeNull();
  });
});

describe("getModelRepository", () => {
  it("returns the fixture repository in development", async () => {
    const repository = await getModelRepository(
      env({ ENABLE_DEVELOPMENT_FIXTURES: "true" }),
    );
    expect(repository).toBeInstanceOf(FixtureModelRepository);
    expect((await repository.listModels()).length).toBeGreaterThan(0);
  });

  it("fails loudly in production without Supabase rather than serving fixtures", async () => {
    await expect(
      getModelRepository(
        env({ NODE_ENV: "production", ENABLE_DEVELOPMENT_FIXTURES: "true" }),
      ),
    ).rejects.toBeInstanceOf(DataSourceError);
  });

  it("names the missing environment variables without revealing values", async () => {
    let error: DataSourceError | undefined;
    try {
      await getModelRepository(env({ NODE_ENV: "production" }));
    } catch (caught) {
      error = caught as DataSourceError;
    }

    expect(error).toBeInstanceOf(DataSourceError);
    expect(error!.missingEnvVars).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(error!.message).not.toContain("anon");
  });
});

describe("FixtureModelRepository", () => {
  it("never claims a collector has run", async () => {
    const health = await new FixtureModelRepository(env()).getProviderHealth();
    expect(health.length).toBeGreaterThan(0);

    for (const provider of health) {
      expect(provider.lastSuccessfulRefreshAt).toBeNull();
      expect(provider.freshness).toBe("fixture");
      expect(provider.state).toBe("not_configured");
    }
  });

  it("reports collector configuration by env var name only", async () => {
    const health = await new FixtureModelRepository(
      env({ BRIGHT_DATA_OPENAI_COLLECTOR_ID: "c_secret_value" }),
    ).getProviderHealth();

    const openai = health.find((entry) => entry.provider === "openai")!;
    expect(openai.collectorConfigured).toBe(true);
    expect(openai.collectorEnvKey).toBe("BRIGHT_DATA_OPENAI_COLLECTOR_ID");
    expect(JSON.stringify(openai)).not.toContain("c_secret_value");
  });

  it("uses a fixed fixture timestamp, never the current time", async () => {
    const models = await new FixtureModelRepository(env()).listModels();
    const stamps = new Set(models.map((model) => model.verifiedAt));
    expect(stamps.size).toBe(1);
    expect([...stamps][0]).toBe("2026-08-23T00:00:00.000Z");
  });
});
