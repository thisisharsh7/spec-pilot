import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

/*
  Primitives for the DESIGN.md component set.

  Two button scales coexist in the system and must not be mixed on one surface:
  `marketing` uses the 100px pill, `app` uses the 6px in-product radius.
*/

type ButtonTone = "primary" | "secondary" | "outline";
type ButtonScale = "marketing" | "marketing-sm" | "app";

const TONE: Record<ButtonTone, string> = {
  primary: "bg-primary text-on-primary hover:bg-ink/90",
  secondary: "bg-canvas text-ink shadow-level-2 hover:bg-canvas-soft-2",
  outline: "bg-canvas text-ink border border-hairline hover:bg-canvas-soft",
};

const SCALE: Record<ButtonScale, string> = {
  marketing: "h-12 rounded-pill px-6 text-button-lg",
  "marketing-sm": "h-9 rounded-pill px-4 text-button-md",
  app: "h-10 rounded-sm px-3 text-button-md",
};

type ButtonProps = {
  tone?: ButtonTone;
  scale?: ButtonScale;
  className?: string;
  children: ReactNode;
};

function buttonClass({
  tone = "primary",
  scale = "marketing",
  className,
}: Omit<ButtonProps, "children">) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans",
    "transition-colors disabled:pointer-events-none disabled:opacity-40",
    TONE[tone],
    SCALE[scale],
    className,
  );
}

export function Button({
  tone,
  scale,
  className,
  children,
  ...rest
}: ButtonProps & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">) {
  return (
    <button className={buttonClass({ tone, scale, className })} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  tone,
  scale,
  className,
  children,
  ...rest
}: ButtonProps & ComponentPropsWithoutRef<typeof Link>) {
  return (
    <Link
      href={href}
      className={buttonClass({ tone, scale, className })}
      {...rest}
    >
      {children}
    </Link>
  );
}

/* ── Surfaces ───────────────────────────────────────────────── */

type CardTone = "canvas" | "soft" | "ink";
type CardElevation = "flat" | 1 | 2 | 3 | 4 | 5;

const CARD_TONE: Record<CardTone, string> = {
  canvas: "bg-canvas text-ink",
  soft: "bg-canvas-soft text-ink",
  ink: "bg-primary text-on-primary",
};

const CARD_ELEVATION: Record<string, string> = {
  flat: "",
  "1": "shadow-level-1",
  "2": "shadow-level-2",
  "3": "shadow-level-3",
  "4": "shadow-level-4",
  "5": "shadow-level-5",
};

export function Card({
  tone = "canvas",
  elevation = 3,
  className,
  children,
}: {
  tone?: CardTone;
  elevation?: CardElevation;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md p-6",
        CARD_TONE[tone],
        CARD_ELEVATION[String(elevation)],
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Labels ─────────────────────────────────────────────────── */

/** Section eyebrow. Mono is the voice of the technical layer. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("font-mono text-caption text-mute", className)}>{children}</p>
  );
}

type BadgeTone = "neutral" | "info" | "warning" | "error" | "success";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-canvas-soft text-body shadow-level-1",
  info: "bg-link-bg-soft text-link-deep",
  warning: "bg-warning-soft text-warning-deep",
  error: "bg-error-soft text-error-deep",
  success: "bg-link-bg-soft text-link-deep",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption",
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The "Introducing X" announcement pill that sits above a hero. */
export function MarketingBanner({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-canvas-soft px-3 py-2",
        "text-body-sm text-body shadow-level-1 transition-colors hover:bg-canvas-soft-2",
      )}
    >
      {children}
      <span aria-hidden className="text-mute">
        &rarr;
      </span>
    </Link>
  );
}

/* ── Layout ─────────────────────────────────────────────────── */

/** Centres content at the brand's 1400px page width with 24px desktop gutters. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1400px] px-4 md:px-6", className)}>
      {children}
    </div>
  );
}
