import type { Metadata } from "next";
import { Suspense } from "react";

import { CatalogView } from "@/app/catalog/catalog-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { DataProvenance } from "@/components/status";
import { Card, Container } from "@/components/ui/primitives";
import { DataSourceError, resolveDataSource } from "@/lib/data/repository";
import type { DataMode, NormalizedModel } from "@/lib/domain/model";

export const metadata: Metadata = {
  title: "Model catalog",
  description:
    "Every model SpecPilot knows about, with published pricing, context limits and verified capability states, each linked to the provider's own documentation.",
};

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  let models: NormalizedModel[] = [];
  let mode: DataMode = "unconfigured";
  let error: string | null = null;

  try {
    const resolved = await resolveDataSource();
    mode = resolved.mode;
    models = await resolved.repository.listModels();
  } catch (caught) {
    error =
      caught instanceof DataSourceError
        ? caught.message
        : "The model catalog could not be loaded.";
  }

  return (
    <>
      <SiteNav scale="app" />

      <main className="flex-1 bg-canvas-soft">
        <Container className="py-10 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-display-lg text-ink">Model catalog.</h1>
            <DataProvenance mode={mode} />
          </div>
          <p className="mt-3 max-w-3xl text-body-lg text-body">
            Published pricing and capability states, each linked to the provider page
            it was read from. &ldquo;Unknown&rdquo; means the documentation does not
            say — it is not a claim that a capability is missing.
          </p>

          <div className="mt-10">
            {error ? (
              <Card tone="canvas" elevation={2} className="max-w-2xl rounded-lg p-8">
                <p className="font-mono text-caption text-error-deep">NO DATA SOURCE</p>
                <p className="mt-2 text-body-md text-ink">{error}</p>
              </Card>
            ) : (
              <Suspense fallback={<p className="text-body-sm text-mute">Loading…</p>}>
                <CatalogView models={models} dataMode={mode} />
              </Suspense>
            )}
          </div>
        </Container>
      </main>

      <SiteFooter />
    </>
  );
}
