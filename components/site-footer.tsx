import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <strong>BlastRadius</strong>
          <p>Evidence-backed pull-request impact analysis.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/analyze">Analyzer</Link>
          <Link href="/method">Method</Link>
          <Link href="/sources">Sources</Link>
          <Link href="/llms.txt">llms.txt</Link>
        </nav>
        <p className="footer-note">Local-first · Reproducible · No paid API</p>
      </div>
    </footer>
  );
}
