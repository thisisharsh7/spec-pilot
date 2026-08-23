import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import {
  DataProvenance,
  EvidenceLink,
  HealthBadge,
} from "@/components/status";
import { Card, Container } from "@/components/ui/primitives";
import { DataSourceError, resolveDataSource } from "@/lib/data/repository";
import type { ProviderHealth } from "@/lib/domain/model";
import { formatDateUtc, formatInteger } from "@/lib/format";

export const metadata: Metadata = {
  title: "Data sources",
  description:
    "Where SpecPilot's model data comes from: official provider documentation, collected through Bright Data, with per-provider collector health and freshness.",
};

// Health reflects the current snapshot, so this must not be cached at build time.
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  let health: ProviderHealth[] = [];
  let mode = "unconfigured" as Awaited<ReturnType<typeof resolveDataSource>>["mode"];
  let error: string | null = null;
  let missingEnvVars: string[] = [];

  try {
    const resolved = await resolveDataSource();
    mode = resolved.mode;
    health = await resolved.repository.getProviderHealth();
  } catch (caught) {
    if (caught instanceof DataSourceError) {
      error = caught.message;
      missingEnvVars = caught.missingEnvVars;
    } else {
      error = "The data sources could not be loaded.";
    }
  }

  return (
    <>
      <SiteNav scale="app" />

      <main className="flex-1 bg-canvas-soft">
        <Container className="py-10 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-display-lg text-ink">Data sources.</h1>
            <DataProvenance mode={mode} />
          </div>
          <p className="mt-3 max-w-3xl text-body-lg text-body">
            Every price and capability in SpecPilot is read from a provider&rsquo;s own
            documentation by a Bright Data collector. This page reports the state of
            each collector honestly, including when it has never run.
          </p>

          {error ? (
            <Card tone="canvas" elevation={2} className="mt-10 max-w-2xl rounded-lg p-8">
              <p className="font-mono text-caption text-error-deep">
                NO DATA SOURCE
              </p>
              <p className="mt-2 text-body-md text-ink">{error}</p>
              {missingEnvVars.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-1">
                  {missingEnvVars.map((name) => (
                    <li key={name} className="font-mono text-code text-ink">
                      {name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : (
            <div className="mt-10 flex flex-col gap-4">
              {health.map((provider) => (
                <ProviderCard key={provider.provider} provider={provider} />
              ))}
            </div>
          )}

          <Card tone="soft" elevation={1} className="mt-10 max-w-3xl rounded-lg p-6">
            <p className="font-mono text-caption text-mute">HOW TO READ THIS</p>
            <dl className="mt-4 flex flex-col gap-3 text-body-sm">
              <Definition term="Healthy">
                The last run completed and every record it returned validated.
              </Definition>
              <Definition term="Partial">
                Some records validated and some did not. Models missing from that run
                keep their previous values rather than being deleted.
              </Definition>
              <Definition term="Stale">
                The data is still shown, but it is older than the freshness window.
                Recommendations built on it say so.
              </Definition>
              <Definition term="Failed">
                The last run returned no valid records. The previous dataset was kept.
              </Definition>
              <Definition term="Not configured">
                No collector has been set up. Nothing is broken — this provider simply
                has no data yet.
              </Definition>
            </dl>
          </Card>
        </Container>
      </main>

      <SiteFooter />
    </>
  );
}

function ProviderCard({ provider }: { provider: ProviderHealth }) {
  const rows: [string, React.ReactNode][] = [
    [
      "Official source",
      <EvidenceLink key="src" href={provider.sourceUrl}>
        {new URL(provider.sourceUrl).host}
      </EvidenceLink>,
    ],
    [
      "Collector",
      provider.collectorConfigured ? (
        <span className="text-body-sm text-ink">
          Configured via{" "}
          <code className="font-mono text-caption">{provider.collectorEnvKey}</code>
        </span>
      ) : (
        <span className="text-body-sm text-body">
          Not set —{" "}
          <code className="font-mono text-caption">{provider.collectorEnvKey}</code> is
          empty
        </span>
      ),
    ],
    [
      "Last successful refresh",
      provider.lastSuccessfulRefreshAt ? (
        <span className="font-mono text-caption text-ink">
          {formatDateUtc(provider.lastSuccessfulRefreshAt)}
        </span>
      ) : (
        <span className="text-body-sm text-body">Never</span>
      ),
    ],
    [
      "Records received",
      <span key="rr" className="font-mono text-caption text-ink">
        {provider.recordsReceived === null ? "—" : formatInteger(provider.recordsReceived)}
      </span>,
    ],
    [
      "Records valid",
      <span key="rv" className="font-mono text-caption text-ink">
        {provider.recordsValid === null ? "—" : formatInteger(provider.recordsValid)}
      </span>,
    ],
    [
      "Data freshness",
      <span key="fr" className="font-mono text-caption text-body">
        {provider.freshness}
      </span>,
    ],
  ];

  return (
    <Card tone="canvas" elevation={2}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-display-sm text-ink">{provider.displayName}</h2>
        <HealthBadge state={provider.state} />
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2"
          >
            <dt className="text-body-sm text-body">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>

      {provider.lastErrorMessage ? (
        <p className="mt-4 rounded-sm bg-error-soft px-3 py-2 text-body-sm text-error-deep">
          {provider.lastErrorMessage}
        </p>
      ) : null}
    </Card>
  );
}

function Definition({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-36 shrink-0 font-medium text-ink">{term}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  );
}
