/** Deterministic UTC date formatting so server and client render identically. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateUtc(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Unknown date" : DATE_FORMAT.format(date);
}

export function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Prices per million tokens need more precision than cents. */
export function formatRate(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })}`;
}
