import "server-only";

import {
  FilesystemSnapshotStore,
  isFilesystemSnapshotAvailable,
} from "@/lib/data/filesystem-snapshot-store";
import { missingSupabaseEnvVars } from "@/lib/data/supabase-admin";
import { SupabaseSnapshotStore } from "@/lib/data/supabase-snapshot-store";
import type { SnapshotStore } from "@/lib/data/snapshot-types";

/*
  Chooses where collector results are persisted.

  Supabase wherever it is configured; the filesystem only as a development
  convenience. Production without Supabase gets nothing at all rather than a
  store that silently loses data.
*/

export function resolveSnapshotStore(
  env: NodeJS.ProcessEnv = process.env,
): SnapshotStore | null {
  if (missingSupabaseEnvVars(env).length === 0) {
    return new SupabaseSnapshotStore(env);
  }
  if (isFilesystemSnapshotAvailable(env)) {
    return new FilesystemSnapshotStore(env);
  }
  return null;
}

export {
  FilesystemSnapshotStore,
  isFilesystemSnapshotAvailable,
  SnapshotStoreUnavailableError,
} from "@/lib/data/filesystem-snapshot-store";
export { SupabaseSnapshotStore } from "@/lib/data/supabase-snapshot-store";
export type { ProviderSnapshot, SnapshotStore, SnapshotStatus } from "@/lib/data/snapshot-types";
