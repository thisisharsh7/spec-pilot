"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { NumberInput, OptionCard, TextInput } from "@/components/ui/form";
import { CapabilityBadge, EvidenceLink } from "@/components/status";
import { Button, Card } from "@/components/ui/primitives";
import type { CapabilityState, DataMode, NormalizedModel } from "@/lib/domain/model";
import { providerDisplayName, PROVIDERS } from "@/lib/domain/providers";
import { formatDateUtc, formatInteger, formatRate } from "@/lib/format";

/*
  Catalog with filter state in the URL, so a filtered view is linkable and
  survives a reload.

  A table at >=768px, stacked cards below. A nine-column price table on a phone is
  unreadable, so the small-screen layout is a different component, not a squeezed
  version of the same one.
*/

type CapabilityFilter = "any" | "yes";

interface Filters {
  q: string;
  provider: string;
  maxInput: number | null;
  maxOutput: number | null;
  minContext: number | null;
  images: CapabilityFilter;
  tools: CapabilityFilter;
  structured: CapabilityFilter;
}

function readFilters(params: URLSearchParams): Filters {
  const num = (key: string) => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const cap = (key: string): CapabilityFilter =>
    params.get(key) === "yes" ? "yes" : "any";

  return {
    q: params.get("q") ?? "",
    provider: params.get("provider") ?? "all",
    maxInput: num("maxInput"),
    maxOutput: num("maxOutput"),
    minContext: num("minContext"),
    images: cap("images"),
    tools: cap("tools"),
    structured: cap("structured"),
  };
}

function matches(model: NormalizedModel, filters: Filters): boolean {
  if (filters.provider !== "all" && model.provider !== filters.provider) return false;

  if (filters.q.trim()) {
    const needle = filters.q.trim().toLowerCase();
    const haystack = `${model.modelIdentifier} ${model.displayName}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  // A null price cannot be shown to satisfy a price ceiling.
  if (filters.maxInput !== null) {
    if (model.inputPricePerMillion === null) return false;
    if (model.inputPricePerMillion > filters.maxInput) return false;
  }
  if (filters.maxOutput !== null) {
    if (model.outputPricePerMillion === null) return false;
    if (model.outputPricePerMillion > filters.maxOutput) return false;
  }
  if (filters.minContext !== null) {
    if (model.contextWindow === null) return false;
    if (model.contextWindow < filters.minContext) return false;
  }

  // "Supported only" means verified true. Unknown is excluded but never called
  // unsupported.
  if (filters.images === "yes" && model.supportsImages !== true) return false;
  if (filters.tools === "yes" && model.supportsTools !== true) return false;
  if (filters.structured === "yes" && model.supportsStructuredOutput !== true) {
    return false;
  }

  return true;
}

export function CatalogView({
  models,
  dataMode,
}: {
  models: NormalizedModel[];
  dataMode: DataMode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const filters = useMemo(() => readFilters(new URLSearchParams(params)), [params]);

  function update(patch: Partial<Filters>) {
    const next = new URLSearchParams(params);

    const set = (key: string, value: string | number | null) => {
      if (value === null || value === "" || value === "all" || value === "any") {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    };

    if ("q" in patch) set("q", patch.q ?? "");
    if ("provider" in patch) set("provider", patch.provider ?? "all");
    if ("maxInput" in patch) set("maxInput", patch.maxInput ?? null);
    if ("maxOutput" in patch) set("maxOutput", patch.maxOutput ?? null);
    if ("minContext" in patch) set("minContext", patch.minContext ?? null);
    if ("images" in patch) set("images", patch.images ?? "any");
    if ("tools" in patch) set("tools", patch.tools ?? "any");
    if ("structured" in patch) set("structured", patch.structured ?? "any");

    const query = next.toString();
    router.replace(query ? `/catalog?${query}` : "/catalog", { scroll: false });
  }

  const visible = models.filter((model) => matches(model, filters));
  const isFiltered = params.toString().length > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <aside>
        <h2 className="font-mono text-caption text-mute">FILTERS</h2>

        <div className="mt-4 flex flex-col gap-5">
          <TextInput
            label="Search"
            placeholder="Model name or id"
            value={filters.q}
            onChange={(q) => update({ q })}
          />

          <fieldset>
            <legend className="text-body-sm font-medium text-ink">Provider</legend>
            <div className="mt-2 flex flex-col gap-2">
              <OptionCard
                type="radio"
                name="provider"
                checked={filters.provider === "all"}
                onChange={() => update({ provider: "all" })}
                title="All providers"
              />
              {PROVIDERS.map((provider) => (
                <OptionCard
                  key={provider.slug}
                  type="radio"
                  name="provider"
                  checked={filters.provider === provider.slug}
                  onChange={() => update({ provider: provider.slug })}
                  title={provider.displayName}
                />
              ))}
            </div>
          </fieldset>

          <NumberInput
            label="Max input price"
            description="USD per 1M tokens."
            suffix="USD"
            allowEmpty
            placeholder="Any"
            value={filters.maxInput}
            onChange={(maxInput) => update({ maxInput })}
          />
          <NumberInput
            label="Max output price"
            description="USD per 1M tokens."
            suffix="USD"
            allowEmpty
            placeholder="Any"
            value={filters.maxOutput}
            onChange={(maxOutput) => update({ maxOutput })}
          />
          <NumberInput
            label="Minimum context"
            suffix="tokens"
            allowEmpty
            placeholder="Any"
            value={filters.minContext}
            onChange={(minContext) => update({ minContext })}
          />

          <fieldset>
            <legend className="text-body-sm font-medium text-ink">
              Verified capabilities
            </legend>
            <p className="mt-1 text-caption text-body">
              Shows only models where the capability is confirmed. Models whose
              documentation is silent are excluded, not marked unsupported.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <OptionCard
                type="checkbox"
                checked={filters.images === "yes"}
                onChange={(on) => update({ images: on ? "yes" : "any" })}
                title="Image input"
              />
              <OptionCard
                type="checkbox"
                checked={filters.tools === "yes"}
                onChange={(on) => update({ tools: on ? "yes" : "any" })}
                title="Tool calling"
              />
              <OptionCard
                type="checkbox"
                checked={filters.structured === "yes"}
                onChange={(on) => update({ structured: on ? "yes" : "any" })}
                title="Structured output"
              />
            </div>
          </fieldset>

          {isFiltered ? (
            <Button
              scale="app"
              tone="secondary"
              onClick={() => router.replace("/catalog", { scroll: false })}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </aside>

      <div>
        <p aria-live="polite" className="font-mono text-caption text-mute">
          {visible.length} OF {models.length} MODELS
        </p>

        {visible.length === 0 ? (
          <Card tone="soft" elevation={1} className="mt-4 rounded-lg p-10 text-center">
            <p className="text-display-sm text-ink">No model matches these filters.</p>
            <p className="mt-2 text-body-md text-body">
              Try relaxing a price ceiling or a capability requirement.
            </p>
          </Card>
        ) : (
          <>
            <CatalogTable models={visible} dataMode={dataMode} />
            <CatalogCards models={visible} dataMode={dataMode} />
          </>
        )}
      </div>
    </div>
  );
}

/* ── Desktop table ──────────────────────────────────────────── */

function CatalogTable({
  models,
  dataMode,
}: {
  models: NormalizedModel[];
  dataMode: DataMode;
}) {
  return (
    <div className="mt-4 hidden overflow-x-auto rounded-md bg-canvas shadow-level-2 md:block">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">
          Model catalog with pricing, context and verified capabilities
        </caption>
        <thead>
          <tr className="bg-canvas-soft">
            {[
              "Provider",
              "Model",
              "Input",
              "Cached in",
              "Output",
              "Context",
              "Max out",
              "Capabilities",
              "Evidence",
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="whitespace-nowrap px-3 py-2 text-left font-mono text-caption font-normal text-mute"
              >
                {heading.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.modelIdentifier} className="border-t border-hairline">
              <td className="px-3 py-3 text-body">
                {providerDisplayName(model.provider)}
              </td>
              <td className="px-3 py-3">
                <span className="block font-medium text-ink">{model.displayName}</span>
                <code className="font-mono text-caption text-body">
                  {model.modelIdentifier}
                </code>
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-ink">
                {formatRate(model.inputPricePerMillion)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-body">
                {formatRate(model.cachedInputPricePerMillion)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-ink">
                {formatRate(model.outputPricePerMillion)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-body">
                {model.contextWindow === null ? "—" : formatInteger(model.contextWindow)}
                {model.pricingValidUpToContext !== null &&
                model.contextWindow !== null &&
                model.pricingValidUpToContext < model.contextWindow ? (
                  <span
                    className="ml-1 text-caption text-warning-deep"
                    title={`Quoted rate valid to ${formatInteger(model.pricingValidUpToContext)} tokens`}
                  >
                    tiered
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-body">
                {model.maxOutputTokens === null
                  ? "—"
                  : formatInteger(model.maxOutputTokens)}
              </td>
              <td className="px-3 py-3">
                <CapabilityRow model={model} />
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                <EvidenceLink href={model.sourceUrl} className="text-caption">
                  Source
                </EvidenceLink>
                <span className="mt-0.5 block font-mono text-caption text-mute">
                  {dataMode === "fixtures" ? "fixture " : ""}
                  {formatDateUtc(model.verifiedAt)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Mobile cards ───────────────────────────────────────────── */

function CatalogCards({
  models,
  dataMode,
}: {
  models: NormalizedModel[];
  dataMode: DataMode;
}) {
  return (
    <ul className="mt-4 flex flex-col gap-3 md:hidden">
      {models.map((model) => (
        <li key={model.modelIdentifier}>
          <Card tone="canvas" elevation={2}>
            <p className="font-mono text-caption text-mute">
              {providerDisplayName(model.provider).toUpperCase()}
            </p>
            <h3 className="mt-1 text-display-sm text-ink">{model.displayName}</h3>
            <code className="font-mono text-caption text-body">
              {model.modelIdentifier}
            </code>

            <dl className="mt-4 flex flex-col gap-2">
              <Row label="Input" value={formatRate(model.inputPricePerMillion)} />
              <Row
                label="Cached input"
                value={formatRate(model.cachedInputPricePerMillion)}
              />
              <Row label="Output" value={formatRate(model.outputPricePerMillion)} />
              <Row
                label="Context"
                value={
                  model.contextWindow === null
                    ? "—"
                    : formatInteger(model.contextWindow)
                }
              />
              <Row
                label="Max output"
                value={
                  model.maxOutputTokens === null
                    ? "—"
                    : formatInteger(model.maxOutputTokens)
                }
              />
            </dl>

            {model.pricingValidUpToContext !== null &&
            model.contextWindow !== null &&
            model.pricingValidUpToContext < model.contextWindow ? (
              <p className="mt-3 rounded-sm bg-warning-soft px-2 py-1.5 text-caption text-warning-deep">
                Quoted rate valid to{" "}
                {formatInteger(model.pricingValidUpToContext)} tokens.
              </p>
            ) : null}

            <div className="mt-4">
              <CapabilityRow model={model} />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <EvidenceLink href={model.sourceUrl} className="text-caption">
                Official source
              </EvidenceLink>
              <span className="font-mono text-caption text-mute">
                {dataMode === "fixtures" ? "fixture " : ""}
                {formatDateUtc(model.verifiedAt)}
              </span>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

const CAPABILITY_COLUMNS: { key: keyof NormalizedModel; label: string }[] = [
  { key: "supportsImages", label: "Image input" },
  { key: "supportsTools", label: "Tool calling" },
  { key: "supportsStructuredOutput", label: "Structured output" },
  { key: "supportsFiles", label: "Document input" },
  { key: "supportsAudio", label: "Audio input" },
];

function CapabilityRow({ model }: { model: NormalizedModel }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {CAPABILITY_COLUMNS.map(({ key, label }) => (
        <li key={key}>
          <CapabilityBadge value={model[key] as CapabilityState} label={label} />
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-hairline pb-1.5">
      <dt className="text-body-sm text-body">{label}</dt>
      <dd className="font-mono text-body-sm text-ink">{value}</dd>
    </div>
  );
}
