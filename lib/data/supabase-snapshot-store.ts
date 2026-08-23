import "server-only";

import { getSupabaseAdmin } from "@/lib/data/supabase-admin";
import type {
  ProviderSnapshot,
  SnapshotStore,
} from "@/lib/data/snapshot-types";
import { normalizedModelsSchema, parseStoredModels } from "@/lib/domain/model-schema";

/*
  Supabase-backed snapshot store.

  Durability comes from the table being append-only (enforced by triggers in the
  migration, not just here): a write can only ever ADD a row. A failed or partial
  collection therefore cannot touch the healthy snapshot production is serving.
*/

export const MODEL_SNAPSHOTS_TABLE = "model_snapshots";

/**
 * Cap on a single Supabase query. Without it an unreachable or slow project
 * would hang a page render for as long as the platform allows, turning a data
 * problem into an outage.
 */
const QUERY_TIMEOUT_MS = 8_000;

function queryTimeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.SPECPILOT_SUPABASE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : QUERY_TIMEOUT_MS;
}

interface SnapshotRow {
  provider: string;
  collection_id: string | null;
  status: string;
  collected_at: string;
  records_received: number;
  records_valid: number;
  records_invalid: number;
  models: unknown;
}

/** Error text safe to return to a caller: no keys, no connection strings. */
function safeError(operation: string): Error {
  return new Error(`Supabase ${operation} failed.`);
}

export class SupabaseSnapshotStore implements SnapshotStore {
  readonly kind = "supabase" as const;

  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  async readLatestHealthy(provider: string): Promise<ProviderSnapshot | null> {
    const client = getSupabaseAdmin(this.env);

    const { data, error } = await client
      .from(MODEL_SNAPSHOTS_TABLE)
      .select(
        "provider, collection_id, status, collected_at, records_received, records_valid, records_invalid, models",
      )
      .eq("provider", provider)
      .eq("status", "healthy")
      .order("collected_at", { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(queryTimeoutMs(this.env)));

    if (error) throw safeError("read");
    const row = (data as SnapshotRow[] | null)?.[0];
    if (!row) return null;

    // Re-validate on the way out: a row may predate the current shape, or have
    // been seeded or edited by hand. A corrupt entry is dropped, never served.
    const { models } = parseStoredModels(row.models);

    return {
      provider: row.provider,
      collectedAt: row.collected_at,
      collectionId: row.collection_id,
      status: "healthy",
      recordsReceived: row.records_received,
      recordsValid: row.records_valid,
      recordsInvalid: row.records_invalid,
      models,
    };
  }

  async writeSnapshot(snapshot: ProviderSnapshot): Promise<void> {
    if (snapshot.status === "healthy" && snapshot.models.length === 0) {
      throw new Error(
        "Refusing to store an empty snapshot as healthy. The previous dataset remains in place.",
      );
    }

    // Validate before insert as well as on read, so a bad row never lands.
    const parsed = normalizedModelsSchema.safeParse(snapshot.models);
    if (!parsed.success) {
      throw new Error(
        `Refusing to store ${parsed.error.issues.length} invalid model record(s). The previous dataset remains in place.`,
      );
    }

    const client = getSupabaseAdmin(this.env);
    const { error } = await client.from(MODEL_SNAPSHOTS_TABLE).insert({
      provider: snapshot.provider,
      collection_id: snapshot.collectionId,
      status: snapshot.status,
      collected_at: snapshot.collectedAt,
      records_received: snapshot.recordsReceived,
      records_valid: snapshot.recordsValid,
      records_invalid: snapshot.recordsInvalid,
      models: parsed.data,
    });

    if (error) throw safeError("insert");
  }
}
