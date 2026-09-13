import Link from "next/link";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="site-brand" href="/" aria-label="BlastRadius home">
          <BrandMark />
          <span>BlastRadius</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/#difference">Difference</Link>
          <Link href="/method">Method</Link>
          <Link href="/sources">Sources</Link>
        </nav>
        <Link className="button button-small" href="/analyze">
          Open analyzer
        </Link>
      </div>
    </header>
  );
}
