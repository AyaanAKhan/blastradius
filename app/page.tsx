import type { Metadata } from "next";
import Link from "next/link";

import { HomeSchema } from "@/components/home-schema";
import { ProductPreview } from "@/components/product-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageMetadata, SITE_DESCRIPTION } from "@/lib/site";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "BlastRadius | Pull-request impact analysis",
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  title: { absolute: "BlastRadius | Pull-request impact analysis" },
};

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero-orbit hero-orbit-left" aria-hidden="true">
            <span>Δ</span><span>→</span>
          </div>
          <div className="hero-orbit hero-orbit-right" aria-hidden="true">
            <span>✓</span><span>?</span>
          </div>
          <div className="hero-copy">
            <p className="eyebrow"><i aria-hidden="true" /> Deterministic evidence · optional local models</p>
            <h1 id="hero-heading">Know what a pull request can break before it ships.</h1>
            <p className="hero-summary">
              BlastRadius traces changed code through downstream modules, exposed surfaces, and related tests, then turns the evidence into a review order you can defend.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/analyze">Analyze the sample</Link>
              <Link className="text-link" href="/method">Read the method <span aria-hidden="true">→</span></Link>
            </div>
            <p className="hero-note"><span aria-hidden="true">✓</span> No account, repository upload, or paid API required</p>
          </div>
          <ProductPreview />
        </section>

        <section className="signal-strip" aria-label="Product capabilities">
          <p><b>01</b><span>Static reach</span><small>Three dependency hops</small></p>
          <p><b>02</b><span>Test evidence</span><small>Named, reproducible matches</small></p>
          <p><b>03</b><span>Visible score</span><small>Every contribution exposed</small></p>
          <p><b>04</b><span>Explicit uncertainty</span><small>Unknowns remain visible</small></p>
        </section>

        <section className="section-wrap difference" id="difference">
          <div className="section-heading">
            <p className="eyebrow">THE DIFFERENCE</p>
            <h2>Not another reviewer that guesses confidently.</h2>
            <p>Most review tools optimize one slice: comments on a diff, a dependency map, production reach, or test selection. BlastRadius turns several inspectable signals into one decision surface.</p>
          </div>
          <div className="principle-grid">
            <article>
              <span>01</span>
              <h3>Evidence before prose</h3>
              <p>The graph and score exist without a model. Optional local narration can explain the result, but it cannot invent the result.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Attention, not fake certainty</h3>
              <p>The score ranks review effort. It never claims a defect was found, and confidence falls when imports or repository context are missing.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Source stays local</h3>
              <p>The browser extracts file paths and import relationships. The scoring endpoint receives structure and counts rather than raw repository source.</p>
            </article>
          </div>
        </section>

        <section className="section-wrap build-proof">
          <div className="section-heading compact">
            <p className="eyebrow">BUILT TO BE INTERROGATED</p>
            <h2>A portfolio project with engineering seams worth discussing.</h2>
          </div>
          <div className="proof-layout">
            <div className="proof-list">
              <div><b>Client</b><span>Folder ingestion, bounded parsing, accessible interaction</span></div>
              <div><b>Analysis</b><span>Diff parser, import resolver, reverse graph traversal</span></div>
              <div><b>Server</b><span>Validated API, deterministic fallback, local-model adapter</span></div>
              <div><b>Quality</b><span>Unit fixtures, visible assumptions, measured bundle boundaries</span></div>
            </div>
            <blockquote>
              <span aria-hidden="true">“</span>
              <p>The interesting interview answer is not “I called a model.” It is how the product remains useful, testable, and honest when the model is absent.</p>
            </blockquote>
          </div>
        </section>

        <section className="closing-cta">
          <p className="eyebrow">START WITH THE INCLUDED FIXTURE</p>
          <h2>Trace the path. Challenge the score. Improve the engine.</h2>
          <p>The sample commerce service is ready immediately, and a local folder can replace it when you want real repository structure.</p>
          <Link className="button button-light" href="/analyze">Open BlastRadius</Link>
        </section>
      </main>
      <SiteFooter />
      <HomeSchema />
    </>
  );
}
