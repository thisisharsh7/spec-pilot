#!/usr/bin/env node
/*
  Upload the locally collected snapshot to Supabase.

  Deliberately a separate, explicit command: it writes production data, so it must
  never run as a side effect of a build or a dev server. Requires --confirm.

  Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
  Neither value is ever printed; only whether it was found, and its length.

  Usage:
    node scripts/seed-supabase.mjs --confirm
    node scripts/seed-supabase.mjs --confirm --provider openai
    node scripts/seed-supabase.mjs --dry-run
*/

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const provider = valueOf("--provider", "openai");
const dryRun = has("--dry-run");
const confirmed = has("--confirm");

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

if (!confirmed && !dryRun) {
  fail(
    "Refusing to write without explicit confirmation.\n    Run with --confirm to seed, or --dry-run to validate only.",
  );
}

// ── Read env from .env.local without printing any value ─────────────────────
async function readEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    fail("Could not read .env.local. Create it from .env.example first.");
  }

  const env = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = await readEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

console.log("\n  SpecPilot — seed Supabase from local snapshot\n");
console.log(`  provider              : ${provider}`);
console.log(`  NEXT_PUBLIC_SUPABASE_URL   : ${url ? "found" : "MISSING"}`);
console.log(
  `  SUPABASE_SERVICE_ROLE_KEY  : ${serviceKey ? `found (length ${serviceKey.length}, value not shown)` : "MISSING"}`,
);

if (!dryRun && (!url || !serviceKey)) {
  fail("Both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

// ── Load and check the local snapshot ───────────────────────────────────────
const snapshotPath = path.join(process.cwd(), ".data", "snapshots", `${provider}.json`);
let snapshot;
try {
  snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
} catch {
  fail(
    `No local snapshot at ${snapshotPath}.\n    Run a provider refresh first so there is real collector output to seed.`,
  );
}

const models = Array.isArray(snapshot.models) ? snapshot.models : [];
console.log(`  local snapshot        : ${snapshotPath}`);
console.log(`  collected_at          : ${snapshot.collectedAt ?? "(unknown)"}`);
console.log(`  collection_id         : ${snapshot.collectionId ?? "(none)"}`);
console.log(`  models                : ${models.length}`);

if (models.length === 0) {
  fail("Snapshot contains no models. Refusing to seed an empty healthy dataset.");
}

const identifiers = models.map((m) => m.modelIdentifier);
console.log(`  model identifiers     : ${identifiers.join(", ")}`);

// Minimal shape check. The application re-validates with Zod on every read.
const problems = [];
for (const model of models) {
  if (!model.modelIdentifier) problems.push("a model is missing modelIdentifier");
  if (model.pricingMode !== "standard") {
    problems.push(`${model.modelIdentifier}: pricingMode must be "standard"`);
  }
  for (const field of ["inputPricePerMillion", "outputPricePerMillion"]) {
    const value = model[field];
    if (value !== null && (typeof value !== "number" || value < 0)) {
      problems.push(`${model.modelIdentifier}: ${field} is invalid`);
    }
  }
}
if (problems.length > 0) {
  fail(`Snapshot failed validation:\n    - ${problems.join("\n    - ")}`);
}
console.log("  validation            : passed");

if (dryRun) {
  console.log("\n  --dry-run: nothing was written.\n");
  process.exit(0);
}

// ── Insert. Append-only: this adds a row, it never mutates one. ─────────────
const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await client.from("model_snapshots").insert({
  provider,
  collection_id: snapshot.collectionId ?? null,
  status: "healthy",
  collected_at: snapshot.collectedAt ?? new Date().toISOString(),
  records_received: snapshot.recordsReceived ?? models.length,
  records_valid: snapshot.recordsValid ?? models.length,
  records_invalid: snapshot.recordsInvalid ?? 0,
  models,
});

if (error) {
  // Supabase error messages can echo request context; report only the code.
  fail(`Insert failed${error.code ? ` (code ${error.code})` : ""}. Check the migration has been applied.`);
}

console.log(`\n  ✓ Inserted 1 healthy snapshot for "${provider}" with ${models.length} models.`);
console.log("    Existing snapshots were untouched — the table is append-only.\n");
