import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The requested BlastRadius route does not exist.",
  alternates: { canonical: absoluteUrl("/404") },
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="not-found">
        <div className="error-code" aria-hidden="true"><span>4</span><i>→</i><span>4</span></div>
        <p className="eyebrow">UNRESOLVED ROUTE</p>
        <h1>This path falls outside the map.</h1>
        <p>The page may have moved, or the address may contain a typo. Return home or open the working analyzer.</p>
        <div className="hero-actions">
          <Link className="button" href="/">Return home</Link>
          <Link className="text-link" href="/analyze">Open analyzer →</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
