import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
  Server-only Supabase client using the SERVICE ROLE key.

  `import "server-only"` makes Next fail the build if this module is ever reached
  from a client component, which is the guarantee that matters: the service-role
  key bypasses RLS entirely, so it must never be bundled for a browser.

  Notes on the shape of this file:
  · The key is read here and nowhere else, and is never returned, logged, or put
    into an error message.
  · There is no anon-key client. Every read and write in the app is server-side,
    so a browser-visible Supabase client would only widen the attack surface.
*/

if (typeof window !== "undefined") {
  throw new Error("The Supabase admin client must never run in a browser.");
}

export const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
export const SUPABASE_SERVICE_ROLE_ENV = "SUPABASE_SERVICE_ROLE_KEY";

export class SupabaseNotConfiguredError extends Error {
  readonly missingEnvVars: string[];

  constructor(missingEnvVars: string[]) {
    super("Supabase is not configured.");
    this.name = "SupabaseNotConfiguredError";
    this.missingEnvVars = missingEnvVars;
  }
}

export function missingSupabaseEnvVars(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return [SUPABASE_URL_ENV, SUPABASE_SERVICE_ROLE_ENV].filter((name) => !env[name]);
}

let cached: { url: string; client: SupabaseClient } | null = null;

/** Throws with variable NAMES only — never a value — when unconfigured. */
export function getSupabaseAdmin(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseClient {
  const missing = missingSupabaseEnvVars(env);
  if (missing.length > 0) throw new SupabaseNotConfiguredError(missing);

  const url = env[SUPABASE_URL_ENV]!;
  if (cached && cached.url === url) return cached.client;

  const client = createClient(url, env[SUPABASE_SERVICE_ROLE_ENV]!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "specpilot-server" } },
  });

  cached = { url, client };
  return client;
}

/** Reset the memoised client. Tests only. */
export function resetSupabaseAdminForTests(): void {
  cached = null;
}
