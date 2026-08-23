import Link from "next/link";

import { Container } from "@/components/ui/primitives";

const COLUMNS = [
  {
    label: "PRODUCT",
    links: [
      { href: "/spec", label: "Find my model" },
      { href: "/catalog", label: "Model catalog" },
      { href: "/#how-it-works", label: "How it works" },
    ],
  },
  {
    label: "DATA",
    links: [
      { href: "/catalog", label: "Model catalog" },
      { href: "/sources", label: "Data sources" },
      { href: "/sources", label: "Collector health" },
    ],
  },
  {
    // Scope is two providers. These are the canonical URLs that actually resolve:
    // openai.com/api/pricing/ is bot-blocked to non-browser clients, and the
    // Anthropic docs host now redirects to platform.claude.com.
    label: "PROVIDERS",
    links: [
      {
        href: "https://developers.openai.com/api/docs/models",
        label: "OpenAI models",
      },
      {
        href: "https://platform.claude.com/docs/en/about-claude/models/overview",
        label: "Anthropic models",
      },
    ],
  },
  {
    label: "PROJECT",
    links: [
      { href: "/#about", label: "About" },
      { href: "https://brightdata.com/products/web-scraper", label: "Bright Data" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-canvas">
      <Container className="py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <p className="text-body-md font-semibold tracking-[-0.4px] text-ink">
              SpecPilot
            </p>
            <p className="mt-2 max-w-56 text-body-sm text-body">
              The cheapest AI model that can actually do your job.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.label}>
              <p className="font-mono text-caption text-mute">{column.label}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link, i) => (
                  <li key={`${link.href}-${i}`}>
                    <Link
                      href={link.href}
                      className="text-body-sm text-body transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-2 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-mute">
            SpecPilot is a free, open hackathon project. Not affiliated with any model
            provider.
          </p>
          <p className="font-mono text-caption text-mute">
            Pricing sourced from official provider documentation.
          </p>
        </div>
      </Container>
    </footer>
  );
}
