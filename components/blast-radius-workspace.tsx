"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

import {
  analyzeChange,
  summarizeForLocalModel,
  type AnalysisOptions,
  type AnalysisResult,
  type RepositoryFile,
} from "@/lib/analyzer";
import {
  extractRepositoryOptions,
  IGNORED_DIRECTORY_PATTERN,
  repositoryRelativePath,
  SOURCE_FILE_PATTERN,
  toRepositoryFile,
} from "@/lib/repository-mapper";

const starterDiff = `diff --git a/src/pricing/discount.ts b/src/pricing/discount.ts
--- a/src/pricing/discount.ts
+++ b/src/pricing/discount.ts
@@ -18,4 +18,7 @@ export function calculateDiscount(order) {
-  return order.total * rules.baseRate
+  const rate = rules[order.customer.tier] ?? rules.baseRate
+  return order.total * rate
 }

diff --git a/src/api/checkout.ts b/src/api/checkout.ts
--- a/src/api/checkout.ts
+++ b/src/api/checkout.ts
@@ -42,2 +42,3 @@
+  audit.record("discount_applied", discount)`;

const sampleRepository: RepositoryFile[] = [
  { path: "src/pricing/discount.ts", imports: ["./rules"], isTest: false, isSurface: false },
  { path: "src/pricing/rules.ts", imports: [], isTest: false, isSurface: false },
  { path: "src/api/checkout.ts", imports: ["../pricing/discount", "../infra/audit"], isTest: false, isSurface: false },
  { path: "src/api/refund.ts", imports: ["../pricing/discount"], isTest: false, isSurface: false },
  { path: "src/infra/audit.ts", imports: [], isTest: false, isSurface: false },
  { path: "src/app/api/checkout/route.ts", imports: ["../../../api/checkout"], isTest: false, isSurface: true },
  { path: "src/workers/refund.ts", imports: ["../api/refund"], isTest: false, isSurface: true },
  { path: "src/api/checkout.test.ts", imports: ["./checkout"], isTest: true, isSurface: false },
];

const initialAnalysis = analyzeChange(starterDiff, sampleRepository);
const sampleOptions: AnalysisOptions = { aliases: {}, externalPackages: [] };

type IngestionSummary = {
  mapped: number;
  ignored: number;
  oversized: number;
  capped: number;
};

function analyzeInWorker(
  diff: string,
  files: RepositoryFile[],
  options: AnalysisOptions,
) {
  if (typeof Worker === "undefined") return Promise.resolve(analyzeChange(diff, files, options));
  return new Promise<AnalysisResult>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/analyzer.worker.ts", import.meta.url), {
      type: "module",
    });
    const id = Date.now();
    worker.onmessage = (event: MessageEvent<{ id: number; result?: AnalysisResult; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error ?? "The analysis worker failed."));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("The analysis worker failed."));
    };
    worker.postMessage({ id, diff, files, options });
  });
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
    >
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function ImpactMap({ analysis }: { analysis: AnalysisResult }) {
  const columns = [
    ["Changed", analysis.nodes.filter((node) => node.kind === "changed")],
    ["Dependents", analysis.nodes.filter((node) => node.kind === "dependent" || node.kind === "risk")],
    ["Surfaces", analysis.nodes.filter((node) => node.kind === "surface")],
    ["Tests", analysis.nodes.filter((node) => node.kind === "test")],
  ] as const;
  const displayedColumns = columns.map(([title, nodes]) => [title, nodes.slice(0, 5)] as const);
  const columnX = [20, 260, 500, 740];
  const nodeWidth = 200;
  const nodeHeight = 48;
  const rowHeight = 64;
  const graphHeight = Math.max(170, 72 + Math.max(...displayedColumns.map(([, nodes]) => nodes.length)) * rowHeight);
  const positions = new Map<string, { x: number; y: number }>();
  displayedColumns.forEach(([, nodes], columnIndex) => {
    nodes.forEach((node, rowIndex) => {
      positions.set(node.id, { x: columnX[columnIndex], y: 52 + rowIndex * rowHeight });
    });
  });
  const visibleEdges = analysis.edges.filter(
    (edge) => positions.has(edge.from) && positions.has(edge.to),
  );
  const compact = (value: string, length: number) =>
    value.length > length ? `${value.slice(0, length - 1)}…` : value;

  return (
    <div className="impact-map">
      <div className="impact-graph-scroll">
        <svg
          className="impact-graph"
          viewBox={`0 0 960 ${graphHeight}`}
          role="img"
          aria-labelledby="impact-graph-title impact-graph-description"
        >
          <title id="impact-graph-title">Dependency impact graph</title>
          <desc id="impact-graph-description">
            Directed import paths from changed files through dependents to exposed surfaces and related tests.
          </desc>
          <defs>
            <marker id="edge-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          </defs>
          {displayedColumns.map(([title], index) => (
            <text className="graph-stage-label" x={columnX[index]} y="24" key={title}>
              {String(index + 1).padStart(2, "0")} / {title.toUpperCase()}
            </text>
          ))}
          {visibleEdges.map((edge, index) => {
            const from = positions.get(edge.from)!;
            const to = positions.get(edge.to)!;
            const startX = from.x + nodeWidth;
            const startY = from.y + nodeHeight / 2;
            const endX = to.x;
            const endY = to.y + nodeHeight / 2;
            const bend = Math.max(24, (endX - startX) / 2);
            return (
              <path
                className="graph-edge"
                d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`}
                markerEnd="url(#edge-arrow)"
                key={`${edge.from}-${edge.to}-${index}`}
              >
                <title>{edge.evidence}</title>
              </path>
            );
          })}
          {displayedColumns.flatMap(([, nodes]) => nodes.map((node) => {
            const position = positions.get(node.id)!;
            return (
              <g className="graph-node" data-kind={node.kind} key={node.id}>
                <rect x={position.x} y={position.y} width={nodeWidth} height={nodeHeight} rx="3" />
                <circle cx={position.x + 12} cy={position.y + 15} r="4" />
                <text className="graph-node-label" x={position.x + 22} y={position.y + 18}>
                  {compact(node.label, 23)}
                </text>
                <text className="graph-node-path" x={position.x + 12} y={position.y + 37}>
                  {compact(node.path, 28)}
                </text>
                <title>{node.path}, {node.kind}, hop {node.depth}</title>
              </g>
            );
          }))}
        </svg>
      </div>
      <p className="map-caption">
        {visibleEdges.length} resolved import path{visibleEdges.length === 1 ? "" : "s"} shown. Hover a line for its evidence.
        {analysis.stats.truncatedNodes ? ` ${analysis.stats.truncatedNodes} additional impacted files are not shown.` : ""}
        {" "}A path without a matching test is marked for review, not declared defective.
      </p>
    </div>
  );
}

export function BlastRadiusWorkspace() {
  const [diff, setDiff] = useState(starterDiff);
  const [repository, setRepository] = useState<RepositoryFile[]>(sampleRepository);
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>(sampleOptions);
  const [ingestionSummary, setIngestionSummary] = useState<IngestionSummary>({
    mapped: sampleRepository.length,
    ignored: 0,
    oversized: 0,
    capped: 0,
  });
  const [repositoryLabel, setRepositoryLabel] = useState("Sample commerce service");
  const [analysis, setAnalysis] = useState<AnalysisResult>(initialAnalysis);
  const [status, setStatus] = useState<"ready" | "reading" | "running" | "narrating">("ready");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"map" | "evidence">("map");
  const fileInput = useRef<HTMLInputElement>(null);

  const runAnalysis = useCallback(async (
    nextDiff = diff,
    nextFiles = repository,
    nextOptions = analysisOptions,
  ) => {
    if (!nextDiff.trim()) {
      setError("Paste a unified diff before running the analysis.");
      return undefined;
    }
    setError("");
    setStatus("running");
    try {
      const result = await analyzeInWorker(nextDiff, nextFiles, nextOptions);
      setAnalysis(result);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
      return undefined;
    } finally {
      setStatus("ready");
    }
  }, [analysisOptions, diff, repository]);

  async function narrateAnalysis() {
    setError("");
    setStatus("narrating");
    try {
      const response = await fetch("/api/narrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summary: summarizeForLocalModel(analysis) }),
      });
      const payload = (await response.json()) as { brief?: string; error?: string };
      if (!response.ok || !payload.brief) {
        throw new Error(payload.error ?? "The local model did not return a summary.");
      }
      setAnalysis((current) => ({
        ...current,
        brief: payload.brief!,
        narrativeSource: "local-model",
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The local model is unavailable.");
    } finally {
      setStatus("ready");
    }
  }

  async function importRepository(selected: FileList | null) {
    if (!selected?.length) return;
    setStatus("reading");
    setError("");
    try {
      const files = [...selected];
      const pathFor = (file: File) => file.webkitRelativePath || file.name;
      const ignored = files.filter((file) => IGNORED_DIRECTORY_PATTERN.test(pathFor(file)));
      const supported = files.filter(
        (file) => !IGNORED_DIRECTORY_PATTERN.test(pathFor(file)) && SOURCE_FILE_PATTERN.test(file.name),
      );
      const oversized = supported.filter((file) => file.size > 256_000);
      const withinLimit = supported.filter((file) => file.size <= 256_000);
      const eligible = withinLimit.slice(0, 5_000);
      const configFiles = files.filter((file) => {
        const path = repositoryRelativePath(pathFor(file));
        return (
          file.size <= 256_000 &&
          !IGNORED_DIRECTORY_PATTERN.test(pathFor(file)) &&
          (path === "package.json" || /(^|\/)(tsconfig|jsconfig)\.json$/i.test(path))
        );
      });
      const configSources = await Promise.all(
        configFiles.map(async (file) => ({ path: pathFor(file), source: await file.text() })),
      );
      const nextOptions = extractRepositoryOptions(configSources);
      const mapped = await Promise.all(
        eligible.map(async (file) =>
          toRepositoryFile(pathFor(file), await file.text()),
        ),
      );
      if (!mapped.length) throw new Error("No supported TypeScript, JavaScript, or Python files were found.");
      setRepository(mapped);
      setAnalysisOptions(nextOptions);
      setIngestionSummary({
        mapped: mapped.length,
        ignored: ignored.length,
        oversized: oversized.length,
        capped: Math.max(0, withinLimit.length - eligible.length),
      });
      setRepositoryLabel(selected[0]?.webkitRelativePath?.split("/")[0] || "Local repository");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The folder could not be read.");
    } finally {
      setStatus("ready");
    }
  }

  function resetDemo() {
    setDiff(starterDiff);
    setRepository(sampleRepository);
    setAnalysisOptions(sampleOptions);
    setIngestionSummary({ mapped: sampleRepository.length, ignored: 0, oversized: 0, capped: 0 });
    setRepositoryLabel("Sample commerce service");
    setAnalysis(initialAnalysis);
    setError("");
  }

  useEffect(() => {
    const context = (document as unknown as {
      modelContext?: {
        registerTool: (
          tool: {
            name: string;
            title: string;
            description: string;
            inputSchema: object;
            annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
            execute: (input: unknown) => Promise<unknown>;
          },
          options: { signal: AbortSignal },
        ) => void | Promise<void>;
      };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "analyze_change",
      title: "Analyze code change",
      description: "Analyze a unified diff against the loaded repository map and update the visible review plan.",
      inputSchema: {
        type: "object",
        properties: { diff: { type: "string", minLength: 1, maxLength: 500000 } },
        required: ["diff"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        const value = input as { diff?: unknown };
        if (typeof value.diff !== "string" || !value.diff.trim()) {
          throw new Error("A non-empty unified diff is required.");
        }
        setDiff(value.diff);
        const result = await runAnalysis(value.diff, repository, analysisOptions);
        if (!result) throw new Error("The change could not be analyzed.");
        return {
          policyVersion: result.policyVersion,
          confidence: result.confidence,
          reviewOrder: result.reviewOrder,
          verificationPlan: result.verificationPlan,
        };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [analysisOptions, repository, runAnalysis]);

  const stats = analysis.stats;
  const busyLabel =
    status === "reading" ? "Mapping folder…" :
    status === "running" ? "Tracing impact…" :
    status === "narrating" ? "Writing summary…" :
    "Analyze change";

  return (
    <div className="analyzer-shell" id="workspace">
      <header className="analyzer-intro">
        <div>
          <p className="eyebrow">WORKING MVP / LOCAL-FIRST</p>
          <h1>Trace the change before you trust it.</h1>
          <p>Load repository structure and paste a unified diff. BlastRadius follows downstream imports, locates exposed surfaces, and checks for matching tests.</p>
        </div>
        <div className="analyzer-status" aria-live="polite">
          <span><i aria-hidden="true" />{repository.length} files mapped</span>
          <button type="button" onClick={() => fileInput.current?.click()}>Choose folder</button>
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        aria-label="Choose a local repository folder"
        onChange={(event) => void importRepository(event.target.files)}
        {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
      />

      <div className="workspace">
        <aside className="input-column">
          <div className="column-index">01 / Evidence input</div>
          <button className="repository-picker" type="button" onClick={() => fileInput.current?.click()}>
            <span className="repo-glyph" aria-hidden="true">&lt;/&gt;</span>
            <span>
              <strong>{repositoryLabel}</strong>
              <small>
                {ingestionSummary.mapped} mapped · {ingestionSummary.ignored} ignored · {ingestionSummary.oversized} oversized
                {ingestionSummary.capped ? ` · ${ingestionSummary.capped} beyond cap` : ""}
              </small>
            </span>
            <b aria-hidden="true">↗</b>
          </button>

          <div className="diff-heading">
            <label htmlFor="diff">Unified diff</label>
            <span>{analysis.changedFiles.length} files · +{stats.additions} −{stats.deletions}</span>
          </div>
          <textarea
            id="diff"
            value={diff}
            onChange={(event) => setDiff(event.target.value)}
            spellCheck={false}
            className="diff-editor"
          />
          {error ? <p className="input-error" role="alert">{error}</p> : null}
          <div className="input-actions">
            <button
              type="button"
              onClick={() => void runAnalysis()}
              disabled={!diff.trim() || status !== "ready"}
              className="analyze-button"
            >
              <span aria-hidden="true">▶</span>
              {busyLabel}
            </button>
            <button type="button" onClick={resetDemo} className="reset-button">
              <span aria-hidden="true">↺</span>
              Reset demo
            </button>
          </div>
          <p className="privacy-note">
            <span aria-hidden="true">✓</span>
            Analysis runs in this browser. Repository metadata is not sent to the server.
          </p>
        </aside>

        <section className="analysis-column" aria-label="Impact analysis">
          <div className="section-title">
            <div>
              <span>02 / Impact record</span>
              <h2>Review the path, not just the patch.</h2>
            </div>
            <dl className="summary-counts">
              <div><dt>Changed</dt><dd>{analysis.changedFiles.length}</dd></div>
              <div><dt>Surfaces</dt><dd>{stats.impactedSurfaces}</dd></div>
              <div><dt>Tests</dt><dd>{stats.impactedTests}</dd></div>
            </dl>
          </div>

          <div className="analysis-tabs">
            <div className="tab-list" role="tablist" aria-label="Impact analysis views">
              <button
                type="button"
                role="tab"
                id="map-tab"
                aria-controls="map-panel"
                aria-selected={activeTab === "map"}
                onClick={() => setActiveTab("map")}
              >Impact map</button>
              <button
                type="button"
                role="tab"
                id="evidence-tab"
                aria-controls="evidence-panel"
                aria-selected={activeTab === "evidence"}
                onClick={() => setActiveTab("evidence")}
              >Evidence factors</button>
            </div>
            <div
              id="map-panel"
              role="tabpanel"
              aria-labelledby="map-tab"
              className="tab-panel"
              hidden={activeTab !== "map"}
            >
              <ImpactMap analysis={analysis} />
            </div>
            <div
              id="evidence-panel"
              role="tabpanel"
              aria-labelledby="evidence-tab"
              className="tab-panel evidence-panel"
              hidden={activeTab !== "evidence"}
            >
              {analysis.factors.map((factor) => (
                <div className="factor-row" key={factor.label}>
                  <div>
                    <strong>{factor.label}</strong>
                    <p>{factor.explanation}</p>
                  </div>
                  <span className="factor-signal" data-signal={factor.signal}>{factor.signal}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="review-grid">
            <section className="review-section">
              <header><span>Verification plan</span><small>{analysis.verificationPlan.length} checks</small></header>
              <ol>
                {analysis.verificationPlan.map((item, index) => (
                  <li key={item}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></li>
                ))}
              </ol>
            </section>
            <section className="review-section">
              <header><span>Review order</span><small>highest signal first</small></header>
              <ol>
                {analysis.reviewOrder.slice(0, 4).map((target) => (
                    <li key={target.path} title={target.reasons.join("; ")}>
                      <b>{String(target.rank).padStart(2, "0")}</b>
                      <span className="path-label">{target.path}</span>
                      <em data-kind={target.kind}>{target.kind}</em>
                    </li>
                  ))}
              </ol>
            </section>
          </div>
        </section>

        <aside className="brief-column">
          <div className="column-index">03 / Review brief</div>
          <section className="priority-block">
            <span>Review priority</span>
            <div className="priority-line">
              <strong>{analysis.reviewOrder[0] ? "#01" : "N/A"}</strong>
              <em data-kind={analysis.reviewOrder[0]?.kind ?? "context"}>
                {analysis.reviewOrder[0]?.kind ?? "no target"}
              </em>
            </div>
            <p className="priority-path">{analysis.reviewOrder[0]?.path ?? "No changed path could be parsed."}</p>
            <p>Ordinal review queue from visible evidence. It is not a defect probability.</p>
            <div className="confidence">
              <div><span>Evidence confidence</span><b>{analysis.confidence.toFixed(2)}</b></div>
              <ProgressBar value={analysis.confidence * 100} label={`Evidence confidence: ${Math.round(analysis.confidence * 100)} percent`} />
            </div>
          </section>

          <section className="brief-block">
            <header>
              <span>Finding</span>
              <span className="brief-actions">
                <em>{analysis.narrativeSource === "local-model" ? "local model" : "evidence engine"}</em>
                <button type="button" onClick={() => void narrateAnalysis()} disabled={status !== "ready"}>
                  Summarize locally
                </button>
              </span>
            </header>
            <p>{analysis.brief}</p>
          </section>

          <section className="unknowns-block">
            <header><b aria-hidden="true">!</b><span>Known unknowns</span></header>
            <ul>{analysis.unknowns.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <p className="evidence-promise">
            <span aria-hidden="true">✓</span>
            Every ranking reason remains visible and reproducible.
          </p>
        </aside>
      </div>
    </div>
  );
}
