# SpecPilot

**Find the least expensive AI model that can reliably handle your task.**

You describe a job in plain language. SpecPilot compiles your answers into a
structured specification, checks every model in its catalog against that
specification, estimates your monthly cost from published token pricing, and
recommends **the cheapest model that satisfies every mandatory requirement** —
showing exactly why every other model was passed over.

Model data is not typed in by hand. It is collected from providers' own
documentation by a real [Bright Data Scraper Studio](https://docs.brightdata.com/datasets/scraper-studio/overview)
collector, validated, and stored with a link back to the page each value came from.

---

## What makes it different

Most "which model should I use" tools give you a vibe. SpecPilot gives you an
audit trail.

- **Deterministic.** No LLM picks the winner. Cost, filtering and ranking are pure
  functions with unit tests. The same specification always produces the same answer.
- **Cost is the only primary axis.** The recommendation is the cheapest compatible
  model. Your stated priority only breaks ties between models of equal cost, so a
  "cheaper compatible alternative" cannot exist by construction.
- **Three-state capabilities.** Every capability is `true`, `false`, or `null`.
  `null` means *the documentation does not say* — never *unsupported*. A model is
  never rejected for a capability nobody could verify, and never recommended on one
  either.
- **It refuses rather than guesses.** If a provider prices prompts above 272K
  tokens differently and your workload is 400K, SpecPilot reports **"Cannot
  estimate"** instead of quoting the cheap tier at you.
- **Assumptions are labelled as assumptions.** Where a page documents no price
  tier, the requirement shows as *Assumed*, not *Met*, and the requirement-fit
  panel says how many criteria rest on an assumption.

---

## User flow

```
Landing  →  6-step wizard  →  structured specification  →  compatibility filter
                                                                    ↓
        recommendation  ←  ranking  ←  monthly cost estimate  ←  ─┘
              ↓
   primary · stronger alternatives · "why not this cheaper model"
   cannot verify · cannot estimate · rejected (each with exact reasons)
```

Supporting surfaces: **`/catalog`** (searchable model table with capability states
and evidence links) and **`/sources`** (per-provider collector health).

---

## Architecture

```
app/
  page.tsx                     landing
  spec/                        6-step wizard (useReducer, testable without a DOM)
  result/                      recommendation, cost breakdown, exclusions
  catalog/                     searchable catalog, filters in the URL
  sources/                     collector health and data provenance
  api/recommend/               POST spec -> recommendation (engine runs server-side)
  api/providers/[p]/refresh/   admin-only collector refresh

lib/
  domain/       TaskSpec, NormalizedModel, requirements, summary, wizard reducer
  engine/       cost -> filter -> rank -> fit -> recommend   (pure, deterministic)
  brightdata/   server-only client, Zod validation, normalization
  data/         repository interface + Supabase / filesystem / fixture sources
```

**The data layer is one interface, three implementations.** No page or component
ever imports a data source directly:

```ts
interface ModelRepository {
  listModels(): Promise<NormalizedModel[]>;
  getProviderHealth(): Promise<ProviderHealth[]>;
}
```

Resolution order — **real data always beats development data**:

| Order | Mode | When | Badge shown |
|---|---|---|---|
| 1 | `supabase` | Supabase configured **and** holding a healthy snapshot | "Live collector data" |
| 2 | `snapshot` | local filesystem snapshot exists, non-production only | "Live collector data" |
| 3 | `fixtures` | `ENABLE_DEVELOPMENT_FIXTURES=true`, non-production only | **"Development data"** |
| 4 | `unconfigured` | nothing above | "No data source configured" |

Two guards worth knowing:

- **Production never serves development data.** Filesystem snapshots are disabled
  when `NODE_ENV=production`, and fixtures additionally require
  `ALLOW_FIXTURES_IN_PRODUCTION=true`. A misconfigured deploy fails loudly instead
  of quietly showing fake prices.
- **Supabase configured means Supabase serves, or nothing does.** There is no
  silent downgrade to fixtures once a project is wired up.

---

## Bright Data collector flow

```
bdata scraper create   →  collector c_… generated from a natural-language prompt
        ↓
POST /dca/trigger?collector=c_…&queue_next=1   body: [{ "url": … }]
        ↓  returns { collection_id: "j_…" }
GET  /dca/dataset?id=j_…    202 while building · 200 with a JSON array
        ↓
Zod validation  →  normalization  →  append-only snapshot insert
```

Implementation notes that matter:

- Only the two endpoints confirmed in current Scraper Studio documentation are
  used. `/dca/log` and the `deadline` parameter are deliberately not.
- Polling branches on **HTTP status** (202 vs 200), not on whether the array is
  empty — the vendor's own examples loop forever on a legitimately empty result.
- `collection_id` *is* the snapshot id; the same value under two names.
- Scrape targets are a **constant** (`lib/brightdata/targets.ts`), never taken from
  user input, and every URL is re-checked against an approved-domain allowlist.
- The collector reads **rendered** pages. The `.md` variants of the same pages
  failed AI generation outright.

### Providers

| Provider | Status | Detail |
|---|---|---|
| **OpenAI** | **Live** | Real collector `specpilot-openai-models-html`. 5 models collected from 5 rendered model reference pages under `developers.openai.com`. |
| Anthropic | **Coming soon** | Not implemented. No collector, no data, and labelled as such in the UI. It is *not* fixture-backed. |

### What the collected data does and does not contain

Honest limitations, visible in the app rather than buried here:

- `supportsText`, `supportsImages`, `supportsTools`, `supportsStructuredOutput`
  are verified `true` from the rendered pages.
- **`supportsAudio` and `supportsFiles` are `null` for every model.** The rendered
  pages state audio/video support in a Modalities table that the current collector
  schema does not capture, and never mention file upload at all. `null` is correct:
  unverified is not unsupported. Consequence: a specification selecting
  **Documents / files** puts every model into "Cannot verify" with no primary
  recommendation. That is the honest outcome, not a bug.
- The three GPT-5.6 models carry a documented `>272K` price tier, parsed into
  `pricingValidUpToContext: 272000` with `2x` input / `1.5x` output multipliers.
  Workloads above that ceiling report "Cannot estimate".
- Promotional pricing prose is preserved verbatim as a **pricing warning** and is
  never applied to the estimate.

### Self-healing status — honest

The Bright Data self-healing workflow was exercised end to end for real:

1. `scraper heal` proposed adding a `modality_support` field. It reached
   `awaiting_approval`.
2. Review found a semantic error: `Image / "Input only"` mapped `output_status` to
   `null` when the label explicitly states output is not supported.
3. That proposal was **rejected** (`status: "rejected"`).
4. A corrected heal prompt was submitted and produced the right mapping
   (`output_status: "Not supported"`).
5. The corrected proposal was **approved into draft only** — no `--auto-save`.

**The healed schema is NOT running in production.** Verified read-only against
`collectors_list`: the live `output_schema` does not contain `modality_support`.
Promotion requires "Save to Production" in the Bright Data dashboard, which was
unavailable. So:

- Production runs the original **14-field** schema.
- `supportsAudio` and `supportsFiles` remain `null`.
- The application normalizer does **not** read `modality_support`.

The self-healing loop is demonstrated. The improvement it produced is not deployed,
and the app does not pretend otherwise.

---

## Local setup

Requires Node 20.9+.

```bash
npm install
cp .env.example .env.local
```

For a purely local run with no external services, set just this in `.env.local`:

```
ENABLE_DEVELOPMENT_FIXTURES=true
```

```bash
npm run dev     # http://localhost:3000
```

You will see a **"Development data"** badge. That is fixture data — six
hand-transcribed models, each carrying the URL it was transcribed from, with a
fixed timestamp so it can never look freshly verified.

To run against real collector data locally, add `BRIGHT_DATA_API_TOKEN`,
`BRIGHT_DATA_OPENAI_COLLECTOR_ID` and `ADMIN_REFRESH_SECRET`, then run the refresh
command below. The snapshot lands in `.data/snapshots/` (gitignored) and the badge
changes to "Live collector data".

---

## Supabase setup

Needed only for a deployed environment. Four steps.

**1. Create a project** at [supabase.com](https://supabase.com) (free tier is fine).

**2. Apply the migration** — paste `supabase/migrations/0001_model_snapshots.sql`
into the SQL Editor and run it. It creates one append-only table:

```
model_snapshots(id, provider, collection_id, status, collected_at,
                records_received, records_valid, records_invalid,
                models jsonb, created_at)
```

**3. Add credentials** to `.env.local` (Project Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

**4. Populate it** — either seed the snapshot you already collected locally:

```bash
npm run seed:supabase -- --dry-run    # validate, write nothing
npm run seed:supabase -- --confirm    # insert one healthy snapshot
```

…or run a live refresh against Bright Data (see below).

### Why one table

The application needs exactly one query: *the newest healthy snapshot for this
provider*. A normalized `providers` + `models` schema would add joins and
migrations for no functional gain, and would make a partial refresh capable of
damaging good rows.

Append-only is the durability mechanism, enforced by database triggers rather than
application code: `UPDATE` and `DELETE` raise an exception. A failed or partial
collection simply does not produce a new `healthy` row, so the previous healthy
snapshot keeps serving traffic. It cannot be overwritten because nothing can be
overwritten.

### Access control

RLS is enabled with **no policies at all**, and `anon`/`authenticated` are revoked.
There is no anonymous read or write path and no browser-visible Supabase client.
Every access goes through the server-only service-role client.

---

## Environment variables

See `.env.example` for the annotated template. Placeholders only — never commit
real values.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS. Never `NEXT_PUBLIC_`. |
| `BRIGHT_DATA_API_TOKEN` | **server only** | Scraper Studio API token |
| `BRIGHT_DATA_OPENAI_COLLECTOR_ID` | server only | Collector id, begins `c_` |
| `ADMIN_REFRESH_SECRET` | **server only** | Guards the refresh endpoint |
| `ENABLE_DEVELOPMENT_FIXTURES` | dev only | Serve fixtures instead of real data |
| `ALLOW_FIXTURES_IN_PRODUCTION` | dev only | Second opt-in; leave unset |
| `SPECPILOT_SNAPSHOT_DIR` | dev only | Override the local snapshot directory |

There is deliberately **no anon key**: all data access is server-side.

---

## Refresh and seed commands

**Refresh the catalog from Bright Data** (consumes 5 page loads, one per model page):

```bash
export ADMIN_REFRESH_SECRET='<the value from .env.local>'

curl -sS -X POST http://localhost:3000/api/providers/openai/refresh \
  -H "x-admin-refresh-secret: $ADMIN_REFRESH_SECRET" | python3 -m json.tool
```

The endpoint collects and validates **everything** before writing anything, then
inserts a `healthy` snapshot only if every requested page produced a valid record.
Anything less is recorded as `partial`, which the read path ignores — so production
keeps serving the last healthy dataset rather than a half-collected one.

The secret is compared in constant time. Without it configured the endpoint returns
503 rather than accepting unauthenticated requests.

**Seed Supabase from a local snapshot:**

```bash
npm run seed:supabase -- --dry-run    # validate only
npm run seed:supabase -- --confirm    # required; refuses to write otherwise
```

Neither command ever prints a secret — only whether one was found, and its length.

---

## Privacy and security

- **Task specifications are never stored.** Your task description and sample input
  stay in `sessionStorage` in your own browser tab and travel to the server only in
  a request body, never in a URL. Nothing is written to any database. There is no
  `specifications` table, by design.
- **Nothing in a URL.** Putting a specification in a query string would leak it
  into browser history, referrer headers and server access logs.
- **No accounts, no auth, no analytics, no tracking.**
- **Secrets are structurally contained.** Every module that reads a secret is
  marked `import "server-only"`, so the build fails if one is ever pulled into a
  client bundle. A test suite asserts this, asserts no secret is ever prefixed
  `NEXT_PUBLIC_`, asserts no client component references one, and asserts none is
  logged or returned in an API response.
- **Diagnostics name variables, never values.** A misconfiguration reports
  `BRIGHT_DATA_API_TOKEN` is missing; it never echoes what was found.
- **Scrape targets are a constant** checked against an approved-domain allowlist.
  No user-supplied URL is ever fetched.

---

## Testing

```bash
npm test          # 190 tests
npx tsc --noEmit  # type checking
npm run lint      # ESLint
npm run build     # production build
```

What is covered:

- **Cost** — the documented formula, rounding half-up, displayed parts summing to
  the displayed total, refusal on missing/negative prices, refusal when the
  workload exceeds the documented price tier.
- **Filtering** — every capability dimension, context, output length, budget,
  provider exclusion, and that `null` yields "cannot verify" rather than rejection.
- **Ranking** — the primary is always the cheapest compatible model; priority only
  breaks ties; ordering is deterministic regardless of input order.
- **Normalization** — driven by **verbatim real collector output** captured from two
  runs, including the collector's real quirks (a missing `pricing_note` key, title-cased
  modalities, human-readable feature labels).
- **Storage** — newest-healthy selection, partial snapshots ignored, malformed JSONB
  rejected row-by-row, failed writes preserving the previous snapshot.
- **Production safety** — filesystem snapshots and fixtures both refused in
  production; no silent downgrade once Supabase is configured.
- **Secrets** — the structural guarantees listed above.

Not covered: browser-level DOM tests of the wizard. That would need `jsdom` +
`@testing-library/react`, which are not installed. The rendered wizard was verified
manually and via Chrome DevTools MCP at 320 / 375 / 768 / 1280 px.

---

## Deployment checklist

- [ ] Supabase project created
- [ ] `supabase/migrations/0001_model_snapshots.sql` applied
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in the host
- [ ] `BRIGHT_DATA_API_TOKEN` and `BRIGHT_DATA_OPENAI_COLLECTOR_ID` set
- [ ] `ADMIN_REFRESH_SECRET` set to a fresh random value
- [ ] `ENABLE_DEVELOPMENT_FIXTURES` and `ALLOW_FIXTURES_IN_PRODUCTION` **unset**
- [ ] At least one `healthy` snapshot in `model_snapshots` (seed or refresh)
- [ ] `/sources` shows OpenAI **Healthy** and Anthropic **Not configured**
- [ ] `/catalog` lists the collected models with **"Live collector data"**
- [ ] No **"Development data"** badge anywhere
- [ ] `npm run build` passes
- [ ] Service-role key is set only as a server-side environment variable

## Known limitations

- Anthropic is not implemented.
- `supportsAudio` and `supportsFiles` are `null` for all models; requiring document
  input yields no recommendation.
- The healed `modality_support` schema exists as an approved draft but is not in
  production.
- Long-context pricing tiers are captured and respected but not *applied* — models
  above their priced ceiling report "Cannot estimate" rather than a higher estimate.
- Cost covers standard token pricing only: no batch, cache-write, or regional rates.
- Rate limiting on the refresh endpoint is by shared secret only.
