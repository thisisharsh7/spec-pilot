import { MeshGradient } from "@/components/mesh-gradient";
import { DevelopmentDataBadge } from "@/components/status";
import type { DataMode } from "@/lib/domain/model";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import {
  ButtonLink,
  Card,
  Container,
  Eyebrow,
  MarketingBanner,
} from "@/components/ui/primitives";
import { getDataMode } from "@/lib/data/repository";

/* Scope is two providers. OpenAI is the collector target; Anthropic is not built
   yet and is labelled as such rather than implied to be supported. */
const PROVIDERS = [
  { name: "OpenAI", status: null },
  { name: "Anthropic", status: "Coming soon" },
];

const STEPS = [
  {
    n: "01",
    title: "Describe the task.",
    body: "Input type, output format, monthly workload, required capabilities and a budget ceiling. Plain questions, no model names.",
  },
  {
    n: "02",
    title: "Filter on capability.",
    body: "Every model in the catalog is checked against every requirement. Anything that cannot do the job is removed — and told to you, with the reason.",
  },
  {
    n: "03",
    title: "Rank on monthly cost.",
    body: "The survivors are priced against your actual token volume. The cheapest one that still fits is the recommendation.",
  },
];

const TRANSPARENCY = [
  {
    title: "Exact rejection reasons.",
    body: "No silent filtering. Each excluded model names the requirement it failed — missing image input, context window too small, no tool calling, over budget.",
  },
  {
    title: "Official evidence links.",
    body: "Every price and capability carries a link to the provider's own documentation page it was read from. Check the number yourself in one click.",
  },
  {
    title: "Visible data freshness.",
    body: "Each record shows when it was last verified. Stale records are labelled as stale rather than quietly presented as current.",
  },
];

const SOURCE_STATES = [
  {
    label: "FRESH",
    title: "Verified recently",
    body: "The collector completed its last run and the provider page parsed cleanly against the expected schema.",
  },
  {
    label: "STALE",
    title: "Past the freshness window",
    body: "The record is still shown, but flagged. Recommendations built on stale pricing say so on the result page.",
  },
  {
    label: "HEALING",
    title: "Layout changed, retrying",
    body: "A provider redesigned their pricing page. The collector detects the schema mismatch, re-resolves the selectors and re-runs.",
  },
];

export default async function Home() {
  const dataMode = await getDataMode();

  return (
    <>
      <SiteNav scale="marketing" />

      <main className="flex-1">
        <Hero dataMode={dataMode} />
        <ProviderStrip />
        <HowItWorks />
        <SpecBand />
        <Transparency />
        <Sources />
        <ClosingCta />
      </main>

      <SiteFooter />
    </>
  );
}

/* ── Hero ───────────────────────────────────────────────────── */

function Hero({ dataMode }: { dataMode: DataMode }) {
  return (
    <section className="relative overflow-hidden bg-canvas">
      <MeshGradient />
      <Container className="relative py-16 md:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <MarketingBanner href="/#sources">
              Prices read from official provider documentation
            </MarketingBanner>
            <DevelopmentDataBadge mode={dataMode} />
          </div>

          <h1 className="mt-6 text-display-xl text-ink md:text-display-hero">
            Find the cheapest AI model that can actually do the job.
          </h1>

          <p className="mt-6 max-w-2xl text-body-lg text-body">
            Describe your task once. SpecPilot turns it into a structured
            specification, checks it against current model pricing and capabilities,
            and recommends the least expensive model that still meets every
            requirement.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/spec" tone="primary" scale="marketing">
              Find my model
            </ButtonLink>
            <ButtonLink href="/#how-it-works" tone="secondary" scale="marketing">
              See how it works
            </ButtonLink>
          </div>

          <p className="mt-6 font-mono text-caption text-mute">
            Free · No account · Six steps
          </p>
        </div>
      </Container>
    </section>
  );
}

/* ── Provider strip ─────────────────────────────────────────── */

function ProviderStrip() {
  return (
    <section className="border-y border-hairline bg-canvas">
      <Container className="py-6">
        <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
          <p className="font-mono text-caption text-mute">
            CATALOG COMPILED FROM OFFICIAL DOCS
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {PROVIDERS.map((provider) => (
              <li
                key={provider.name}
                className="flex h-6 items-center gap-2 text-body-sm text-hairline-strong"
              >
                {provider.name}
                {provider.status ? (
                  <span className="rounded-full bg-canvas-soft-2 px-2 py-0.5 text-caption text-mute">
                    {provider.status}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

/* ── How it works ───────────────────────────────────────────── */

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-canvas-soft">
      <Container className="py-24">
        <div className="max-w-2xl">
          <Eyebrow>HOW IT WORKS</Eyebrow>
          <h2 className="mt-3 text-display-lg text-ink">Three steps, no guesswork.</h2>
          <p className="mt-4 text-body-lg text-body">
            You should not have to read six pricing pages to answer one question.
            SpecPilot does the reading, and shows its work.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n} elevation={3}>
              <p className="font-mono text-caption text-mute">{step.n}</p>
              <h3 className="mt-3 text-display-sm text-ink">{step.title}</h3>
              <p className="mt-2 text-body-md text-body">{step.body}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── Structured spec (polarity-flipped band) ────────────────── */

function SpecBand() {
  return (
    <section className="bg-primary text-on-primary">
      <Container className="py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="font-mono text-caption text-on-primary/50">
              THE SPECIFICATION
            </p>
            <h2 className="mt-3 text-display-lg text-on-primary">
              Your task, as a structured spec.
            </h2>
            <p className="mt-4 max-w-lg text-body-lg text-on-primary/70">
              The wizard walks six plain steps and compiles them into a
              machine-checkable requirement set. That spec — not a vague prompt — is
              what every model in the catalog gets tested against.
            </p>
            <p className="mt-4 max-w-lg text-body-md text-on-primary/70">
              You can read it, correct it, and re-run it before a single price is
              compared.
            </p>
          </div>

          <SpecMockup />
        </div>
      </Container>
    </section>
  );
}

function SpecMockup() {
  return (
    <div className="overflow-hidden rounded-md bg-[#0a0a0a] shadow-level-5">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-caption text-on-primary/45">
          specification.json
        </span>
      </div>
      <pre className="overflow-x-auto px-6 py-6 font-mono text-code text-on-primary/85">
        <code>
          {"{\n"}
          {'  "goal": '}
          <Str>&quot;Extract vendor, total and due date&quot;</Str>
          {",\n"}
          {'  "inputTypes":  ['}
          <Str>&quot;text&quot;</Str>
          {", "}
          <Str>&quot;images&quot;</Str>
          {"],\n"}
          {'  "outputTypes": ['}
          <Str>&quot;json&quot;</Str>
          {"],\n"}
          {'  "requestsPerDay": '}
          <Num>1000</Num>
          {",\n"}
          {'  "averageInputTokens": '}
          <Num>1200</Num>
          {",\n"}
          {'  "averageOutputTokens": '}
          <Num>300</Num>
          {",\n"}
          {'  "maximumContextRequired": '}
          <Num>200000</Num>
          {",\n"}
          {'  "requireImageInput": '}
          <Num>true</Num>
          {",\n"}
          {'  "requireStructuredOutput": '}
          <Num>true</Num>
          {",\n"}
          {'  "maxMonthlyBudgetUsd": '}
          <Num>null</Num>
          {",\n"}
          {'  "priority": '}
          <Str>&quot;lowest_cost&quot;</Str>
          {"\n}"}
        </code>
      </pre>
    </div>
  );
}

function Str({ children }: { children: React.ReactNode }) {
  return <span className="text-cyan">{children}</span>;
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="text-violet-soft">{children}</span>;
}

/* ── Transparency ───────────────────────────────────────────── */

function Transparency() {
  return (
    <section id="transparency" className="scroll-mt-16 bg-canvas">
      <Container className="py-24">
        <div className="max-w-2xl">
          <Eyebrow>TRANSPARENCY</Eyebrow>
          <h2 className="mt-3 text-display-lg text-ink">
            Every rejection has a reason.
          </h2>
          <p className="mt-4 text-body-lg text-body">
            A recommendation you cannot audit is just an opinion. SpecPilot shows the
            arithmetic, the evidence and the models it threw away.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {TRANSPARENCY.map((item) => (
            <Card key={item.title} tone="soft" elevation={1}>
              <h3 className="text-display-sm text-ink">{item.title}</h3>
              <p className="mt-2 text-body-md text-body">{item.body}</p>
            </Card>
          ))}
        </div>

        <Card
          elevation={4}
          className="mt-6 rounded-lg p-8 md:flex md:items-center md:justify-between md:gap-8"
        >
          <div className="max-w-md">
            <Eyebrow>THE COST MODEL</Eyebrow>
            <h3 className="mt-3 text-display-md text-ink">
              One formula, printed on the page.
            </h3>
            <p className="mt-2 text-body-md text-body">
              No blended averages and no &ldquo;starting from&rdquo; pricing. Your token
              volume, the provider&rsquo;s published rates.
            </p>
          </div>
          <div className="mt-6 overflow-x-auto rounded-md bg-canvas-soft-2 p-6 md:mt-0 md:shrink-0">
            <pre className="font-mono text-code text-body">
              <code>
                {"monthly = requests × ( "}
                <span className="text-ink">in_tokens</span>
                {"  ÷ 1M × "}
                <span className="text-ink">in_rate</span>
                {"\n"}
                {"                     + "}
                <span className="text-ink">out_tokens</span>
                {" ÷ 1M × "}
                <span className="text-ink">out_rate</span>
                {" )"}
              </code>
            </pre>
          </div>
        </Card>
      </Container>
    </section>
  );
}

/* ── Data sources ───────────────────────────────────────────── */

function Sources() {
  return (
    <section id="sources" className="scroll-mt-16 bg-canvas-soft">
      <Container className="py-24">
        <div className="max-w-2xl">
          <Eyebrow>DATA SOURCES</Eyebrow>
          <h2 className="mt-3 text-display-lg text-ink">
            Collected, checked, and self-healing.
          </h2>
          <p className="mt-4 text-body-lg text-body">
            Provider pricing pages change without notice. Collectors run against the
            official documentation through Bright Data Scraper Studio, validate what
            they parse, and report their own health instead of failing quietly.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {SOURCE_STATES.map((state) => (
            <Card key={state.label} elevation={2}>
              <p className="font-mono text-caption text-mute">{state.label}</p>
              <h3 className="mt-3 text-display-sm text-ink">{state.title}</h3>
              <p className="mt-2 text-body-md text-body">{state.body}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── Closing CTA ────────────────────────────────────────────── */

function ClosingCta() {
  return (
    <section id="about" className="relative overflow-hidden bg-canvas">
      <MeshGradient />
      <Container className="relative py-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 className="text-display-lg text-ink">
            Six steps. One number.
          </h2>
          <p className="mt-4 text-body-lg text-body">
            SpecPilot is free and open. Built for developers, students, founders and
            small teams who would rather not overpay by an order of magnitude.
          </p>
          <div className="mt-8">
            <ButtonLink href="/spec" tone="primary" scale="marketing">
              Find my model
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
