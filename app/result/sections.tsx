"use client";

import { CapabilityBadge, EvidenceLink, FreshnessNote } from "@/components/status";
import { Card } from "@/components/ui/primitives";
import { CAPABILITY_LABELS, type CapabilityKey, type DataMode } from "@/lib/domain/model";
import { providerDisplayName } from "@/lib/domain/providers";
import type { EstimatedCost } from "@/lib/engine/cost";
import {
  UNTIERED_PRICING_ASSUMPTION,
  type ModelEvaluation,
  type RequirementCheck,
} from "@/lib/engine/filter";
import type { RequirementFit } from "@/lib/engine/fit";
import { formatInteger, formatUsd } from "@/lib/format";
import { cn } from "@/lib/cn";

const CAPABILITY_KEYS: CapabilityKey[] = [
  "supportsText",
  "supportsImages",
  "supportsAudio",
  "supportsFiles",
  "supportsTools",
  "supportsStructuredOutput",
];

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-caption text-mute">{eyebrow}</p>
      <h2 className="mt-2 text-display-md text-ink">{title}</h2>
      {description ? (
        <p className="mt-2 text-body-md text-body">{description}</p>
      ) : null}
    </div>
  );
}

export function ModelIdentity({
  evaluation,
  dataMode,
  size = "md",
}: {
  evaluation: ModelEvaluation;
  dataMode: DataMode;
  size?: "md" | "lg";
}) {
  const { model } = evaluation;

  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-caption text-mute">
        {providerDisplayName(model.provider).toUpperCase()}
      </p>
      <h3 className={size === "lg" ? "text-display-lg text-ink" : "text-display-sm text-ink"}>
        {model.displayName}
      </h3>
      <code className="font-mono text-caption text-body">{model.modelIdentifier}</code>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <FreshnessNote
          verifiedAt={model.verifiedAt}
          freshness={dataMode === "fixtures" ? "fixture" : "fresh"}
        />
        <EvidenceLink href={model.sourceUrl} className="text-caption">
          {model.sourceLabel}
        </EvidenceLink>
      </div>
    </div>
  );
}

export function CapabilityGrid({ evaluation }: { evaluation: ModelEvaluation }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {CAPABILITY_KEYS.map((key) => (
        <li key={key} className="flex items-center gap-2">
          <span className="text-caption text-body">{CAPABILITY_LABELS[key]}</span>
          <CapabilityBadge value={evaluation.model[key]} label={CAPABILITY_LABELS[key]} />
        </li>
      ))}
    </ul>
  );
}

export function CheckList({
  checks,
  only,
}: {
  checks: RequirementCheck[];
  only?: RequirementCheck["state"];
}) {
  const visible = only ? checks.filter((check) => check.state === only) : checks;
  if (visible.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {visible.map((check) => (
        <li key={check.requirementId} className="flex items-start gap-2">
          <StateGlyph state={check.state} />
          <span className="text-body-sm">
            <span className="font-medium text-ink">{check.label}</span>
            <span className="text-body"> — {check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function StateGlyph({ state }: { state: RequirementCheck["state"] }) {
  const tone =
    state === "pass"
      ? "text-link-deep"
      : state === "fail"
        ? "text-error-deep"
        : state === "assumed"
          ? "text-warning-deep"
          : "text-mute";
  const label =
    state === "pass"
      ? "Met"
      : state === "fail"
        ? "Not met"
        : state === "assumed"
          ? "Assumed"
          : "Cannot verify";

  return (
    <span className={cn("mt-0.5 shrink-0", tone)}>
      <span className="sr-only">{label}: </span>
      <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden focusable="false">
        {state === "pass" ? (
          <path d="M2.5 6.4 5 8.9l4.5-5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : state === "fail" ? (
          <path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        ) : state === "assumed" ? (
          // Hollow diamond: satisfied, but on an assumption rather than evidence.
          <path d="M6 2.2 9.8 6 6 9.8 2.2 6Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        ) : (
          <path d="M3 6h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

export function RequirementFitPanel({ fit }: { fit: RequirementFit }) {
  return (
    <div className="rounded-md bg-canvas-soft p-4 shadow-level-1">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-body-sm font-medium text-ink">Requirement fit</p>
        <p className="font-mono text-display-sm text-ink">{fit.score}%</p>
      </div>
      <p className="mt-1 text-caption text-body">
        How completely this model matches your specification. Not a quality,
        benchmark or accuracy score. Mandatory criteria are weighted 3, preferences 1
        — {fit.earnedWeight} of {fit.totalWeight} points earned.
      </p>
      {fit.assumedCount > 0 ? (
        <p className="mt-1 text-caption text-warning-deep">
          {fit.assumedCount} {fit.assumedCount === 1 ? "criterion is" : "criteria are"}{" "}
          satisfied on a stated assumption, not on published evidence. Marked
          &ldquo;assumed&rdquo; below.
        </p>
      ) : null}

      <ul className="mt-4 flex flex-col gap-1.5">
        {fit.criteria.map((criterion) => (
          <li
            key={`${criterion.kind}-${criterion.id}`}
            className="flex items-center justify-between gap-3 border-b border-hairline pb-1.5 last:border-0"
          >
            <span className="flex items-center gap-2 text-caption text-body">
              <StateGlyph state={criterion.state} />
              {criterion.label}
            </span>
            <span className="font-mono text-caption text-mute">
              {criterion.kind === "mandatory" ? "required" : "preferred"} ·{" "}
              {criterion.state === "assumed"
                ? `assumed +${criterion.weight}`
                : criterion.state === "pass"
                  ? `+${criterion.weight}`
                  : "0"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Pricing caveats a reader must see before trusting the number: prose the
 * provider published that we deliberately did not act on, and the assumption we
 * made when no context tier was documented.
 */
export function PricingCaveats({ model }: { model: ModelEvaluation["model"] }) {
  const caveats = [...model.pricingWarnings];

  if (model.pricingValidUpToContext === null) {
    caveats.push(UNTIERED_PRICING_ASSUMPTION);
  } else if (
    model.contextWindow !== null &&
    model.pricingValidUpToContext < model.contextWindow
  ) {
    caveats.push(
      `The published rate is valid to ${formatInteger(model.pricingValidUpToContext)} tokens; this model's window reaches ${formatInteger(model.contextWindow)}, where a higher tier applies.`,
    );
  }

  if (caveats.length === 0) return null;

  return (
    <div className="rounded-md bg-warning-soft p-4">
      <p className="font-mono text-caption text-warning-deep">PRICING CAVEATS</p>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4">
        {caveats.map((caveat) => (
          <li key={caveat} className="text-body-sm text-warning-deep">
            {caveat}
          </li>
        ))}
      </ul>
      {model.pricingNote ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-caption text-warning-deep">
            Provider&rsquo;s exact wording
          </summary>
          <p className="mt-2 text-caption text-warning-deep">{model.pricingNote}</p>
        </details>
      ) : null}

      {/* The assumption must always sit next to the page it was made about. */}
      <p className="mt-3">
        <EvidenceLink href={model.sourceUrl} className="text-caption">
          Check on {model.sourceLabel}
        </EvidenceLink>
      </p>
    </div>
  );
}

export function CostBreakdown({
  cost,
  disclaimer,
}: {
  cost: EstimatedCost;
  disclaimer: string;
}) {
  const rows: [string, string][] = [
    ["Monthly requests", formatInteger(cost.monthlyRequests)],
    ["Monthly input tokens", formatInteger(cost.monthlyInputTokens)],
    ["Monthly output tokens", formatInteger(cost.monthlyOutputTokens)],
    ["Input cost", formatUsd(cost.inputCost)],
    ["Output cost", formatUsd(cost.outputCost)],
  ];

  return (
    <div>
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">Estimated monthly cost breakdown</caption>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-hairline">
              <th scope="row" className="py-2 text-left font-normal text-body">
                {label}
              </th>
              <td className="py-2 text-right font-mono text-ink">{value}</td>
            </tr>
          ))}
          <tr className="border-b-2 border-ink">
            <th scope="row" className="py-3 text-left text-body-sm font-medium text-ink">
              Estimated total
            </th>
            <td className="py-3 text-right font-mono text-display-sm text-ink">
              {formatUsd(cost.totalCost)}
              <span className="ml-1 text-caption text-mute">/ month</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 text-caption text-body">{disclaimer}</p>
    </div>
  );
}

export function ExcludedModelCard({
  evaluation,
  dataMode,
  reasons,
  monthlyCost,
  tone,
}: {
  evaluation: ModelEvaluation;
  dataMode: DataMode;
  reasons: string[];
  monthlyCost?: number;
  tone: "rejected" | "unverifiable" | "unpriced";
}) {
  const heading =
    tone === "rejected"
      ? "Why it was rejected"
      : tone === "unverifiable"
        ? "What could not be verified"
        : "Why it could not be priced";

  return (
    <Card tone="canvas" elevation={2} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModelIdentity evaluation={evaluation} dataMode={dataMode} />
        {monthlyCost !== undefined ? (
          <div className="text-right">
            <p className="font-mono text-display-sm text-ink">{formatUsd(monthlyCost)}</p>
            <p className="text-caption text-mute">per month</p>
          </div>
        ) : null}
      </div>

      <div>
        <p className="text-body-sm font-medium text-ink">{heading}</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
          {reasons.map((reason) => (
            <li key={reason} className="text-body-sm text-body">
              {reason}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
