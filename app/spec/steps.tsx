"use client";

import { NumberInput, OptionCard, TextArea } from "@/components/ui/form";
import { PROVIDERS } from "@/lib/domain/providers";
import {
  INPUT_TYPES,
  INPUT_TYPE_LABELS,
  OUTPUT_TYPES,
  OUTPUT_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_NOTE,
  type InputType,
  type OutputType,
  type Priority,
  type TaskSpec,
} from "@/lib/domain/spec";
import type { StepErrors } from "@/lib/domain/wizard";

export interface StepProps {
  spec: TaskSpec;
  errors: StepErrors;
  patch: (patch: Partial<TaskSpec>) => void;
}

const INPUT_HINTS: Record<InputType, string> = {
  text: "Plain text, transcripts, chat messages, source code.",
  images: "Photos, screenshots, scans, charts.",
  audio: "Recordings or speech the model must listen to directly.",
  files: "PDFs and documents uploaded whole rather than pasted as text.",
};

const OUTPUT_HINTS: Record<OutputType, string> = {
  free_text: "Prose with no fixed shape.",
  json: "Strict JSON matching a schema you define.",
  classification: "One label from a fixed set.",
  extraction: "Named fields pulled out of the input.",
  code: "Source code in a specific language.",
  tool_calls: "Calls to functions or tools you expose.",
  long_form: "Reports, articles or documents of substantial length.",
};

const PRIORITY_HINTS: Record<Priority, string> = {
  lowest_cost: "Default. The cheapest compatible model wins.",
  largest_context: "At equal cost, prefer the biggest verified context window.",
  most_capabilities: "At equal cost, prefer the most verified capabilities.",
  freshest_evidence: "At equal cost, prefer the most recently verified record.",
};

/* ── Step 1 ─────────────────────────────────────────────────── */

export function TaskStep({ spec, errors, patch }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <TextArea
        label="What should the model do?"
        description="One or two sentences. Describe the job, not the model."
        placeholder="Extract vendor name, invoice total and due date from scanned invoices and return strict JSON."
        required
        rows={3}
        value={spec.goal}
        error={errors.goal}
        onChange={(goal) => patch({ goal })}
      />
      <TextArea
        label="Provide an example input"
        description="A representative sample. It never leaves your browser."
        placeholder="A scanned PDF invoice from a supplier, roughly one page."
        required
        rows={3}
        value={spec.exampleInput}
        error={errors.exampleInput}
        onChange={(exampleInput) => patch({ exampleInput })}
      />
      <TextArea
        label="Describe the expected output"
        description="What a correct answer looks like."
        placeholder='{ "vendor": "Acme Ltd", "total": 1240.50, "dueDate": "2026-09-30" }'
        required
        rows={3}
        value={spec.expectedOutput}
        error={errors.expectedOutput}
        onChange={(expectedOutput) => patch({ expectedOutput })}
      />
    </div>
  );
}

/* ── Step 2 ─────────────────────────────────────────────────── */

export function InputStep({ spec, errors, patch }: StepProps) {
  const toggle = (type: InputType, checked: boolean) => {
    const next = checked
      ? [...spec.inputTypes, type]
      : spec.inputTypes.filter((value) => value !== type);
    patch({ inputTypes: next });
  };

  return (
    <fieldset>
      <legend className="text-body-sm font-medium text-ink">
        What will you send the model?
      </legend>
      <p className="mt-1 text-caption text-body">
        Select every type that applies — choosing more than one describes mixed input.
        Each selection becomes a mandatory requirement.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {INPUT_TYPES.map((type) => (
          <OptionCard
            key={type}
            type="checkbox"
            checked={spec.inputTypes.includes(type)}
            onChange={(checked) => toggle(type, checked)}
            title={INPUT_TYPE_LABELS[type]}
            description={INPUT_HINTS[type]}
          />
        ))}
      </div>

      {errors.inputTypes ? (
        <p role="alert" className="mt-3 text-caption text-error-deep">
          {errors.inputTypes}
        </p>
      ) : null}
    </fieldset>
  );
}

/* ── Step 3 ─────────────────────────────────────────────────── */

export function OutputStep({ spec, errors, patch }: StepProps) {
  const toggle = (type: OutputType, checked: boolean) => {
    const next = checked
      ? [...spec.outputTypes, type]
      : spec.outputTypes.filter((value) => value !== type);
    patch({ outputTypes: next });
  };

  return (
    <fieldset>
      <legend className="text-body-sm font-medium text-ink">
        What should come back?
      </legend>
      <p className="mt-1 text-caption text-body">
        Strict JSON and tool calls become mandatory capability requirements. The
        others are treated as preferences, so a model that could do the job is not
        rejected for lacking a formal mode.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OUTPUT_TYPES.map((type) => (
          <OptionCard
            key={type}
            type="checkbox"
            checked={spec.outputTypes.includes(type)}
            onChange={(checked) => toggle(type, checked)}
            title={OUTPUT_TYPE_LABELS[type]}
            description={OUTPUT_HINTS[type]}
          />
        ))}
      </div>

      {errors.outputTypes ? (
        <p role="alert" className="mt-3 text-caption text-error-deep">
          {errors.outputTypes}
        </p>
      ) : null}
    </fieldset>
  );
}

/* ── Step 4 ─────────────────────────────────────────────────── */

export function WorkloadStep({ spec, errors, patch }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body-sm text-body">
        These are estimates, not commitments. Every figure is editable and the
        result page shows exactly how each one enters the cost calculation.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <NumberInput
          label="Requests per day"
          description="Multiplied by 30 for the monthly projection."
          min={1}
          value={spec.requestsPerDay}
          error={errors.requestsPerDay}
          onChange={(value) => patch({ requestsPerDay: value ?? 0 })}
        />
        <NumberInput
          label="Maximum context required"
          description="The largest prompt you expect to send, in tokens."
          min={1}
          suffix="tokens"
          value={spec.maximumContextRequired}
          error={errors.maximumContextRequired}
          onChange={(value) => patch({ maximumContextRequired: value ?? 0 })}
        />
        <NumberInput
          label="Average input tokens"
          description="Roughly 750 words per 1,000 tokens."
          min={1}
          suffix="tokens"
          value={spec.averageInputTokens}
          error={errors.averageInputTokens}
          onChange={(value) => patch({ averageInputTokens: value ?? 0 })}
        />
        <NumberInput
          label="Average output tokens"
          description="Output is usually billed at a higher rate than input."
          min={1}
          suffix="tokens"
          value={spec.averageOutputTokens}
          error={errors.averageOutputTokens}
          onChange={(value) => patch({ averageOutputTokens: value ?? 0 })}
        />
      </div>
    </div>
  );
}

/* ── Step 5 ─────────────────────────────────────────────────── */

export function RequirementsStep({ spec, errors, patch }: StepProps) {
  const toggleProvider = (slug: string, excluded: boolean) => {
    const next = excluded
      ? [...spec.excludedProviders, slug]
      : spec.excludedProviders.filter((value) => value !== slug);
    patch({ excludedProviders: next });
  };

  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="text-body-sm font-medium text-ink">
          Non-negotiable capabilities
        </legend>
        <p className="mt-1 text-caption text-body">
          A model is only recommended when official documentation confirms these.
          Where documentation is silent, the model is set aside as unverifiable
          rather than rejected.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <OptionCard
            type="checkbox"
            checked={spec.requireImageInput}
            onChange={(requireImageInput) => patch({ requireImageInput })}
            title="Image input is mandatory"
          />
          <OptionCard
            type="checkbox"
            checked={spec.requireToolUse}
            onChange={(requireToolUse) => patch({ requireToolUse })}
            title="Tool use is mandatory"
          />
          <OptionCard
            type="checkbox"
            checked={spec.requireStructuredOutput}
            onChange={(requireStructuredOutput) => patch({ requireStructuredOutput })}
            title="Structured output is mandatory"
          />
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <NumberInput
          label="Minimum context window"
          description="A floor beyond your workload. Leave at 0 for no extra floor."
          min={0}
          suffix="tokens"
          value={spec.minimumContextWindow}
          error={errors.minimumContextWindow}
          onChange={(value) => patch({ minimumContextWindow: value ?? 0 })}
        />
        <NumberInput
          label="Maximum monthly budget"
          description="A hard ceiling. Leave blank for no limit."
          min={0}
          suffix="USD"
          allowEmpty
          placeholder="No limit"
          value={spec.maxMonthlyBudgetUsd}
          error={errors.maxMonthlyBudgetUsd}
          onChange={(value) => patch({ maxMonthlyBudgetUsd: value })}
        />
      </div>

      <fieldset>
        <legend className="text-body-sm font-medium text-ink">
          Excluded providers
        </legend>
        <p className="mt-1 text-caption text-body">
          Rule out a provider entirely, for procurement or data-residency reasons.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((provider) => (
            <OptionCard
              key={provider.slug}
              type="checkbox"
              checked={spec.excludedProviders.includes(provider.slug)}
              onChange={(checked) => toggleProvider(provider.slug, checked)}
              title={`Exclude ${provider.displayName}`}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/* ── Step 6 ─────────────────────────────────────────────────── */

export function PriorityStep({ spec, patch }: StepProps) {
  return (
    <fieldset>
      <legend className="text-body-sm font-medium text-ink">
        What should decide a tie?
      </legend>
      <p className="mt-1 text-caption text-body">{PRIORITY_NOTE}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PRIORITIES.map((priority) => (
          <OptionCard
            key={priority}
            type="radio"
            name="priority"
            checked={spec.priority === priority}
            onChange={() => patch({ priority })}
            title={PRIORITY_LABELS[priority]}
            description={PRIORITY_HINTS[priority]}
          />
        ))}
      </div>
    </fieldset>
  );
}
