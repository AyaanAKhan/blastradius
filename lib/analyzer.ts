export type RepositoryFile = {
  path: string;
  imports: string[];
  isTest: boolean;
  isSurface: boolean;
  hasDynamicImport?: boolean;
};

export type ChangeFile = {
  path: string;
  additions: number;
  deletions: number;
  changeType: "modified" | "added" | "deleted" | "renamed" | "binary";
};

export type ImpactNode = {
  id: string;
  label: string;
  path: string;
  kind: "changed" | "dependent" | "surface" | "test" | "risk";
  depth: number;
};

export type ImpactEdge = {
  from: string;
  to: string;
  evidence: string;
};

export type EvidenceFactor = {
  label: string;
  value: number;
  contribution: number;
  explanation: string;
};

export type AnalysisResult = {
  score: number;
  level: "Low" | "Moderate" | "High" | "Critical";
  confidence: number;
  changedFiles: ChangeFile[];
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  factors: EvidenceFactor[];
  verificationPlan: string[];
  brief: string;
  narrativeSource: "evidence-engine" | "local-model";
  unknowns: string[];
  stats: {
    additions: number;
    deletions: number;
    impactedFiles: number;
    impactedSurfaces: number;
    impactedTests: number;
  };
};

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"];
const SENSITIVE_PARTS = [
  "auth",
  "permission",
  "security",
  "payment",
  "billing",
  "checkout",
  "refund",
  "token",
  "session",
  "secret",
  "migration",
  "schema",
];

function normalizePath(value: string) {
  const parts: string[] = [];
  for (const part of value.replaceAll("\\", "/").replace(/^\.\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function withoutExtension(value: string) {
  return value.replace(/\.(tsx?|jsx?|mjs|cjs|py)$/, "");
}

function dirname(value: string) {
  const clean = normalizePath(value);
  const slash = clean.lastIndexOf("/");
  return slash === -1 ? "" : clean.slice(0, slash);
}

function basename(value: string) {
  const clean = normalizePath(value);
  return clean.slice(clean.lastIndexOf("/") + 1);
}

function joinPath(left: string, right: string) {
  return normalizePath(left ? `${left}/${right}` : right);
}

function ensureChange(
  files: Map<string, ChangeFile>,
  path: string,
  changeType: ChangeFile["changeType"] = "modified",
) {
  const normalized = normalizePath(path);
  const existing = files.get(normalized);
  if (existing) {
    if (changeType !== "modified") existing.changeType = changeType;
    return existing;
  }
  const change: ChangeFile = {
    path: normalized,
    additions: 0,
    deletions: 0,
    changeType,
  };
  files.set(normalized, change);
  return change;
}

function markerPath(value: string) {
  const path = value.split("\t", 1)[0]?.trim().replace(/^"|"$/g, "") ?? "";
  return path.replace(/^[ab]\//, "");
}

function gitHeaderPaths(line: string) {
  const body = line.slice("diff --git ".length);
  const quoted = body.match(/^"a\/(.+)" "b\/(.+)"$/);
  if (quoted) return { oldPath: quoted[1], newPath: quoted[2] };
  const plain = body.match(/^a\/(.+) b\/(.+)$/);
  if (plain) return { oldPath: plain[1], newPath: plain[2] };
  return undefined;
}

export function parseUnifiedDiff(diff: string): ChangeFile[] {
  const files = new Map<string, ChangeFile>();
  let active: ChangeFile | undefined;
  let oldPath: string | undefined;
  let oldLinesLeft = 0;
  let newLinesLeft = 0;

  for (const line of diff.replaceAll("\r\n", "\n").split("\n")) {
    if (oldLinesLeft > 0 || newLinesLeft > 0) {
      if (line.startsWith("\\")) continue;
      if (line.startsWith("+")) {
        if (active) active.additions += 1;
        newLinesLeft = Math.max(0, newLinesLeft - 1);
        continue;
      }
      if (line.startsWith("-")) {
        if (active) active.deletions += 1;
        oldLinesLeft = Math.max(0, oldLinesLeft - 1);
        continue;
      }
      oldLinesLeft = Math.max(0, oldLinesLeft - 1);
      newLinesLeft = Math.max(0, newLinesLeft - 1);
      continue;
    }

    if (line.startsWith("diff --git ")) {
      const paths = gitHeaderPaths(line);
      oldPath = paths?.oldPath;
      active = paths ? ensureChange(files, paths.newPath) : undefined;
      continue;
    }
    if (line.startsWith("new file mode ")) {
      if (active) active.changeType = "added";
      continue;
    }
    if (line.startsWith("deleted file mode ")) {
      if (active) active.changeType = "deleted";
      continue;
    }
    if (line.startsWith("rename from ")) {
      oldPath = normalizePath(line.slice("rename from ".length));
      continue;
    }
    if (line.startsWith("rename to ")) {
      const path = normalizePath(line.slice("rename to ".length));
      if (active && files.get(active.path) === active && active.path !== path) {
        files.delete(active.path);
      }
      active = ensureChange(files, path, "renamed");
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      if (active) active.changeType = "binary";
      continue;
    }
    if (line.startsWith("--- ")) {
      const path = markerPath(line.slice(4));
      oldPath = path === "/dev/null" ? undefined : path;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const nextPath = markerPath(line.slice(4));
      const target = nextPath === "/dev/null" ? oldPath : nextPath;
      if (target && target !== "/dev/null") {
        active = ensureChange(
          files,
          target,
          nextPath === "/dev/null" ? "deleted" : oldPath ? active?.changeType : "added",
        );
      }
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
    if (hunk) {
      oldLinesLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newLinesLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
    }
  }

  return [...files.values()];
}

function candidatePaths(importer: string, specifier: string) {
  if (!specifier.startsWith(".")) return [];
  const base = joinPath(dirname(importer), specifier);
  const candidates = new Set<string>([base]);
  for (const extension of SOURCE_EXTENSIONS) {
    candidates.add(base + extension);
    candidates.add(joinPath(base, "index" + extension));
  }
  return [...candidates];
}

function resolveImport(importer: string, specifier: string, knownPaths: Set<string>) {
  for (const candidate of candidatePaths(importer, specifier)) {
    if (knownPaths.has(candidate)) return candidate;
  }
  return undefined;
}

function testMatchesSource(testPath: string, sourcePath: string) {
  const testName = withoutExtension(basename(testPath))
    .replace(/\.(test|spec)$/, "")
    .replace(/^test_/, "");
  const sourceName = withoutExtension(basename(sourcePath));
  return testName === sourceName || testPath.includes(sourceName);
}

function isTestPath(path: string) {
  return /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\./.test(path);
}

function labelFor(path: string) {
  return basename(path) || path;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function analyzeChange(diff: string, repositoryFiles: RepositoryFile[]): AnalysisResult {
  const changedFiles = parseUnifiedDiff(diff);
  const normalizedFiles = repositoryFiles.map((file) => ({
    ...file,
    path: normalizePath(file.path),
    imports: file.imports.slice(0, 80),
  }));
  const knownPaths = new Set(normalizedFiles.map((file) => file.path));
  const reverseGraph = new Map<string, Set<string>>();
  const resolvedEdges: ImpactEdge[] = [];
  let unresolvedImports = 0;

  for (const file of normalizedFiles) {
    for (const specifier of file.imports) {
      const target = resolveImport(file.path, specifier, knownPaths);
      if (!target) {
        if (specifier.startsWith(".")) unresolvedImports += 1;
        continue;
      }
      if (!reverseGraph.has(target)) reverseGraph.set(target, new Set());
      reverseGraph.get(target)?.add(file.path);
      resolvedEdges.push({
        from: target,
        to: file.path,
        evidence: `${labelFor(file.path)} imports ${labelFor(target)}`,
      });
    }
  }

  const changedPaths = changedFiles.map((file) => normalizePath(file.path));
  const discovered = new Map<string, number>();
  const queue: Array<{ path: string; depth: number }> = changedPaths.map((path) => ({ path, depth: 0 }));

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= 3) continue;
    for (const dependent of reverseGraph.get(current.path) ?? []) {
      const nextDepth = current.depth + 1;
      const previousDepth = discovered.get(dependent);
      if (previousDepth === undefined || nextDepth < previousDepth) {
        discovered.set(dependent, nextDepth);
        queue.push({ path: dependent, depth: nextDepth });
      }
    }
  }

  const fileByPath = new Map(normalizedFiles.map((file) => [file.path, file]));
  const impactedPaths = new Set([...changedPaths, ...discovered.keys()]);
  const matchedTests = normalizedFiles.filter(
    (file) =>
      file.isTest &&
      ([...impactedPaths].some((path) => testMatchesSource(file.path, path)) ||
        impactedPaths.has(file.path)),
  );
  for (const test of matchedTests) impactedPaths.add(test.path);

  const impactedSurfaces = normalizedFiles.filter(
    (file) => file.isSurface && impactedPaths.has(file.path),
  );
  const nodes: ImpactNode[] = [];
  for (const path of impactedPaths) {
    const metadata = fileByPath.get(path);
    const isChanged = changedPaths.includes(path);
    let kind: ImpactNode["kind"] = isChanged ? "changed" : "dependent";
    if (!isChanged && metadata?.isSurface) kind = "surface";
    if (!isChanged && metadata?.isTest) kind = "test";
    if (
      !isChanged &&
      !metadata?.isTest &&
      !metadata?.isSurface &&
      SENSITIVE_PARTS.some((part) => path.toLowerCase().includes(part)) &&
      !matchedTests.some((test) => testMatchesSource(test.path, path))
    ) {
      kind = "risk";
    }
    nodes.push({
      id: path,
      label: labelFor(path),
      path,
      kind,
      depth: isChanged ? 0 : discovered.get(path) ?? (metadata?.isTest ? 3 : 1),
    });
  }

  const nodePaths = new Set(nodes.map((node) => node.path));
  const edges = resolvedEdges.filter(
    (edge) => nodePaths.has(edge.from) && nodePaths.has(edge.to),
  );
  for (const test of matchedTests) {
    const source = [...impactedPaths].find(
      (path) => path !== test.path && testMatchesSource(test.path, path),
    );
    if (source && !edges.some((edge) => edge.from === source && edge.to === test.path)) {
      edges.push({
        from: source,
        to: test.path,
        evidence: `${labelFor(test.path)} name matches ${labelFor(source)}`,
      });
    }
  }

  const additions = changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const deletions = changedFiles.reduce((sum, file) => sum + file.deletions, 0);
  const churn = additions + deletions;
  const sensitiveChanged = changedPaths.filter(
    (path) =>
      !isTestPath(path) &&
      SENSITIVE_PARTS.some((part) => path.toLowerCase().includes(part)),
  ).length;
  const configChanged = changedPaths.filter((path) =>
    /(package-lock|pnpm-lock|yarn\.lock|\.env|config|schema|migration)/i.test(path),
  ).length;
  const uncoveredImpact = nodes.filter((node) => node.kind === "risk").length;
  const testsChanged = changedPaths.filter(isTestPath).length;

  const factors: EvidenceFactor[] = [
    {
      label: "Change size",
      value: clamp(Math.round(Math.log2(churn + 1) * 18), 0, 100),
      contribution: clamp(Math.round(Math.log2(churn + 1) * 3), 0, 18),
      explanation: `${churn} changed lines across ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"}`,
    },
    {
      label: "Dependency fan-out",
      value: clamp(discovered.size * 16, 0, 100),
      contribution: clamp(discovered.size * 4, 0, 24),
      explanation: `${discovered.size} downstream file${discovered.size === 1 ? "" : "s"} within three hops`,
    },
    {
      label: "Sensitive paths",
      value: clamp(sensitiveChanged * 40, 0, 100),
      contribution: clamp(sensitiveChanged * 12, 0, 24),
      explanation: sensitiveChanged
        ? `${sensitiveChanged} changed path${sensitiveChanged === 1 ? "" : "s"} matched review-sensitive domains`
        : "No changed paths matched the configured sensitive domains",
    },
    {
      label: "Coverage gaps",
      value: clamp(uncoveredImpact * 34 + (matchedTests.length ? 0 : 25), 0, 100),
      contribution: clamp(uncoveredImpact * 9 + (matchedTests.length ? 0 : 8), 0, 26),
      explanation: matchedTests.length
        ? `${matchedTests.length} related test${matchedTests.length === 1 ? "" : "s"} found; ${uncoveredImpact} sensitive dependent${uncoveredImpact === 1 ? "" : "s"} unpaired`
        : "No related tests were found in the supplied repository map",
    },
    {
      label: "Verification added",
      value: clamp(testsChanged * 50, 0, 100),
      contribution: clamp(testsChanged * -8, -16, 0),
      explanation: testsChanged
        ? `${testsChanged} test file${testsChanged === 1 ? "" : "s"} changed with the implementation`
        : "The diff does not include a test change",
    },
    {
      label: "Configuration reach",
      value: clamp(configChanged * 50, 0, 100),
      contribution: clamp(configChanged * 10, 0, 20),
      explanation: configChanged
        ? `${configChanged} configuration, schema, or lockfile change${configChanged === 1 ? "" : "s"}`
        : "No configuration or schema changes detected",
    },
  ];

  const score = clamp(
    14 + factors.reduce((sum, factor) => sum + factor.contribution, 0),
    5,
    96,
  );
  const level: AnalysisResult["level"] =
    score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 35 ? "Moderate" : "Low";
  const mappedChanged = changedPaths.filter((path) => knownPaths.has(path)).length;
  const dynamicImports = normalizedFiles.filter((file) => file.hasDynamicImport).length;
  const confidence = clamp(
    0.36 +
      (repositoryFiles.length ? 0.2 : 0) +
      (changedPaths.length ? (mappedChanged / changedPaths.length) * 0.24 : 0) +
      (resolvedEdges.length ? 0.12 : 0) -
      Math.min(0.16, unresolvedImports * 0.01) -
      Math.min(0.1, dynamicImports * 0.02),
    0.2,
    0.94,
  );

  const unknowns: string[] = [];
  if (!repositoryFiles.length) unknowns.push("No repository map was supplied; downstream impact is incomplete.");
  if (unresolvedImports) unknowns.push(`${unresolvedImports} relative import${unresolvedImports === 1 ? "" : "s"} could not be resolved.`);
  if (dynamicImports) unknowns.push(`${dynamicImports} file${dynamicImports === 1 ? "" : "s"} use dynamic imports that static mapping may miss.`);
  unknowns.push("Runtime traces and historical incident labels are not included in this MVP.");

  const highestRisk = nodes.find((node) => node.kind === "risk");
  const firstSurface = impactedSurfaces[0];
  const verificationPlan = [
    ...(matchedTests.length
      ? matchedTests.slice(0, 2).map((test) => `Run ${test.path}`)
      : ["Add a regression test for the changed behavior"]),
    ...(highestRisk ? [`Exercise the unpaired path through ${highestRisk.path}`] : []),
    ...(firstSurface ? [`Verify the user-facing behavior at ${firstSurface.path}`] : []),
    ...(configChanged ? ["Validate configuration and schema compatibility"] : []),
  ].slice(0, 4);

  const focus = highestRisk?.path ?? firstSurface?.path ?? changedPaths[0] ?? "the change";
  const brief =
    `${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"} reach ${discovered.size} downstream module${discovered.size === 1 ? "" : "s"} and ${impactedSurfaces.length} user-facing surface${impactedSurfaces.length === 1 ? "" : "s"}. ` +
    (highestRisk
      ? `${focus} is the highest-value review target because it is sensitive and has no matching test evidence.`
      : matchedTests.length
        ? `Start with ${focus}; related test evidence exists, but the impact path still needs human confirmation.`
        : `Start with ${focus}; no related test evidence was found.`);

  return {
    score,
    level,
    confidence,
    changedFiles,
    nodes: nodes.slice(0, 24),
    edges: edges.slice(0, 36),
    factors,
    verificationPlan,
    brief,
    narrativeSource: "evidence-engine",
    unknowns,
    stats: {
      additions,
      deletions,
      impactedFiles: discovered.size,
      impactedSurfaces: impactedSurfaces.length,
      impactedTests: matchedTests.length,
    },
  };
}

export function summarizeForLocalModel(result: AnalysisResult) {
  return {
    score: result.score,
    level: result.level,
    changedFiles: result.changedFiles.map((file) => file.path),
    impactedFiles: result.nodes.map((node) => ({ path: node.path, kind: node.kind })),
    factors: result.factors.map((factor) => ({
      label: factor.label,
      contribution: factor.contribution,
      evidence: factor.explanation,
    })),
    unknowns: result.unknowns,
  };
}
