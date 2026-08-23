import type { NormalizedModel } from "@/lib/domain/model";

/*
  The one snapshot shape both stores speak: the local filesystem store used in
  development, and the Supabase table used in production.
*/

export type SnapshotStatus = "healthy" | "partial" | "failed";

export interface ProviderSnapshot {
  provider: string;
  /** When the collector run completed. */
  collectedAt: string;
  collectionId: string | null;
  status: SnapshotStatus;
  recordsReceived: number;
  recordsValid: number;
  recordsInvalid: number;
  models: NormalizedModel[];
}

/**
 * A durable place to put collector results.
 *
 * `writeSnapshot` is append-only in spirit for every implementation: it may only
 * ever ADD a healthy dataset. It must never be able to remove or overwrite the
 * healthy snapshot that production is currently serving.
 */
export interface SnapshotStore {
  readonly kind: "filesystem" | "supabase";
  /** Newest healthy snapshot for a provider, or null if there has never been one. */
  readLatestHealthy(provider: string): Promise<ProviderSnapshot | null>;
  /** Record a new snapshot. Implementations reject an empty healthy dataset. */
  writeSnapshot(snapshot: ProviderSnapshot): Promise<void>;
}
