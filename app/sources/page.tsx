import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Product research and sources",
  description: "Primary documentation used to evaluate pull-request review, impact mapping, test selection, local model integration, and structured data.",
  path: "/sources",
});

const sources = [
  {
    name: "GitHub pull-request reviews",
    claim: "GitHub supports line comments, suggested changes, approval states, file-by-file review progress, dependency review, and code-scanning signals inside pull requests.",
    takeaway: "Strong system of record and review surface; BlastRadius focuses on ordering attention across downstream code beyond the patch.",
    href: "https://docs.github.com/en/pull-requests/concepts/giving-reviews",
  },
  {
    name: "CodeSee Review Maps",
    claim: "Review Maps visualize changed files, dependency connections, and unchanged files that may be affected by a pull request.",
    takeaway: "Strong visual context; BlastRadius adds explicit ranking reasons, test evidence, and named uncertainty in a local-first demo.",
    href: "https://docs.codesee.io/docs/user-guide",
  },
  {
    name: "Codecov Impact Analysis",
    claim: "Impact Analysis uses production runtime information to mark critical changes and show impacted entry points in pull-request comments.",
    takeaway: "Stronger runtime evidence; BlastRadius works before production instrumentation and clearly labels the resulting confidence ceiling.",
    href: "https://docs.codecov.com/v4.6/docs/impact-analysis",
  },
  {
    name: "Launchable predictive test selection",
    claim: "Launchable trains on test execution history, code changes, failure correlations, and test characteristics to prioritize subsets of tests.",
    takeaway: "Stronger historical prediction; BlastRadius provides an immediate, inspectable baseline without prior test history.",
    href: "https://help.launchableinc.com/features/predictive-test-selection/how-launchable-selects-tests/",
  },
  {
    name: "Ollama API",
    claim: "Ollama exposes a local chat API that can return model output without a hosted model provider.",
    takeaway: "BlastRadius uses this only as an optional narration layer; the deterministic evidence engine remains the fallback.",
    href: "https://docs.ollama.com/api/chat",
  },
] as const;

export default function SourcesPage() {
  return (
    <>
      <SiteHeader />
      <main className="inner-page article-page sources-page">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Sources" }]} />
        <header className="article-hero">
          <p className="eyebrow">SOURCE REGISTER / CHECKED SEPTEMBER 12, 2026</p>
          <h1>Claims you can follow back to the source.</h1>
          <p>This page separates documented competitor capability from BlastRadius product decisions. It does not claim benchmark superiority, market leadership, or production accuracy.</p>
        </header>

        <section className="source-register" aria-label="Product research sources">
          {sources.map((source, index) => (
            <article key={source.name}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{source.name}</h2>
                <p>{source.claim}</p>
                <small>Design implication</small>
                <p>{source.takeaway}</p>
              </div>
              <a href={source.href} target="_blank" rel="noreferrer">Primary documentation <span aria-hidden="true">↗</span></a>
            </article>
          ))}
        </section>

        <section className="schema-note" aria-labelledby="schema-heading">
          <div>
            <p className="eyebrow">STRUCTURED DATA POLICY</p>
            <h2 id="schema-heading">Accurate schema beats checklist schema.</h2>
          </div>
          <p>This site publishes WebSite, SoftwareApplication, Organization, and BreadcrumbList data. It intentionally does not claim LocalBusiness markup because no public address, phone number, or walk-in business exists to support that claim.</p>
          <div className="schema-links">
            <a href="https://schema.org/SoftwareApplication" target="_blank" rel="noreferrer">SoftwareApplication <span aria-hidden="true">↗</span></a>
            <a href="https://schema.org/BreadcrumbList" target="_blank" rel="noreferrer">BreadcrumbList <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <nav className="next-links" aria-label="Continue exploring">
          <Link href="/method"><span>Inspect the implementation</span><b>Read the method →</b></Link>
          <Link href="/analyze"><span>Test the claim</span><b>Run the analyzer →</b></Link>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
