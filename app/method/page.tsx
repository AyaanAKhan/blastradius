import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "How the impact analysis works",
  description: "Inspect BlastRadius's deterministic diff parsing, dependency traversal, test matching, score factors, and known limitations.",
  path: "/method",
});

const factors = [
  ["Change size", "Log-scaled line churn", "+0 to +18"],
  ["Dependency fan-out", "Downstream files within three hops", "+0 to +24"],
  ["Sensitive paths", "Auth, billing, data, and permission paths", "+0 to +24"],
  ["Coverage gaps", "Sensitive dependents without matching tests", "+0 to +26"],
  ["Verification added", "Changed tests reduce review attention", "0 to −16"],
  ["Configuration reach", "Schema, lockfile, migration, or config changes", "+0 to +20"],
] as const;

export default function MethodPage() {
  return (
    <>
      <SiteHeader />
      <main className="inner-page article-page">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Method" }]} />
        <header className="article-hero">
          <p className="eyebrow">METHOD / VERSION 0.1</p>
          <h1>How the analyzer reaches a review plan.</h1>
          <p>BlastRadius deliberately separates measurable structure from generated language. The graph, score, and verification steps are deterministic; a local model may only rewrite the evidence into a shorter brief.</p>
        </header>

        <section className="method-steps" aria-labelledby="pipeline-heading">
          <h2 id="pipeline-heading">The pipeline</h2>
          <ol>
            <li><b>01</b><div><h3>Parse the patch</h3><p>Read unified diff headers, normalize paths, and count additions and deletions without treating file markers as changed lines.</p></div></li>
            <li><b>02</b><div><h3>Build a reverse graph</h3><p>Resolve relative imports from the locally extracted repository map, then invert those relationships so a changed module points to its dependents.</p></div></li>
            <li><b>03</b><div><h3>Walk the impact radius</h3><p>Traverse at most three hops, label exposed routes and workers, and match tests by path and source name.</p></div></li>
            <li><b>04</b><div><h3>Score visible factors</h3><p>Add or subtract bounded contributions. Every factor keeps its explanation so the result can be reproduced and challenged.</p></div></li>
            <li><b>05</b><div><h3>Name what is missing</h3><p>Lower confidence for unresolved and dynamic imports. Runtime behavior, ownership, and incident history stay explicit known unknowns.</p></div></li>
          </ol>
        </section>

        <section className="factor-section" aria-labelledby="factors-heading">
          <div>
            <p className="eyebrow">TRANSPARENT BY DESIGN</p>
            <h2 id="factors-heading">The score is a review queue, not a verdict.</h2>
            <p>The starting score is 14 and the final result is clamped between 5 and 96. “High” means spend more human attention. It does not mean “a bug probably exists.”</p>
          </div>
          <div className="factor-table" role="table" aria-label="Review attention score factors">
            <div role="row" className="factor-table-head"><span role="columnheader">Factor</span><span role="columnheader">Evidence</span><span role="columnheader">Range</span></div>
            {factors.map(([name, evidence, range]) => (
              <div role="row" key={name}><b role="cell">{name}</b><span role="cell">{evidence}</span><code role="cell">{range}</code></div>
            ))}
          </div>
        </section>

        <section className="architecture" aria-labelledby="architecture-heading">
          <div className="section-heading compact">
            <p className="eyebrow">SYSTEM BOUNDARY</p>
            <h2 id="architecture-heading">Source code does not need to cross the boundary.</h2>
          </div>
          <div className="architecture-flow" aria-label="Browser extracts repository structure, server scores evidence, and an optional local model writes a short brief">
            <div><small>BROWSER</small><strong>Paths + imports</strong><span>Raw files read locally</span></div>
            <i aria-hidden="true">→</i>
            <div><small>SERVER</small><strong>Evidence engine</strong><span>Validated, bounded input</span></div>
            <i aria-hidden="true">→</i>
            <div><small>OPTIONAL</small><strong>Local narration</strong><span>Summary only</span></div>
          </div>
        </section>

        <section className="limitations" aria-labelledby="limits-heading">
          <h2 id="limits-heading">MVP limits worth improving</h2>
          <ul>
            <li>Relative imports only; package aliases and cross-package workspace rules are not resolved.</li>
            <li>TypeScript, JavaScript, and Python receive lightweight parsing rather than compiler-grade AST analysis.</li>
            <li>Test matching is heuristic and does not consume coverage maps or historical failures.</li>
            <li>Runtime call paths and code ownership are absent, so confidence is intentionally capped.</li>
          </ul>
          <p>Those are not buried disclaimers. They are the roadmap: compiler adapters, coverage ingestion, runtime traces, and calibrated evaluation datasets.</p>
        </section>

        <nav className="next-links" aria-label="Continue exploring">
          <Link href="/sources"><span>Verify the comparisons</span><b>Read the sources →</b></Link>
          <Link href="/analyze"><span>Challenge the output</span><b>Run the analyzer →</b></Link>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
