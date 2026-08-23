import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SnapshotModelRepository,
  hasUsableSnapshot,
} from "@/lib/data/snapshot-repository";
import type { ProviderSnapshot, SnapshotStore } from "@/lib/data/snapshot-types";
import { parseStoredModels } from "@/lib/domain/model-schema";
import { getDataMode, getModelRepository, DataSourceError } from "@/lib/data/repository";
import { makeModel } from "@/lib/test-support/factories";

const EMPTY_SNAPSHOTS = mkdtempSync(path.join(tmpdir(), "specpilot-none-"));
const REAL_SNAPSHOTS = path.join(process.cwd(), ".data", "snapshots");

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    SPECPILOT_SNAPSHOT_DIR: EMPTY_SNAPSHOTS,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function snapshot(over: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
  return {
    provider: "openai",
    collectedAt: "2026-08-23T06:00:00.000Z",
    collectionId: "j_test",
    status: "healthy",
    recordsReceived: 1,
    recordsValid: 1,
    recordsInvalid: 0,
    models: [makeModel({ provider: "openai" })],
    ...over,
  };
}

/** In-memory store that behaves like the append-only Supabase table. */
class FakeStore implements SnapshotStore {
  readonly kind = "supabase" as const;
  readonly rows: ProviderSnapshot[] = [];

  constructor(seed: ProviderSnapshot[] = []) {
    this.rows.push(...seed);
  }

  async readLatestHealthy(provider: string): Promise<ProviderSnapshot | null> {
    const healthy = this.rows
      .filter((r) => r.provider === provider && r.status === "healthy")
      .sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt));
    return healthy[0] ?? null;
  }

  async writeSnapshot(row: ProviderSnapshot): Promise<void> {
    if (row.status === "healthy" && row.models.length === 0) {
      throw new Error("Refusing to store an empty snapshot as healthy.");
    }
    this.rows.push(row); // Append only. Never mutates or removes.
  }
}

describe("latest healthy snapshot selection", () => {
  it("serves the newest healthy snapshot", async () => {
    const store = new FakeStore([
      snapshot({
        collectedAt: "2026-08-01T00:00:00.000Z",
        models: [makeModel({ provider: "openai", modelIdentifier: "old-model" })],
      }),
      snapshot({
        collectedAt: "2026-08-20T00:00:00.000Z",
        models: [makeModel({ provider: "openai", modelIdentifier: "new-model" })],
      }),
    ]);

    const repo = new SnapshotModelRepository(env(), Date.now, store);
    const models = await repo.listModels();
    expect(models.map((m) => m.modelIdentifier)).toEqual(["new-model"]);
  });

  it("ignores a newer partial snapshot in favour of the last healthy one", async () => {
    const store = new FakeStore([
      snapshot({
        collectedAt: "2026-08-01T00:00:00.000Z",
        models: [makeModel({ provider: "openai", modelIdentifier: "good" })],
      }),
      snapshot({
        status: "partial",
        collectedAt: "2026-08-22T00:00:00.000Z",
        models: [makeModel({ provider: "openai", modelIdentifier: "half-collected" })],
      }),
    ]);

    const repo = new SnapshotModelRepository(env(), Date.now, store);
    const models = await repo.listModels();
    expect(models.map((m) => m.modelIdentifier)).toEqual(["good"]);
  });

  it("reports no data rather than inventing any when nothing is healthy", async () => {
    const store = new FakeStore([snapshot({ status: "failed", models: [] })]);
    const repo = new SnapshotModelRepository(env(), Date.now, store);
    expect(await repo.listModels()).toEqual([]);

    const health = await repo.getProviderHealth();
    expect(health.find((h) => h.provider === "openai")!.state).toBe("not_configured");
  });

  it("labels a snapshot older than the freshness window as stale", async () => {
    const store = new FakeStore([snapshot({ collectedAt: "2026-01-01T00:00:00.000Z" })]);
    const repo = new SnapshotModelRepository(
      env(),
      () => Date.parse("2026-08-23T00:00:00.000Z"),
      store,
    );
    const health = await repo.getProviderHealth();
    expect(health.find((h) => h.provider === "openai")!.state).toBe("stale");
  });
});

describe("malformed JSONB rejection", () => {
  it("drops a corrupt model row rather than serving it", () => {
    const good = makeModel({ modelIdentifier: "good" });
    const { models, rejected } = parseStoredModels([
      good,
      { ...good, modelIdentifier: "bad-price", inputPricePerMillion: -5 },
    ]);

    expect(models.map((m) => m.modelIdentifier)).toEqual(["good"]);
    expect(rejected[0].modelIdentifier).toBe("bad-price");
    expect(rejected[0].issues.join(" ")).toContain("negative");
  });

  it("rejects a source URL outside the approved provider domains", () => {
    const { models, rejected } = parseStoredModels([
      makeModel({ sourceUrl: "https://evil.example.com/pricing" }),
    ]);
    expect(models).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("rejects a capability that is not true, false or null", () => {
    const { models } = parseStoredModels([
      { ...makeModel(), supportsTools: "yes" as unknown as boolean },
    ]);
    expect(models).toHaveLength(0);
  });

  it("treats a non-array models value as unusable", () => {
    expect(parseStoredModels({ nope: true }).models).toEqual([]);
    expect(parseStoredModels(null).models).toEqual([]);
  });
});

describe("failed refresh preserves the previous snapshot", () => {
  it("keeps serving the previous healthy dataset after a rejected write", async () => {
    const store = new FakeStore([snapshot()]);
    const before = await store.readLatestHealthy("openai");

    await expect(
      store.writeSnapshot(snapshot({ status: "healthy", models: [] })),
    ).rejects.toThrow(/empty snapshot/i);

    const after = await store.readLatestHealthy("openai");
    expect(after).toEqual(before);
    expect(after!.models).toHaveLength(1);
  });

  it("never removes a row, so a later partial cannot erase a healthy one", async () => {
    const store = new FakeStore([snapshot()]);
    await store.writeSnapshot(snapshot({ status: "partial", collectedAt: "2026-08-24T00:00:00.000Z" }));

    expect(store.rows).toHaveLength(2);
    const latest = await store.readLatestHealthy("openai");
    expect(latest!.status).toBe("healthy");
  });
});

describe("production never falls back to development data", () => {
  const prod = (o: Record<string, string | undefined> = {}) =>
    ({ NODE_ENV: "production", ...o }) as NodeJS.ProcessEnv;

  it("refuses filesystem snapshots in production even when one exists", async () => {
    const mode = await getDataMode(prod({ SPECPILOT_SNAPSHOT_DIR: REAL_SNAPSHOTS }));
    expect(mode).toBe("unconfigured");
  });

  it("refuses fixtures in production on the flag alone", async () => {
    const mode = await getDataMode(prod({ ENABLE_DEVELOPMENT_FIXTURES: "true" }));
    expect(mode).toBe("unconfigured");
  });

  it("throws in production rather than serving anything", async () => {
    await expect(
      getModelRepository(prod({ ENABLE_DEVELOPMENT_FIXTURES: "true" })),
    ).rejects.toBeInstanceOf(DataSourceError);
  });

  it("does not report data available when the store is unreachable", async () => {
    // Exercises the real code path without touching the network: a store whose
    // read throws must never be reported as having usable data.
    const unreachable: SnapshotStore = {
      kind: "supabase",
      async readLatestHealthy() {
        throw new Error("connection refused");
      },
      async writeSnapshot() {
        throw new Error("connection refused");
      },
    };

    expect(await hasUsableSnapshot(env(), unreachable)).toBe(false);
  });

  it("reports data available when the store returns a healthy snapshot", async () => {
    expect(await hasUsableSnapshot(env(), new FakeStore([snapshot()]))).toBe(true);
  });
});
