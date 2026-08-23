"use client";

import { useState } from "react";

import { Button } from "@/components/ui/primitives";
import type { TaskSpec } from "@/lib/domain/spec";
import {
  buildSpecSummary,
  summaryToJson,
  summaryToMarkdown,
} from "@/lib/domain/summary";
import { stepForField, type WizardStep } from "@/lib/domain/wizard";
import { formatInteger } from "@/lib/format";

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SpecSummaryView({
  spec,
  onEdit,
}: {
  spec: TaskSpec;
  /** Supplied by the wizard review step so each section can jump back. */
  onEdit?: (step: WizardStep) => void;
}) {
  const summary = buildSpecSummary(spec);
  const [copied, setCopied] = useState(false);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(summaryToMarkdown(summary));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const edit = (field: keyof TaskSpec) =>
    onEdit ? () => onEdit(stepForField(field)) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Button scale="app" tone="secondary" onClick={copyMarkdown}>
          {copied ? "Copied" : "Copy as Markdown"}
        </Button>
        <Button
          scale="app"
          tone="secondary"
          onClick={() =>
            download("specpilot-specification.md", summaryToMarkdown(summary), "text/markdown")
          }
        >
          Download Markdown
        </Button>
        <Button
          scale="app"
          tone="secondary"
          onClick={() =>
            download("specpilot-specification.json", summaryToJson(summary), "application/json")
          }
        >
          Download JSON
        </Button>
        <span aria-live="polite" className="sr-only">
          {copied ? "Specification copied to clipboard" : ""}
        </span>
      </div>

      <Section title="Goal" onEdit={edit("goal")}>
        <p className="text-body-md text-body">{summary.goal}</p>
      </Section>

      <Section title="Example input" onEdit={edit("exampleInput")}>
        <p className="whitespace-pre-wrap text-body-md text-body">
          {summary.exampleInput}
        </p>
      </Section>

      <Section title="Expected output" onEdit={edit("expectedOutput")}>
        <p className="whitespace-pre-wrap text-body-md text-body">
          {summary.expectedOutput}
        </p>
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="Input types" onEdit={edit("inputTypes")}>
          <TagList items={summary.inputTypes.map((type) => type.label)} />
        </Section>
        <Section title="Output types" onEdit={edit("outputTypes")}>
          <TagList items={summary.outputTypes.map((type) => type.label)} />
        </Section>
      </div>

      <Section title="Mandatory requirements" onEdit={edit("requireImageInput")}>
        <ul className="flex flex-col gap-2">
          {summary.mandatory.map((requirement) => (
            <li key={requirement.id} className="text-body-sm">
              <span className="font-medium text-ink">{requirement.label}</span>
              <span className="text-body"> — {requirement.because}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Preferred requirements">
        <TagList items={summary.preferred.map((requirement) => requirement.label)} />
      </Section>

      <Section title="Workload assumptions" onEdit={edit("requestsPerDay")}>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Row label="Requests per day" value={formatInteger(summary.workload.requestsPerDay)} />
          <Row
            label="Requests per month (30 days)"
            value={formatInteger(summary.workload.monthlyRequests)}
          />
          <Row
            label="Average input tokens"
            value={formatInteger(summary.workload.averageInputTokens)}
          />
          <Row
            label="Average output tokens"
            value={formatInteger(summary.workload.averageOutputTokens)}
          />
          <Row
            label="Effective context required"
            value={`${formatInteger(summary.workload.effectiveContextRequired)} tokens`}
          />
        </dl>
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="Budget" onEdit={edit("maxMonthlyBudgetUsd")}>
          <p className="text-body-md text-body">
            {summary.budgetUsd === null
              ? "No hard monthly ceiling set."
              : `Maximum $${formatInteger(summary.budgetUsd)} per month.`}
          </p>
          <p className="mt-1 text-body-sm text-body">
            {summary.excludedProviders.length > 0
              ? `Excluded: ${summary.excludedProviders.join(", ")}`
              : "No providers excluded."}
          </p>
        </Section>
        <Section title="Selection priority" onEdit={edit("priority")}>
          <p className="text-body-md text-body">{summary.priority.label}</p>
        </Section>
      </div>

      <div className="rounded-md bg-canvas-soft p-6 shadow-level-1">
        <p className="font-mono text-caption text-mute">GENERATED FROM YOUR ANSWERS</p>
        <p className="mt-2 text-body-sm text-body">{summary.generatedNote}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="text-body-sm font-medium text-ink">Expected failure cases</h4>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4">
              {summary.expectedFailureCases.map((item) => (
                <li key={item} className="text-body-sm text-body">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-body-sm font-medium text-ink">
              Recommended acceptance tests
            </h4>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4">
              {summary.acceptanceTests.map((item) => (
                <li key={item} className="text-body-sm text-body">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-4">
        <h3 className="font-mono text-caption text-mute">{title.toUpperCase()}</h3>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-sm text-caption text-link underline underline-offset-2 hover:text-link-deep"
          >
            Edit
            <span className="sr-only"> {title.toLowerCase()}</span>
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-body-sm text-mute">None</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full bg-canvas-soft-2 px-2 py-0.5 text-caption text-body"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-hairline py-1.5">
      <dt className="text-body-sm text-body">{label}</dt>
      <dd className="text-body-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
