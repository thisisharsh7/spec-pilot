"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/*
  Form primitives on the in-app scale: 6px radius, 40px control height, hairline
  borders (DESIGN.md `form-input`). Marketing pill radii never appear here.

  Every control wires label / description / error together itself so a step can
  never accidentally ship an unlabelled input or an unannounced error.
*/

interface FieldShellProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({
  label,
  description,
  error,
  required,
  children,
}: FieldShellProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);

  const describedBy =
    [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-mute" aria-hidden>
            *
          </span>
        ) : null}
      </label>

      {description ? (
        <p id={descriptionId} className="text-caption text-body">
          {description}
        </p>
      ) : null}

      {children({ id, describedBy, invalid })}

      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-caption text-error-deep">
          <ErrorGlyph />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-sm border bg-canvas px-3 text-body-sm text-ink placeholder:text-mute " +
  "transition-colors focus-visible:border-link";

function borderFor(invalid: boolean) {
  return invalid ? "border-error" : "border-hairline";
}

export function TextInput({
  label,
  description,
  error,
  required,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label} description={description} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type="text"
          className={cn(CONTROL, borderFor(invalid), "h-10")}
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  description,
  error,
  required,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Field label={label} description={description} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          className={cn(CONTROL, borderFor(invalid), "resize-y py-2 leading-6")}
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export function NumberInput({
  label,
  description,
  error,
  value,
  onChange,
  min = 0,
  suffix,
  allowEmpty = false,
  placeholder,
}: {
  label: string;
  description?: string;
  error?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  suffix?: string;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label} description={description} error={error}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            className={cn(
              CONTROL,
              borderFor(invalid),
              "h-10",
              suffix ? "pr-16" : undefined,
            )}
            value={value === null ? "" : String(value)}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") {
                onChange(allowEmpty ? null : 0);
                return;
              }
              const parsed = Number(raw);
              onChange(Number.isFinite(parsed) ? parsed : null);
            }}
          />
          {suffix ? (
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-caption text-mute"
            >
              {suffix}
            </span>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** Multi-select and single-select cards share chrome so the wizard reads as one system. */
export function OptionCard({
  type,
  name,
  checked,
  onChange,
  title,
  description,
}: {
  type: "checkbox" | "radio";
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-sm border p-3 transition-colors",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link",
        checked
          ? "border-ink bg-canvas-soft-2"
          : "border-hairline bg-canvas hover:bg-canvas-soft",
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-ink"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-body-sm font-medium text-ink">{title}</span>
        {description ? (
          <span className="text-caption text-body">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

function ErrorGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
      <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3.25v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="8.75" r="0.85" fill="currentColor" />
    </svg>
  );
}
