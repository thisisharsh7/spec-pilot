# SpecPilot

Find the least expensive AI model that can reliably handle your task — with the cost arithmetic, the evidence, and the reason every other model was rejected.

- Live demo: https://spec-pilot-tau.vercel.app/
- GitHub: https://github.com/thisisharsh7/spec-pilot
- Demo video: Add before final submission

## 1. Problem and solution

AI model pricing and capabilities are scattered across provider documentation, published in inconsistent formats, and changed without notice. Choosing a model means reading several pages, cross-referencing capability tables, and guessing.

SpecPilot turns a described workload into machine-checkable requirements, then recommends the cheapest model that satisfies every one of them — showing the cost arithmetic, a link to the documentation page each value came from, and the exact reason every other model was passed over.

- Cheapest compatible model wins; your stated priority only breaks ties.
- Capabilities are `true`, `false` or **unknown** — unverified never means unsupported.
- Refuses to estimate when a workload exceeds a documented price tier.
- Assumptions are labelled as assumptions, not presented as facts.
- Task descriptions are never stored.

## 2. Product experience

Landing → specification wizard → recommendation → cost breakdown → alternatives and rejection reasons

Six plain steps, no model names required. The result page breaks the monthly estimate into requests, tokens and per-direction cost, shows a requirement-fit breakdown that states how many criteria rest on an assumption, and lists every excluded model with its exact reason.

`/catalog` is a searchable table of every model with its capability states and a link to the page each value was read from. `/sources` reports collector health, records received versus validated, and data freshness — including when a provider has no collector at all.

## 3. Bright Data and self-healing

SpecPilot uses a **custom Bright Data Scraper Studio collector**, generated from a natural-language prompt — not a Scrapers Library scraper.

Collector `c_mt5e3u8x1i6gngb4se` reads five public rendered OpenAI model-documentation pages.

Flow: `POST /dca/trigger` → poll `GET /dca/dataset` → Zod validation → normalization → append-only Supabase snapshot. When extraction or validation fails, no new healthy snapshot is written and the previous healthy snapshot keeps serving traffic.

The Self-Healing workflow was exercised. A heal proposed capturing the page's Modalities table, and that proposal was **rejected**: `Image / "Input only"` produced a `null` output status when the page explicitly states output is not supported. A corrected prompt produced the right mapping and was **approved as a draft**.

**That healed schema was not promoted to production.** Production runs the original schema, so audio and document support remain unknown rather than falsely reported.

## 4. Example structured output

Abridged, from a real collector run:

```json
{
  "model_id": "gpt-5.6-luna",
  "display_name": "GPT-5.6 Luna",
  "input_modalities": ["Text", "Image"],
  "output_modalities": ["Text"],
  "context_window_tokens": 1050000,
  "max_output_tokens": 128000,
  "standard_input_usd_per_1m": 0.2,
  "standard_cached_input_usd_per_1m": 0.02,
  "standard_output_usd_per_1m": 1.2,
  "features": [
    { "feature_name": "Function calling", "status": "Supported" },
    { "feature_name": "Structured outputs", "status": "Supported" },
    { "feature_name": "Fine-tuning", "status": "Not supported" }
  ],
  "url": "https://developers.openai.com/api/docs/models/gpt-5.6-luna"
}
```

## 5. Architecture and quality

OpenAI docs → Bright Data Collector → Zod validation → Supabase snapshot → deterministic recommendation engine → Next.js UI

- Next.js, TypeScript, Tailwind CSS, Supabase, Zod, Vitest
- 190 tests
- Cheapest-compatible deterministic ranking — no LLM picks the winner
- `true` / `false` / unknown capability states
- Server-only secrets; scrapes public documentation only

## 6. Run locally

```bash
npm install
cp .env.example .env.local
```

Set `ENABLE_DEVELOPMENT_FIXTURES=true`, then:

```bash
npm run dev
```

Real collector configuration is documented in `.env.example`.

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

## 7. Hackathon disclosure

Into the Scrape-Verse — WeMakeDevs × Bright Data
August 17–23, 2026
Solo submission by [@thisisharsh7](https://github.com/thisisharsh7)
Primary track: Suit-Up — Best UI

Built during the hackathon. Claude Code and Codex were used as coding assistants. The participant selected the idea, directed the architecture, configured services, reviewed outputs, rejected an incorrect heal, verified results and tested deployment.

Limitations:

- OpenAI only
- Audio and file capabilities remain unknown
- Corrected heal remains a draft
- Standard token pricing only
