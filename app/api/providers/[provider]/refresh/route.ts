import { timingSafeEqual } from "node:crypto";

import {
  BrightDataError,
  runCollection,
  type BrightDataConfig,
} from "@/lib/brightdata/client";
import { normalizeCollectorRecords } from "@/lib/brightdata/normalize";
import { validateCollectorRows } from "@/lib/brightdata/schema";
import { assertTargetsApproved, getProviderTargets } from "@/lib/brightdata/targets";
import { resolveSnapshotStore } from "@/lib/data/snapshot-store";
import { normalizedModelsSchema } from "@/lib/domain/model-schema";

/*
  Admin-only catalog refresh.

  Durability, in the order the steps must happen:

  1. Nothing runs without ADMIN_REFRESH_SECRET, compared in constant time.
  2. Scrape targets come from a constant, never from the request.
  3. The COMPLETE collector response is fetched and fully validated BEFORE
     anything is written.
  4. A healthy snapshot is inserted only when every requested page produced a
     valid record. Anything less is recorded as `partial`, which the read path
     ignores — so production keeps serving the last healthy dataset rather than a
     half-collected one.
  5. Failure writes nothing at all. The store is append-only, so the previous
     healthy snapshot cannot be overwritten or deleted by a bad run.
  6. No secret, header, or raw provider error ever reaches a response or a log.

  Deliberately absent: any persistence of user specifications.
*/

export const runtime = "nodejs";

interface RefreshSummary {
  provider: string;
  status: "healthy" | "partial" | "failed";
  collectionId: string | null;
  recordsReceived: number;
  recordsValid: number;
  recordsInvalid: number;
  modelsStored: number;
  previousModelsPreserved: boolean;
  storedTo: "supabase" | "filesystem" | null;
  message: string;
}

function unauthorized() {
  return Response.json({ error: "Unauthorized." }, { status: 401 });
}

/** Constant-time comparison that does not leak length via an early return. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");

  if (a.length !== b.length) {
    timingSafeEqual(b, b); // Burn an equivalent comparison.
    return false;
  }
  return timingSafeEqual(a, b);
}

function readSecret(request: Request): string | null {
  const header = request.headers.get("x-admin-refresh-secret");
  if (header) return header;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);

  return null;
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/providers/[provider]/refresh">,
) {
  const expectedSecret = process.env.ADMIN_REFRESH_SECRET;
  if (!expectedSecret) {
    return Response.json(
      { error: "Refresh is not configured.", missingEnvVars: ["ADMIN_REFRESH_SECRET"] },
      { status: 503 },
    );
  }

  if (!secretMatches(readSecret(request), expectedSecret)) return unauthorized();

  const { provider: providerParam } = await context.params;
  const provider = providerParam.toLowerCase();

  const targets = getProviderTargets(provider);
  if (!targets) {
    return Response.json(
      { error: `Unknown or unconfigured provider: ${provider}` },
      { status: 404 },
    );
  }

  const apiToken = process.env.BRIGHT_DATA_API_TOKEN;
  const collectorId = process.env[targets.collectorEnvKey];
  const missing = [
    apiToken ? null : "BRIGHT_DATA_API_TOKEN",
    collectorId ? null : targets.collectorEnvKey,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    return Response.json(
      { error: "Bright Data is not configured.", missingEnvVars: missing },
      { status: 503 },
    );
  }

  const store = resolveSnapshotStore();
  if (!store) {
    return Response.json(
      {
        error:
          "No durable snapshot store is available. Configure Supabase for any deployed environment.",
        missingEnvVars: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      },
      { status: 503 },
    );
  }

  try {
    assertTargetsApproved(targets);
  } catch {
    return Response.json(
      { error: "Scrape targets failed the approved-domain check." },
      { status: 500 },
    );
  }

  const previous = await store.readLatestHealthy(provider).catch(() => null);
  const previousCount = previous?.models.length ?? 0;
  const preserved = previousCount > 0;

  let collectionId: string | null = null;

  try {
    // ── Collect and validate EVERYTHING before writing anything ──
    const run = await runCollection(
      { apiToken: apiToken!, collectorId: collectorId! } satisfies BrightDataConfig,
      targets.urls,
    );
    collectionId = run.collectionId;

    const { valid, failures } = validateCollectorRows(run.rows);

    if (valid.length === 0) {
      return Response.json(
        {
          provider,
          status: "failed",
          collectionId,
          recordsReceived: run.rows.length,
          recordsValid: 0,
          recordsInvalid: failures.length,
          modelsStored: previousCount,
          previousModelsPreserved: preserved,
          storedTo: null,
          message:
            "No valid records were returned. Nothing was written; the previous healthy dataset is still being served.",
        } satisfies RefreshSummary,
        { status: 502 },
      );
    }

    const models = normalizeCollectorRecords(valid, {
      provider,
      verifiedAt: new Date().toISOString(),
      sourceLabel: targets.sourceLabel,
    });

    // Second gate: the normalized shape must itself validate.
    const shapeCheck = normalizedModelsSchema.safeParse(models);
    if (!shapeCheck.success) {
      return Response.json(
        {
          provider,
          status: "failed",
          collectionId,
          recordsReceived: run.rows.length,
          recordsValid: valid.length,
          recordsInvalid: failures.length,
          modelsStored: previousCount,
          previousModelsPreserved: preserved,
          storedTo: null,
          message:
            "Collected records failed shape validation. Nothing was written; the previous healthy dataset is still being served.",
        } satisfies RefreshSummary,
        { status: 502 },
      );
    }

    // A partial run must not become the served dataset. Merge over the previous
    // models so nothing is lost, but only label it healthy on a complete run.
    const merged = new Map(
      (previous?.models ?? []).map((model) => [model.modelIdentifier, model]),
    );
    for (const model of models) merged.set(model.modelIdentifier, model);
    const stored = [...merged.values()];

    const complete = failures.length === 0 && valid.length === targets.urls.length;
    const status = complete ? "healthy" : "partial";

    await store.writeSnapshot({
      provider,
      collectedAt: new Date().toISOString(),
      collectionId,
      status,
      recordsReceived: run.rows.length,
      recordsValid: valid.length,
      recordsInvalid: failures.length,
      models: stored,
    });

    return Response.json(
      {
        provider,
        status,
        collectionId,
        recordsReceived: run.rows.length,
        recordsValid: valid.length,
        recordsInvalid: failures.length,
        modelsStored: stored.length,
        previousModelsPreserved: preserved,
        storedTo: store.kind,
        message: complete
          ? `Stored ${stored.length} models from ${targets.urls.length} pages.`
          : `Only ${valid.length} of ${targets.urls.length} pages produced a valid record, so this run was recorded as partial and is not served. The previous healthy dataset remains live.`,
      } satisfies RefreshSummary,
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof BrightDataError
        ? error.safeMessage
        : "The refresh failed. Nothing was written; the previous healthy dataset is still being served.";

    return Response.json(
      {
        provider,
        status: "failed",
        collectionId,
        recordsReceived: 0,
        recordsValid: 0,
        recordsInvalid: 0,
        modelsStored: previousCount,
        previousModelsPreserved: preserved,
        storedTo: null,
        message,
      } satisfies RefreshSummary,
      { status: 502 },
    );
  }
}
