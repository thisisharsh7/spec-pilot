import type {
  DataMode,
  NormalizedModel,
  ProviderHealth,
} from "@/lib/domain/model";

/**
 * The only contract the UI knows about. Fixtures today, Supabase later; no page
 * or component ever imports a fixture file directly.
 */
export interface ModelRepository {
  listModels(): Promise<NormalizedModel[]>;
  getProviderHealth(): Promise<ProviderHealth[]>;
}

/**
 * Raised when no data source can be resolved. Carries environment variable
 * NAMES so the UI can tell an operator what to set — never any value.
 */
export class DataSourceError extends Error {
  readonly missingEnvVars: string[];

  constructor(message: string, missingEnvVars: string[] = []) {
    super(message);
    this.name = "DataSourceError";
    this.missingEnvVars = missingEnvVars;
  }
}

/**
 * What "Supabase is configured" means. No anon key: every read and write happens
 * server-side through the service-role client, so a browser-visible Supabase
 * client would only widen the attack surface.
 */
export const SUPABASE_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function isTrue(value: string | undefined): boolean {
  return value === "true";
}

export function isSupabaseConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return SUPABASE_ENV_VARS.every((name) => Boolean(env[name]));
}

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Fixtures require an explicit opt-in, and a SECOND explicit opt-in to run in
 * production. An `ENABLE_DEVELOPMENT_FIXTURES=true` copied into a production
 * environment by accident therefore cannot silently serve development data.
 */
export function areFixturesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isTrue(env.ENABLE_DEVELOPMENT_FIXTURES)) return false;
  return !isProduction(env) || isTrue(env.ALLOW_FIXTURES_IN_PRODUCTION);
}

/**
 * Resolve where the catalog comes from.
 *
 * Real data always wins over development data: a stored collector snapshot is
 * preferred over fixtures, and Supabase over both. Fixtures are the last resort
 * and are the only mode that carries the "Development data" badge.
 *
 * Async because detecting a usable snapshot means touching the filesystem.
 * Server-only: `ENABLE_DEVELOPMENT_FIXTURES` is deliberately not `NEXT_PUBLIC_`,
 * so resolve on the server and pass the result into client components.
 */
export async function getDataMode(
  env: NodeJS.ProcessEnv = process.env,
): Promise<DataMode> {
  const { hasUsableSnapshot } = await import("@/lib/data/snapshot-repository");

  if (isSupabaseConfigured(env)) {
    // Supabase configured means Supabase serves, or nothing does. Never a silent
    // downgrade to fixtures in a deployed environment.
    return (await hasUsableSnapshot(env)) ? "supabase" : "unconfigured";
  }

  // Filesystem snapshots are a development convenience only.
  if (!isProduction(env) && (await hasUsableSnapshot(env))) return "snapshot";

  return areFixturesAllowed(env) ? "fixtures" : "unconfigured";
}

/** True only for hand-transcribed development data, never for collector output. */
export async function isFixtureMode(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return (await getDataMode(env)) === "fixtures";
}

/**
 * Resolve the active repository.
 *
 * In production without Supabase this throws rather than falling back, so a
 * misconfigured deployment fails loudly instead of quietly serving fixtures.
 */
export async function getModelRepository(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ModelRepository> {
  const mode = await getDataMode(env);

  switch (mode) {
    // Both are the same repository over the same interface; the store resolver
    // decides whether that is Supabase or the local filesystem.
    case "supabase":
    case "snapshot": {
      const { SnapshotModelRepository } = await import(
        "@/lib/data/snapshot-repository"
      );
      return new SnapshotModelRepository(env);
    }

    case "fixtures": {
      const { FixtureModelRepository } = await import(
        "@/lib/data/fixture-repository"
      );
      return new FixtureModelRepository(env);
    }

    case "unconfigured":
    default: {
      const missing = SUPABASE_ENV_VARS.filter((name) => !env[name]);
      throw new DataSourceError(
        isProduction(env)
          ? "No model data is available. Production requires Supabase holding at least one healthy snapshot; development fixtures are not permitted here."
          : "No data source is configured. Run a provider refresh, or set ENABLE_DEVELOPMENT_FIXTURES=true for local development.",
        isProduction(env) ? [...missing] : [...missing, "ENABLE_DEVELOPMENT_FIXTURES"],
      );
    }
  }
}

/** Repository plus the mode that produced it, for pages that show provenance. */
export async function resolveDataSource(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ mode: DataMode; repository: ModelRepository }> {
  const [mode, repository] = await Promise.all([
    getDataMode(env),
    getModelRepository(env),
  ]);
  return { mode, repository };
}
