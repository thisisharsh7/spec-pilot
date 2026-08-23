import type { Metadata } from "next";

import { SpecWizard } from "@/app/spec/wizard";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { DevelopmentDataBadge } from "@/components/status";
import { Container } from "@/components/ui/primitives";
import { getDataMode } from "@/lib/data/repository";

export const metadata: Metadata = {
  title: "Build your specification",
  description:
    "Answer six short steps and SpecPilot compiles a structured, machine-checkable specification for your task.",
};

export default async function SpecPage() {
  const dataMode = await getDataMode();

  return (
    <>
      <SiteNav scale="app" />

      <main className="flex-1 bg-canvas-soft">
        <Container className="py-10 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-display-lg text-ink">Describe your task.</h1>
            <DevelopmentDataBadge mode={dataMode} />
          </div>
          <p className="mt-3 max-w-2xl text-body-lg text-body">
            Six steps, no model names. SpecPilot turns your answers into a structured
            specification and checks every model in the catalog against it.
          </p>

          <div className="mt-12">
            <SpecWizard />
          </div>
        </Container>
      </main>

      <SiteFooter />
    </>
  );
}
