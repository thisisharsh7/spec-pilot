"use client";

import Link from "next/link";
import { useState } from "react";

import { ButtonLink } from "@/components/ui/primitives";

/*
  Sticky 64px nav. `scale` picks which of the two button radii the surface uses —
  marketing pages stay on the 100px pill, in-app pages on the 6px radius.
  DESIGN.md: never mix the two scales on one screen.
*/

const LINKS = [
  { href: "/catalog", label: "Model catalog" },
  { href: "/sources", label: "Data sources" },
  { href: "/#how-it-works", label: "How it works" },
];

export function SiteNav({ scale = "marketing" }: { scale?: "marketing" | "app" }) {
  // Every item in the mobile panel closes it on click, so no navigation effect
  // is needed to keep this in sync.
  const [open, setOpen] = useState(false);

  const ctaScale = scale === "marketing" ? "marketing-sm" : "app";

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-6 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Mark />
          <span className="text-body-md font-semibold tracking-[-0.4px] text-ink">
            SpecPilot
          </span>
        </Link>

        <ul className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="rounded-full px-3 py-2 text-body-sm text-body transition-colors hover:bg-canvas-soft-2 hover:text-ink"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {/* Wrapper does the hiding: a `hidden` on the button itself loses to the
              base `inline-flex`, which Tailwind emits later in the stylesheet. */}
          <div className="hidden sm:block">
            <ButtonLink href="/spec" tone="primary" scale={ctaScale}>
              Find my model
            </ButtonLink>
          </div>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full border border-hairline bg-canvas text-ink md:hidden"
          >
            <Glyph open={open} />
          </button>
        </div>
      </nav>

      {open ? (
        <div className="border-t border-hairline bg-canvas px-4 pb-6 pt-2 md:hidden">
          <ul className="flex flex-col">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block py-3 text-body-md text-ink"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <ButtonLink
            href="/spec"
            scale="marketing"
            className="mt-2 w-full"
            onClick={() => setOpen(false)}
          >
            Find my model
          </ButtonLink>
        </div>
      ) : null}
    </header>
  );
}

function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden focusable="false">
      <path d="M10 1.5 18.5 17H1.5L10 1.5Z" fill="currentColor" className="text-ink" />
      <path d="M10 8.5 14.2 16H5.8L10 8.5Z" fill="var(--color-canvas)" />
    </svg>
  );
}

function Glyph({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden focusable="false">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {open ? (
          <>
            <line x1="3.5" y1="3.5" x2="12.5" y2="12.5" />
            <line x1="12.5" y1="3.5" x2="3.5" y2="12.5" />
          </>
        ) : (
          <>
            <line x1="2.5" y1="5" x2="13.5" y2="5" />
            <line x1="2.5" y1="11" x2="13.5" y2="11" />
          </>
        )}
      </g>
    </svg>
  );
}
