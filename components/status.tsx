import type {
  CapabilityState,
  DataMode,
  Freshness,
  HealthState,
} from "@/lib/domain/model";
import { formatDateUtc } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  Status is never communicated by colour alone — every state carries an icon and
  a word. "Unknown" is styled as neutral information, not as a failure, because
  an unverified capability is not an absent one.
*/

const CAPABILITY_PRESENTATION = {
  supported: {
    label: "Supported",
    className: "bg-link-bg-soft text-link-deep",
  },
  unsupported: {
    label: "Not supported",
    className: "bg-error-soft text-error-deep",
  },
  unknown: {
    label: "Unknown",
    className: "bg-canvas-soft-2 text-body",
  },
} as const;

function keyFor(value: CapabilityState) {
  if (value === true) return "supported" as const;
  if (value === false) return "unsupported" as const;
  return "unknown" as const;
}

export function CapabilityBadge({
  value,
  label,
  className,
}: {
  value: CapabilityState;
  /** Name of the capability, announced with the state for screen readers. */
  label: string;
  className?: string;
}) {
  const key = keyFor(value);
  const presentation = CAPABILITY_PRESENTATION[key];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption",
        presentation.className,
        className,
      )}
    >
      <CapabilityGlyph state={key} />
      <span className="sr-only">{label}: </span>
      {presentation.label}
    </span>
  );
}

function CapabilityGlyph({
  state,
}: {
  state: "supported" | "unsupported" | "unknown";
}) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
      {state === "supported" ? (
        <path
          d="M2.5 6.4 5 8.9l4.5-5.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : state === "unsupported" ? (
        <path
          d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M3 6h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * Shown wherever fixture data is rendered. Deliberately blunt: it must be
 * impossible to mistake development data for a live collector result.
 */
export function DevelopmentDataBadge({
  mode,
  className,
}: {
  mode: DataMode;
  className?: string;
}) {
  if (mode !== "fixtures") return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5",
        "font-mono text-caption text-warning-deep",
        className,
      )}
    >
      <span aria-hidden>●</span>
      Development data
    </span>
  );
}

export function FreshnessNote({
  verifiedAt,
  freshness,
  className,
}: {
  verifiedAt: string;
  freshness: Freshness;
  className?: string;
}) {
  // Fixtures never get relative "verified moments ago" phrasing.
  const text =
    freshness === "fixture"
      ? `Fixture snapshot, ${formatDateUtc(verifiedAt)}`
      : `Verified ${formatDateUtc(verifiedAt)}`;

  return (
    <span className={cn("font-mono text-caption text-mute", className)}>{text}</span>
  );
}

export function EvidenceLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex items-center gap-1 text-body-sm text-link underline underline-offset-2",
        "hover:text-link-deep",
        className,
      )}
    >
      {children}
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
        <path
          d="M4.5 2.5h5v5M9.5 2.5 4 8M8 9.5H2.5V4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/*
  Collector health. Each state pairs a word with a shape, so the status never
  depends on colour alone, and "Not configured" reads as information rather than
  as a fault — nothing is broken if a collector was never set up.
*/

const HEALTH_PRESENTATION: Record<
  HealthState,
  { label: string; className: string; glyph: string }
> = {
  healthy: { label: "Healthy", className: "bg-link-bg-soft text-link-deep", glyph: "●" },
  partial: { label: "Partial", className: "bg-warning-soft text-warning-deep", glyph: "◐" },
  stale: { label: "Stale", className: "bg-warning-soft text-warning-deep", glyph: "○" },
  failed: { label: "Failed", className: "bg-error-soft text-error-deep", glyph: "✕" },
  not_configured: {
    label: "Not configured",
    className: "bg-canvas-soft-2 text-body",
    glyph: "–",
  },
};

export function HealthBadge({
  state,
  className,
}: {
  state: HealthState;
  className?: string;
}) {
  const presentation = HEALTH_PRESENTATION[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-caption",
        presentation.className,
        className,
      )}
    >
      <span aria-hidden>{presentation.glyph}</span>
      {presentation.label}
    </span>
  );
}

/** Describes where the catalog came from. Only fixtures get a warning tone. */
export function DataProvenance({
  mode,
  className,
}: {
  mode: DataMode;
  className?: string;
}) {
  const copy: Record<DataMode, string> = {
    snapshot: "Live collector data",
    supabase: "Live collector data",
    fixtures: "Development data",
    unconfigured: "No data source configured",
  };

  const tone =
    mode === "fixtures"
      ? "bg-warning-soft text-warning-deep"
      : mode === "unconfigured"
        ? "bg-error-soft text-error-deep"
        : "bg-link-bg-soft text-link-deep";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-caption",
        tone,
        className,
      )}
    >
      <span aria-hidden>●</span>
      {copy[mode]}
    </span>
  );
}
