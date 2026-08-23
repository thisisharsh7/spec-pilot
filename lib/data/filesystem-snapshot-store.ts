import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProviderSnapshot, SnapshotStore } from "@/lib/data/snapshot-types";
import { parseStoredModels } from "@/lib/domain/model-schema";

/*
  Development-only snapshot store.

  Deliberately never used in production: serverless filesystems are ephemeral and
  per-instance, so a deployed app writing here would diverge between instances and
  lose everything on redeploy. Rather than degrade quietly, every entry point
  throws when NODE_ENV is production.

  Writes are atomic — payload to a uniquely named temp file in the same directory,
  then rename over the target — so an interrupted write leaves the previous valid
  snapshot intact instead of a truncated file.
*/

export class SnapshotStoreUnavailableError extends Error {
  constructor() {
    super(
      "Filesystem snapshots are development-only. Configure Supabase for any deployed environment.",
    );
    this.name = "SnapshotStoreUnavailableError";
  }
}

export function isFilesystemSnapshotAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== "production";
}

export class FilesystemSnapshotStore implements SnapshotStore {
  readonly kind = "filesystem" as const;

  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  private assertAvailable(): void {
    if (!isFilesystemSnapshotAvailable(this.env)) {
      throw new SnapshotStoreUnavailableError();
    }
  }

  /** Overridable so tests can exercise present and absent snapshots. */
  private directory(): string {
    return (
      this.env.SPECPILOT_SNAPSHOT_DIR ??
      path.join(process.cwd(), ".data", "snapshots")
    );
  }

  private pathFor(provider: string): string {
    // Guard against a provider slug escaping the directory.
    const safe = provider.replace(/[^a-z0-9-]/gi, "");
    if (!safe) throw new Error("Invalid provider slug.");
    return path.join(this.directory(), `${safe}.json`);
  }

  async readLatestHealthy(provider: string): Promise<ProviderSnapshot | null> {
    this.assertAvailable();

    let raw: string;
    try {
      raw = await readFile(this.pathFor(provider), "utf8");
    } catch {
      return null; // Missing or unreadable simply means "nothing collected yet".
    }

    try {
      const parsed = JSON.parse(raw) as ProviderSnapshot;
      if (parsed.status && parsed.status !== "healthy") return null;

      // Re-validate on read for the same reason Supabase does.
      const { models } = parseStoredModels(parsed.models);
      return { ...parsed, status: "healthy", models };
    } catch {
      return null;
    }
  }

  async writeSnapshot(snapshot: ProviderSnapshot): Promise<void> {
    this.assertAvailable();

    if (snapshot.status === "healthy" && snapshot.models.length === 0) {
      throw new Error(
        "Refusing to store an empty snapshot as healthy. The previous dataset remains in place.",
      );
    }
    // A failed run records nothing, so it can never displace good data.
    if (snapshot.status === "failed") return;

    const directory = this.directory();
    await mkdir(directory, { recursive: true });

    const target = this.pathFor(snapshot.provider);
    const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;

    try {
      await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
  }
}
