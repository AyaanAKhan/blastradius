import type { Metadata } from "next";

import { BlastRadiusWorkspace } from "@/components/blast-radius-workspace";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Analyze a pull request",
  description: "Map a unified diff to downstream modules, exposed surfaces, related tests, and a transparent review order.",
  path: "/analyze",
});

export default function AnalyzePage() {
  return (
    <>
      <SiteHeader />
      <main className="inner-page analyzer-page">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Analyzer" }]} />
        <BlastRadiusWorkspace />
      </main>
      <SiteFooter />
    </>
  );
}
