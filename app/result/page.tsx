import type { Metadata } from "next";

import { ResultView } from "@/app/result/result-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Container } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Your recommendation",
  description:
    "The least expensive model that satisfies every mandatory requirement in your specification, with the cost arithmetic and the reasons every other model was passed over.",
};

export default function ResultPage() {
  return (
    <>
      <SiteNav scale="app" />

      <main className="flex-1 bg-canvas-soft">
        <Container className="py-10 md:py-16">
          <h1 className="text-display-lg text-ink">Your recommendation.</h1>
          <p className="mt-3 max-w-2xl text-body-lg text-body">
            The cheapest model that satisfies every mandatory requirement, the
            arithmetic behind the estimate, and the reason every other model was
            passed over.
          </p>

          <div className="mt-12">
            <ResultView />
          </div>
        </Container>
      </main>

      <SiteFooter />
    </>
  );
}
