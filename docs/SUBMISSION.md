# SpecPilot — submission

## One-liner

**Find the least expensive AI model that can reliably handle your task** — with the
cost arithmetic, the evidence, and the reason every other model was rejected.

## Description

Choosing an AI model today means reading several pricing pages, cross-referencing
capability tables, and guessing. SpecPilot replaces the guess with an audit trail.

You answer six plain questions about your task — what goes in, what comes out, how
much volume, what is non-negotiable. SpecPilot compiles that into a structured,
machine-checkable specification, then checks every model in its catalog against it:
capability by capability, context limit, output length, published pricing, and your
budget. It estimates your monthly cost from real token prices and recommends the
cheapest model that satisfies **every** mandatory requirement.

The model data is not typed in by hand. A real Bright Data Scraper Studio collector
reads OpenAI's own model reference pages, and every price and capability in the app
links back to the page it came from.

What makes it trustworthy is what it refuses to do:

- **No LLM picks the winner.** Cost, filtering and ranking are pure deterministic
  functions with unit tests. The same spec always gives the same answer.
- **Capabilities are three-state.** `true`, `false`, or `null` — where `null` means
  *the documentation doesn't say*, never *unsupported*. A model is never rejected on
  an unverified capability, and never recommended on one.
- **It refuses to guess prices.** When a provider prices prompts above 272K tokens
  differently and your workload is 400K, SpecPilot reports "Cannot estimate" rather
  than quoting the cheaper tier.
- **Assumptions are labelled.** Where a page documents no price tier, the
  requirement reads *Assumed*, not *Met*.
- **Your task description is never stored.** No database row, never in a URL.

## Judging-track notes

### Best UI

The interface is built from a documented design system (`DESIGN.md`) rather than
improvised: a token layer in `app/globals.css`, a four-step surface ladder, stacked
hairline elevation, and two deliberately separate button scales — a 100px pill for
marketing, 6px for in-app chrome — never mixed on one screen.

Where the design does real work:

- **Honesty is a visual system.** Three capability states with distinct icon *and*
  word — Supported / Unsupported / **Unknown** styled as neutral information, never
  as failure. Status is never carried by colour alone.
- **"Assumed" has its own affordance** — a hollow diamond, distinct from a tick,
  because a requirement met on an assumption is not a verified fact.
- **One chart, earning its place.** A single cost-comparison bar chart, with an
  accompanying screen-reader table. No decorative dashboards.
- **Accessibility built in, not bolted on.** `fieldset`/`legend` per group, real
  labels, `aria-invalid` + `aria-describedby`, `role="alert"` errors, focus moved to
  the step heading on navigation, `aria-current` progress, reduced-motion respected.
- **Responsive at 320 / 375 / 768 / 1280**, verified with zero horizontal overflow.
  The catalog is a table above 768px and stacked cards below — a different component,
  not a squeezed one.
- **Real empty, loading and error states**, including a "no compatible model" state
  that explains itself rather than inventing a closest match.

### Best Use of Bright Data

Bright Data is the product's source of truth, not a bolt-on.

- **A real custom Scraper Studio collector** built from a natural-language prompt,
  reading rendered OpenAI model pages — five models, five valid records.
- **Correct API usage from current documentation**: `POST /dca/trigger` with a JSON
  array body, then `GET /dca/dataset?id=…` **branching on HTTP status (202 vs 200)**
  rather than on array emptiness, which is the bug the vendor's own examples contain.
- **Real engineering findings, documented.** `openai.com/api/pricing/` is
  bot-blocked (403) to non-browser clients; the `.md` documentation variants fail AI
  generation entirely; the rendered pages are what works. Each conclusion was tested,
  not assumed.
- **Genuine self-healing loop, honestly reported.** A heal proposed a new field;
  review caught a real semantic error in it; we rejected it, corrected the prompt,
  and the second attempt was right. It is approved as a draft and **explicitly not
  in production** — the README says so and the app does not pretend otherwise.
- **Durability designed around collector failure.** Validate everything first;
  insert only on complete success; append-only storage enforced by database
  triggers, so a failed or partial run cannot damage the dataset in production.

### Clean Code

- **190 tests** covering cost arithmetic, every filter dimension, ranking
  determinism, storage selection, production safety and secret containment.
- **Normalization tests run against verbatim real collector output**, preserving its
  actual quirks — a missing `pricing_note` key, title-cased modalities, human-readable
  feature labels — so the parser is proven against reality, not against an idealised
  fixture.
- **One data interface, three implementations** (Supabase / filesystem / fixtures).
  No page or component imports a data source directly, so swapping the backend
  required no UI change.
- **Secrets structurally contained.** Every module reading a secret is
  `import "server-only"`, so the build fails if it reaches a client bundle — and a
  test suite asserts that, plus no `NEXT_PUBLIC_` secret, no secret in a client
  component, log line, or API response.
- **Bugs found and fixed during development are documented in the history**, including
  a real one where the recommender returned nothing because an absent price tier was
  treated as unverifiable rather than as the ordinary case.
- Type checking, lint and production build all clean.

## Honest status

| | |
|---|---|
| OpenAI collector | **Live** — real collector, 5 models |
| Anthropic | **Not implemented**, labelled "Coming soon" |
| `supportsAudio` / `supportsFiles` | **`null`** — not stated on the rendered pages |
| `modality_support` heal | approved **draft only**, not in production |
| Task specifications | **never stored** |
| Benchmarks | **none run**; "requirement fit" is spec match, not accuracy |
