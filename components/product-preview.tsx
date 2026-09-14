const nodes = [
  ["CHANGED", "discount.ts", "+3 −1"],
  ["DEPENDENT", "checkout.ts", "hop 1"],
  ["SURFACE", "checkout/route.ts", "hop 2"],
  ["TEST", "checkout.test.ts", "matched"],
] as const;

export function ProductPreview() {
  return (
    <div className="product-preview" aria-label="Example BlastRadius analysis showing a code change traced to an API route and a related test">
      <div className="preview-chrome">
        <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
        <span>commerce-service / PR #184</span>
        <em>analysis complete</em>
      </div>
      <div className="preview-body">
        <aside className="preview-input">
          <span className="preview-kicker">EVIDENCE INPUT</span>
          <strong>2 changed files</strong>
          <div className="mini-diff" aria-hidden="true">
            <code>18</code><span className="line-old">− baseRate</span>
            <code>19</code><span className="line-new">+ customer.tier</span>
            <code>20</code><span className="line-new">+ audit.record()</span>
          </div>
          <p>31 lines · 8 files mapped</p>
        </aside>
        <section className="preview-map">
          <div className="preview-map-title">
            <span className="preview-kicker">IMPACT PATH</span>
            <b>Every claim has a path</b>
          </div>
          <div className="preview-nodes">
            {nodes.map(([kind, name, detail], index) => (
              <div className="preview-node" data-kind={kind.toLowerCase()} key={name}>
                <small>{kind}</small>
                <strong>{name}</strong>
                <span>{detail}</span>
                {index < nodes.length - 1 ? <i aria-hidden="true">→</i> : null}
              </div>
            ))}
          </div>
          <div className="preview-evidence">
            <span>Review order</span>
            <b>01</b><code>src/api/refund.ts</code><em>unpaired path</em>
            <b>02</b><code>src/api/checkout.ts</code><em>downstream</em>
          </div>
        </section>
        <aside className="preview-brief">
          <span className="preview-kicker">REVIEW BRIEF</span>
          <div className="preview-priority"><strong>#01</strong><em>UNPAIRED</em></div>
          <p>Review order from visible evidence, not defect probability.</p>
          <dl>
            <div><dt>Confidence</dt><dd>0.88</dd></div>
            <div><dt>Surfaces</dt><dd>1</dd></div>
            <div><dt>Tests</dt><dd>1</dd></div>
          </dl>
          <div className="preview-unknown"><b>Known unknown</b><span>1 dynamic import</span></div>
        </aside>
      </div>
    </div>
  );
}
