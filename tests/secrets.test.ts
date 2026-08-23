import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/*
  Structural guarantees that secrets cannot escape.

  These read the source tree rather than mocking, because the risk being guarded
  against is someone innocently importing a server module into a client one —
  exactly the mistake a unit test with mocks would not catch.
*/

const ROOT = process.cwd();

const SECRET_ENV_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "BRIGHT_DATA_API_TOKEN",
  "ADMIN_REFRESH_SECRET",
  "BRIGHT_DATA_OPENAI_COLLECTOR_ID",
];

/** Modules that read a secret and must therefore never reach a browser bundle. */
const SERVER_ONLY_MODULES = [
  "lib/data/supabase-admin.ts",
  "lib/data/supabase-snapshot-store.ts",
  "lib/data/filesystem-snapshot-store.ts",
  "lib/data/snapshot-store.ts",
  "lib/data/snapshot-repository.ts",
  "lib/brightdata/client.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", ".data", "coverage"].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = walk(ROOT).filter((f) => !f.includes(`${path.sep}scripts${path.sep}`));

describe("secrets cannot reach the client", () => {
  it.each(SERVER_ONLY_MODULES)("%s is marked server-only", (relative) => {
    const source = readFileSync(path.join(ROOT, relative), "utf8");
    expect(source).toMatch(/^import ["']server-only["'];/m);
  });

  it("never prefixes a secret with NEXT_PUBLIC_", () => {
    for (const secret of SECRET_ENV_VARS) {
      for (const file of SOURCE_FILES) {
        const source = readFileSync(file, "utf8");
        expect(source).not.toContain(`NEXT_PUBLIC_${secret}`);
      }
    }
  });

  it("reads secret env vars only from server-only modules or route handlers", () => {
    const offenders: string[] = [];

    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      const relative = path.relative(ROOT, file);

      const touchesSecret = SECRET_ENV_VARS.some(
        (secret) => source.includes(secret) && !relative.endsWith(".test.ts"),
      );
      if (!touchesSecret) continue;

      const isServerOnly = /^import ["']server-only["'];/m.test(source);
      const isRouteHandler = relative.includes(`${path.sep}api${path.sep}`);
      const isEnvTemplateDoc = relative === ".env.example";
      // Names-only references (env var NAMES for diagnostics) are fine.
      const isNamesOnly =
        relative === path.join("lib", "domain", "providers.ts") ||
        relative === path.join("lib", "brightdata", "targets.ts") ||
        relative === path.join("lib", "data", "repository.ts");

      if (!isServerOnly && !isRouteHandler && !isEnvTemplateDoc && !isNamesOnly) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("marks no client component as reading a secret", () => {
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      if (!/^["']use client["'];/m.test(source)) continue;

      for (const secret of SECRET_ENV_VARS) {
        expect(
          { file: path.relative(ROOT, file), secret, present: source.includes(secret) },
        ).toEqual({ file: path.relative(ROOT, file), secret, present: false });
      }
    }
  });
});

describe("secrets cannot reach an API response", () => {
  it("refresh route returns env var NAMES, never values", () => {
    const source = readFileSync(
      path.join(ROOT, "app/api/providers/[provider]/refresh/route.ts"),
      "utf8",
    );

    // The token is read into a local and passed to the client; it must never be
    // interpolated into a Response body.
    expect(source).not.toMatch(/Response\.json\([^)]*apiToken/);
    expect(source).not.toMatch(/Response\.json\([^)]*expectedSecret/);
    expect(source).not.toMatch(/Response\.json\([^)]*collectorId[^N]/);
    // Diagnostics name the variables instead.
    expect(source).toContain('"BRIGHT_DATA_API_TOKEN"');
    expect(source).toContain('missingEnvVars');
  });

  it("never logs a secret", () => {
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        if (!/console\.(log|info|warn|error|debug)/.test(line)) continue;
        for (const secret of SECRET_ENV_VARS) {
          expect(line).not.toContain(secret);
        }
      }
    }
  });

  it("provider health exposes the collector env var name, not its value", async () => {
    const { SnapshotModelRepository } = await import("@/lib/data/snapshot-repository");
    const SECRET_COLLECTOR_ID = "c_this_value_must_never_be_serialised";

    const repository = new SnapshotModelRepository(
      {
        NODE_ENV: "development",
        BRIGHT_DATA_OPENAI_COLLECTOR_ID: SECRET_COLLECTOR_ID,
      } as NodeJS.ProcessEnv,
      Date.now,
      {
        kind: "supabase",
        async readLatestHealthy() {
          return null;
        },
        async writeSnapshot() {},
      },
    );

    const health = await repository.getProviderHealth();
    const openai = health.find((entry) => entry.provider === "openai")!;

    expect(openai.collectorConfigured).toBe(true);
    expect(openai.collectorEnvKey).toBe("BRIGHT_DATA_OPENAI_COLLECTOR_ID");
    expect(JSON.stringify(health)).not.toContain(SECRET_COLLECTOR_ID);
  });
});
