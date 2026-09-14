import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "How the impact analysis works",
  description: "Inspect BlastRadius's deterministic diff parsing, dependency traversal, test matching, ranking policy, and known limitations.",
  path: "/method",
});

const factors = [
  ["Uncovered sensitive path", "Sensitive downstream file without test evidence", "First"],
  ["Sensitive changed path", "Auth, billing, security, or permission path", "Second"],
  ["Configuration reach", "Schema, lockfile, migration, or config change", "Third"],
  ["Other changed path", "Directly modified implementation file", "Fourth"],
  ["Exposed surface", "Route, page, worker, controller, or handler", "Fifth"],
  ["Other dependent", "Downstream file reached within three hops", "Sixth"],
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
          <p>BlastRadius deliberately separates measurable structure from generated language. The graph, review order, and verification steps are deterministic; a local model may only rewrite the evidence into a shorter brief.</p>
        </header>

        <section className="method-steps" aria-labelledby="pipeline-heading">
          <h2 id="pipeline-heading">The pipeline</h2>
          <ol>
            <li><b>01</b><div><h3>Parse the patch</h3><p>Read unified diff headers, normalize paths, and count additions and deletions without treating file markers as changed lines.</p></div></li>
            <li><b>02</b><div><h3>Build a reverse graph</h3><p>Resolve relative, configured alias, and base URL imports from the locally extracted repository map, then invert those relationships so a changed module points to its dependents.</p></div></li>
            <li><b>03</b><div><h3>Walk the impact radius</h3><p>Traverse at most three hops, label exposed routes and workers, and match tests by path and source name.</p></div></li>
            <li><b>04</b><div><h3>Rank visible evidence</h3><p>Apply a published ordinal policy. Every target keeps its reasons so the result can be reproduced and challenged without an uncalibrated number.</p></div></li>
            <li><b>05</b><div><h3>Name what is missing</h3><p>Lower confidence for unresolved and dynamic imports. Runtime behavior, ownership, and incident history stay explicit known unknowns.</p></div></li>
          </ol>
        </section>

        <section className="factor-section" aria-labelledby="factors-heading">
          <div>
            <p className="eyebrow">TRANSPARENT BY DESIGN</p>
            <h2 id="factors-heading">The output is an ordinal queue, not a verdict.</h2>
            <p>Version <code>rank-v1</code> orders files by visible evidence. It does not publish a probability or severity band before those values can be calibrated against real review outcomes.</p>
          </div>
          <div className="factor-table" role="table" aria-label="Review ordering policy">
            <div role="row" className="factor-table-head"><span role="columnheader">Signal</span><span role="columnheader">Evidence</span><span role="columnheader">Order</span></div>
            {factors.map(([name, evidence, order]) => (
              <div role="row" key={name}><b role="cell">{name}</b><span role="cell">{evidence}</span><code role="cell">{order}</code></div>
            ))}
          </div>
        </section>

        <section className="architecture" aria-labelledby="architecture-heading">
          <div className="section-heading compact">
            <p className="eyebrow">SYSTEM BOUNDARY</p>
            <h2 id="architecture-heading">Source code does not need to cross the boundary.</h2>
          </div>
          <div className="architecture-flow" aria-label="Browser extracts repository structure, a worker analyzes evidence, and an optional local model writes a short brief">
            <div><small>BROWSER</small><strong>Paths + imports</strong><span>Raw files stay local</span></div>
            <i aria-hidden="true">→</i>
            <div><small>WEB WORKER</small><strong>Evidence engine</strong><span>Local, bounded analysis</span></div>
            <i aria-hidden="true">→</i>
            <div><small>OPTIONAL</small><strong>Local narration</strong><span>Summary only</span></div>
          </div>
        </section>

        <section className="limitations" aria-labelledby="limits-heading">
          <h2 id="limits-heading">MVP limits worth improving</h2>
          <ul>
            <li>Configured aliases are resolved, but workspace package rules and conditional exports remain incomplete.</li>
            <li>TypeScript, JavaScript, and Python still receive lightweight parsing rather than compiler-grade syntax analysis.</li>
            <li>Exact filename matches and import edges do not prove behavioral test coverage.</li>
            <li>Runtime call paths and code ownership are absent from the current evidence set.</li>
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
