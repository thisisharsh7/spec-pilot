"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  CapabilityGrid,
  CheckList,
  CostBreakdown,
  ExcludedModelCard,
  ModelIdentity,
  PricingCaveats,
  RequirementFitPanel,
  SectionHeading,
} from "@/app/result/sections";
import { CostChart, type CostDatum } from "@/components/cost-chart";
import { SpecSummaryView } from "@/components/spec-summary-view";
import { DevelopmentDataBadge } from "@/components/status";
import { ButtonLink, Card } from "@/components/ui/primitives";
import type { DataMode } from "@/lib/domain/model";
import type { TaskSpec } from "@/lib/domain/spec";
import { readPendingSpec } from "@/lib/domain/spec-transport";
import type { Recommendation } from "@/lib/engine/recommend";
import { formatUsd } from "@/lib/format";

interface Payload {
  dataMode: DataMode;
  recommendation: Recommendation;
}

type Phase =
  | { status: "loading" }
  | { status: "no-spec" }
  | { status: "error"; message: string; missingEnvVars?: string[] }
  | { status: "ready"; spec: TaskSpec; payload: Payload };

export function ResultView() {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });

  useEffect(() => {
    // No "already started" ref here: under StrictMode the first run's cleanup
    // would flip `cancelled` while the guard skipped the second run, discarding
    // the only in-flight response and hanging on the loading state forever.
    let cancelled = false;

    void (async () => {
      const spec = readPendingSpec();
      if (!spec) {
        if (!cancelled) setPhase({ status: "no-spec" });
        return;
      }

      try {
        const response = await fetch("/api/recommend", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(spec),
        });
        const body = await response.json();

        if (cancelled) return;

        if (!response.ok) {
          setPhase({
            status: "error",
            message: body?.error ?? "The recommendation could not be produced.",
            missingEnvVars: body?.missingEnvVars,
          });
          return;
        }

        setPhase({ status: "ready", spec, payload: body as Payload });
      } catch {
        if (!cancelled) {
          setPhase({
            status: "error",
            message: "Could not reach the recommendation service.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.status === "loading") return <LoadingState />;
  if (phase.status === "no-spec") return <NoSpecState />;
  if (phase.status === "error") return <ErrorState phase={phase} />;

  return <Result spec={phase.spec} payload={phase.payload} />;
}

/* ── States ─────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <p className="font-mono text-caption text-mute">COMPARING MODELS</p>
      <div className="h-8 w-2/3 max-w-md animate-pulse rounded-sm bg-canvas-soft-2 motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-md bg-canvas-soft-2 motion-reduce:animate-none" />
      <span className="sr-only">Comparing models against your specification.</span>
    </div>
  );
}

function NoSpecState() {
  return (
    <Card tone="soft" elevation={1} className="max-w-2xl rounded-lg p-12 text-center">
      <h2 className="text-display-sm text-ink">No specification to compare.</h2>
      <p className="mt-2 text-body-md text-body">
        Your answers live in this browser tab only, so they are gone after a tab
        close. It takes about a minute to rebuild one.
      </p>
      <div className="mt-6 flex justify-center">
        <ButtonLink href="/spec" scale="app" tone="primary">
          Start the specification
        </ButtonLink>
      </div>
    </Card>
  );
}

function ErrorState({
  phase,
}: {
  phase: { message: string; missingEnvVars?: string[] };
}) {
  return (
    <Card tone="canvas" elevation={2} className="max-w-2xl rounded-lg p-8">
      <p className="font-mono text-caption text-error-deep">DATA SOURCE UNAVAILABLE</p>
      <h2 className="mt-2 text-display-sm text-ink">{phase.message}</h2>
      {phase.missingEnvVars && phase.missingEnvVars.length > 0 ? (
        <div className="mt-4">
          <p className="text-body-sm text-body">Set the following and restart:</p>
          <ul className="mt-2 flex flex-col gap-1">
            {phase.missingEnvVars.map((name) => (
              <li key={name} className="font-mono text-code text-ink">
                {name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-6">
        <ButtonLink href="/spec" scale="app" tone="secondary">
          Back to the specification
        </ButtonLink>
      </div>
    </Card>
  );
}

/* ── Result ─────────────────────────────────────────────────── */

function Result({ spec, payload }: { spec: TaskSpec; payload: Payload }) {
  const { recommendation: result, dataMode } = payload;
  const primary = result.primary;

  const chartData: CostDatum[] = [
    ...(primary ? [primary] : []),
    ...result.strongerAlternatives.map((alt) => alt.evaluation),
    ...result.otherCompatible,
  ]
    .filter((evaluation) => evaluation.cost.kind === "estimated")
    .map((evaluation) => ({
      name: evaluation.model.displayName,
      cost:
        evaluation.cost.kind === "estimated" ? evaluation.cost.totalCost : 0,
      isPrimary: evaluation.model.modelIdentifier === primary?.model.modelIdentifier,
    }))
    .sort((a, b) => a.cost - b.cost);

  return (
    <div className="flex flex-col gap-16">
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-caption text-mute">PRIMARY RECOMMENDATION</p>
          <DevelopmentDataBadge mode={dataMode} />
        </div>

        {primary ? (
          <PrimaryCard result={result} dataMode={dataMode} />
        ) : (
          <NoCompatibleModel result={result} />
        )}

        {chartData.length > 1 ? <CostChart data={chartData} /> : null}
      </section>

      {result.strongerAlternatives.length > 0 ? (
        <section>
          <SectionHeading
            eyebrow="STRONGER ALTERNATIVES"
            title="Worth paying more for?"
            description="These also satisfy every mandatory requirement and add something the primary does not. The extra cost is stated so the trade is explicit."
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {result.strongerAlternatives.map((alternative) => (
              <Card
                key={alternative.evaluation.model.modelIdentifier}
                elevation={2}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <ModelIdentity evaluation={alternative.evaluation} dataMode={dataMode} />
                  <div className="text-right">
                    <p className="font-mono text-display-sm text-ink">
                      +{formatUsd(alternative.extraMonthlyCost)}
                    </p>
                    <p className="text-caption text-mute">more per month</p>
                  </div>
                </div>
                <div>
                  <p className="text-body-sm font-medium text-ink">What it adds</p>
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
                    {alternative.additionalBenefits.map((benefit) => (
                      <li key={benefit} className="text-body-sm text-body">
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {result.whyNotCheaper.length > 0 ? (
        <section>
          <SectionHeading
            eyebrow="WHY NOT THIS CHEAPER MODEL"
            title="Cheaper options that could not do the job."
            description="Each of these would cost less than the recommendation. Here is exactly what stopped them."
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {result.whyNotCheaper.map((entry) => (
              <ExcludedModelCard
                key={entry.evaluation.model.modelIdentifier}
                evaluation={entry.evaluation}
                dataMode={dataMode}
                reasons={entry.reasons}
                monthlyCost={entry.monthlyCost}
                tone={
                  entry.evaluation.verdict === "unverifiable" ? "unverifiable" : "rejected"
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {result.cannotVerify.length > 0 ? (
        <section>
          <SectionHeading
            eyebrow="CANNOT VERIFY"
            title="Set aside for missing evidence."
            description="These are not rejected. Official documentation simply does not state whether they meet a mandatory requirement, so they cannot be recommended on that basis."
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {result.cannotVerify.map((evaluation) => (
              <ExcludedModelCard
                key={evaluation.model.modelIdentifier}
                evaluation={evaluation}
                dataMode={dataMode}
                reasons={evaluation.unknowns}
                tone="unverifiable"
              />
            ))}
          </div>
        </section>
      ) : null}

      {result.cannotEstimate.length > 0 ? (
        <section>
          <SectionHeading
            eyebrow="CANNOT ESTIMATE"
            title="Priced outside your workload."
            description="A published rate exists, but not one that covers a prompt this size. Quoting the cheaper tier would understate the real bill."
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {result.cannotEstimate.map((evaluation) => (
              <ExcludedModelCard
                key={evaluation.model.modelIdentifier}
                evaluation={evaluation}
                dataMode={dataMode}
                reasons={evaluation.failureReasons}
                tone="unpriced"
              />
            ))}
          </div>
        </section>
      ) : null}

      {result.rejected.length > 0 ? (
        <section>
          <SectionHeading
            eyebrow="REJECTED"
            title="Ruled out, with reasons."
            description={`${result.evaluatedCount} models were checked against every mandatory requirement.`}
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {result.rejected.map((evaluation) => (
              <ExcludedModelCard
                key={evaluation.model.modelIdentifier}
                evaluation={evaluation}
                dataMode={dataMode}
                reasons={evaluation.failureReasons}
                tone="rejected"
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading
          eyebrow="YOUR SPECIFICATION"
          title="What this was checked against."
        />
        <div className="mt-6">
          <SpecSummaryView spec={spec} />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/spec" scale="app" tone="secondary">
            Edit the specification
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

function PrimaryCard({
  result,
  dataMode,
}: {
  result: Recommendation;
  dataMode: DataMode;
}) {
  const primary = result.primary!;
  const cost = primary.cost;

  return (
    <Card elevation={4} className="mt-4 rounded-lg p-6 md:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <ModelIdentity evaluation={primary} dataMode={dataMode} size="lg" />
            {cost.kind === "estimated" ? (
              <div className="text-right">
                <p className="font-mono text-display-lg text-ink">
                  {formatUsd(cost.totalCost)}
                </p>
                <p className="text-caption text-mute">estimated per month</p>
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-body-sm font-medium text-ink">Why it qualifies</p>
            <div className="mt-2">
              <CheckList checks={primary.checks} only="pass" />
            </div>
          </div>

          <div>
            <p className="text-body-sm font-medium text-ink">Verified capabilities</p>
            <div className="mt-3">
              <CapabilityGrid evaluation={primary} />
            </div>
            <p className="mt-3 text-caption text-body">
              &ldquo;Unknown&rdquo; means official documentation does not state the
              answer. It is not a statement that the capability is missing.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {result.primaryFit ? <RequirementFitPanel fit={result.primaryFit} /> : null}
          {cost.kind === "estimated" ? (
            <CostBreakdown cost={cost} disclaimer={result.disclaimer} />
          ) : null}
          <PricingCaveats model={primary.model} />
        </div>
      </div>
    </Card>
  );
}

function NoCompatibleModel({ result }: { result: Recommendation }) {
  return (
    <Card tone="soft" elevation={1} className="mt-4 rounded-lg p-8">
      <h2 className="text-display-sm text-ink">
        No model in the catalog satisfies every requirement.
      </h2>
      <p className="mt-2 max-w-2xl text-body-md text-body">
        All {result.evaluatedCount} models were checked. Nothing passed, so nothing is
        recommended — inventing a &ldquo;closest match&rdquo; would defeat the point.
        The sections below show exactly what stopped each one; relaxing a mandatory
        requirement or raising the budget is usually enough.
      </p>
      <div className="mt-6">
        <Link
          href="/spec"
          className="text-body-sm text-link underline underline-offset-2 hover:text-link-deep"
        >
          Adjust the specification
        </Link>
      </div>
    </Card>
  );
}
