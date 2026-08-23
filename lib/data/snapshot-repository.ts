import "server-only";

import type { ModelRepository } from "@/lib/data/repository";
import { resolveSnapshotStore } from "@/lib/data/snapshot-store";
import type { ProviderSnapshot, SnapshotStore } from "@/lib/data/snapshot-types";
import { PROVIDERS } from "@/lib/domain/providers";
import type {
  Freshness,
  HealthState,
  NormalizedModel,
  ProviderHealth,
} from "@/lib/domain/model";

/*
  Serves real Bright Data collector output from whichever snapshot store is
  configured — Supabase in production, the local filesystem in development.

  Reports genuine provenance: collection id, records received versus validated,
  and when the run happened. A snapshot older than the freshness window is
  labelled stale rather than quietly presented as current.
*/

/** Beyond this, a snapshot is reported as stale. */
export const FRESHNESS_WINDOW_DAYS = 7;

function freshnessOf(collectedAt: string, now: number): Freshness {
  const collected = Date.parse(collectedAt);
  if (Number.isNaN(collected)) return "unknown";
  const ageDays = (now - collected) / 86_400_000;
  return ageDays <= FRESHNESS_WINDOW_DAYS ? "fresh" : "stale";
}

function stateOf(snapshot: ProviderSnapshot, freshness: Freshness): HealthState {
  if (snapshot.models.length === 0) return "failed";
  if (freshness === "stale") return "stale";
  if (snapshot.recordsInvalid > 0) return "partial";
  if (
    snapshot.recordsReceived > 0 &&
    snapshot.recordsValid < snapshot.recordsReceived
  ) {
    return "partial";
  }
  return "healthy";
}

export class SnapshotModelRepository implements ModelRepository {
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => number;
  private readonly store: SnapshotStore;

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    now: () => number = Date.now,
    store?: SnapshotStore,
  ) {
    this.env = env;
    this.now = now;
    const resolved = store ?? resolveSnapshotStore(env);
    if (!resolved) {
      throw new Error("No snapshot store is available in this environment.");
    }
    this.store = resolved;
  }

  async listModels(): Promise<NormalizedModel[]> {
    const models: NormalizedModel[] = [];
    for (const provider of PROVIDERS) {
      const snapshot = await this.store.readLatestHealthy(provider.slug);
      if (snapshot) models.push(...snapshot.models);
    }
    return models;
  }

  async getProviderHealth(): Promise<ProviderHealth[]> {
    const now = this.now();

    return Promise.all(
      PROVIDERS.map(async (provider) => {
        const snapshot = await this.store.readLatestHealthy(provider.slug);
        const collectorConfigured = Boolean(this.env[provider.collectorEnvKey]);

        if (!snapshot) {
          return {
            provider: provider.slug,
            displayName: provider.displayName,
            sourceUrl: provider.sourceUrl,
            collectorConfigured,
            collectorEnvKey: provider.collectorEnvKey,
            lastSuccessfulRefreshAt: null,
            recordsReceived: null,
            recordsValid: null,
            state: "not_configured" as HealthState,
            lastErrorMessage: null,
            freshness: "unknown" as Freshness,
          } satisfies ProviderHealth;
        }

        const freshness = freshnessOf(snapshot.collectedAt, now);

        return {
          provider: provider.slug,
          displayName: provider.displayName,
          sourceUrl: provider.sourceUrl,
          collectorConfigured,
          collectorEnvKey: provider.collectorEnvKey,
          lastSuccessfulRefreshAt: snapshot.collectedAt,
          recordsReceived: snapshot.recordsReceived,
          recordsValid: snapshot.recordsValid,
          state: stateOf(snapshot, freshness),
          lastErrorMessage: null,
          freshness,
        } satisfies ProviderHealth;
      }),
    );
  }
}

/** Supabase-backed repository. Same class; the store resolver picks Supabase. */
export const SupabaseModelRepository = SnapshotModelRepository;

/** A snapshot only counts as usable when it actually holds models. */
export async function hasUsableSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  injectedStore?: SnapshotStore | null,
): Promise<boolean> {
  const store = injectedStore ?? resolveSnapshotStore(env);
  if (!store) return false;

  for (const provider of PROVIDERS) {
    try {
      const snapshot = await store.readLatestHealthy(provider.slug);
      if (snapshot && snapshot.models.length > 0) return true;
    } catch {
      // An unreachable store is not a usable snapshot.
      return false;
    }
  }
  return false;
}
