import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { analyzeChange } from "../dist/core/src/analyzer.js";
import { mapTypeScriptRepository } from "../dist/core/src/compiler-adapter.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evaluationRoot = path.join(projectRoot, "evaluation");
const cacheRoot = path.join(projectRoot, ".cache", "evaluation");
const repositories = JSON.parse(fs.readFileSync(path.join(evaluationRoot, "repositories.json"), "utf8"));
const requestedLimit = Number(process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1] ?? 300);
const concurrency = Number(process.argv.find((value) => value.startsWith("--concurrency="))?.split("=")[1] ?? 12);
const token = process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();

fs.mkdirSync(cacheRoot, { recursive: true });

function slug(repository) {
  return repository.replace("/", "-");
}

function slash(value) {
  return value.replaceAll("\\", "/");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function api(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "blastradius-evaluation",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (response.ok) return response.json();
  if (attempt < 4 && (response.status === 403 || response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    return api(url, attempt + 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

async function cached(file, load) {
  if (fs.existsSync(file)) return readJson(file);
  const value = await load();
  writeJson(file, value);
  return value;
}

async function pages(url) {
  const values = [];
  for (let page = 1; ; page += 1) {
    const separator = url.includes("?") ? "&" : "?";
    const batch = await api(`${url}${separator}per_page=100&page=${page}`);
    values.push(...batch);
    if (batch.length < 100) return values;
  }
}

async function concurrentMap(values, worker, limit) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index], index);
    }
  }));
  return output;
}

async function mergedPullRequests(repository, limit) {
  const file = path.join(cacheRoot, slug(repository), `merged-${limit}.json`);
  return cached(file, async () => {
    const merged = [];
    for (let page = 1; merged.length < limit && page <= 20; page += 1) {
      const batch = await api(
        `https://api.github.com/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
      );
      merged.push(...batch.filter((pull) => pull.merged_at));
      if (batch.length < 100) break;
    }
    return merged
      .sort((left, right) => right.merged_at.localeCompare(left.merged_at))
      .slice(0, limit)
      .map((pull) => ({
        number: pull.number,
        title: pull.title,
        author: pull.user?.login,
        mergedAt: pull.merged_at,
        baseSha: pull.base.sha,
        headSha: pull.head.sha,
        url: pull.html_url,
      }));
  });
}

async function pullEvidence(repository, pull) {
  const file = path.join(cacheRoot, slug(repository), "pulls", `${pull.number}.json`);
  return cached(file, async () => {
    const [files, comments] = await Promise.all([
      pages(`https://api.github.com/repos/${repository}/pulls/${pull.number}/files`),
      pages(`https://api.github.com/repos/${repository}/pulls/${pull.number}/comments`),
    ]);
    return {
      ...pull,
      files: files.map((item) => ({
        path: item.filename,
        previousPath: item.previous_filename,
        status: item.status,
        additions: item.additions,
        deletions: item.deletions,
        patch: item.patch,
      })),
      reviewComments: comments
        .filter((comment) =>
          comment.path &&
          comment.user?.type !== "Bot" &&
          !comment.user?.login?.endsWith("[bot]") &&
          comment.user?.login !== pull.author)
        .map((comment) => ({
          path: comment.path,
          author: comment.user.login,
        })),
    };
  });
}

function diffFor(files) {
  return files.map((file) => {
    const oldPath = file.previousPath ?? file.path;
    const header = [
      `diff --git a/${oldPath} b/${file.path}`,
      file.status === "added" ? "new file mode 100644" : "",
      file.status === "removed" ? "deleted file mode 100644" : "",
      file.status === "renamed" ? `rename from ${oldPath}\nrename to ${file.path}` : "",
      file.status === "added" ? "--- /dev/null" : `--- a/${oldPath}`,
      file.status === "removed" ? "+++ /dev/null" : `+++ b/${file.path}`,
    ].filter(Boolean).join("\n");
    return file.patch ? `${header}\n${file.patch}` : `${header}\nBinary files a/${oldPath} and b/${file.path} differ`;
  }).join("\n");
}

function pythonSpecifier(raw) {
  const match = raw.match(/^(\.*)(.*)$/);
  const dots = match?.[1].length ?? 0;
  const modulePath = (match?.[2] ?? raw).replaceAll(".", "/");
  if (!dots) return modulePath;
  if (dots === 1) return `./${modulePath}`;
  return `${"../".repeat(dots - 1)}${modulePath}`;
}

function mapPythonRepository(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = slash(path.relative(root, absolute));
      if (entry.isDirectory()) {
        if (!/(^|\/)(\.git|node_modules|\.venv|venv|__pycache__|dist|build)(\/|$)/.test(relative)) visit(absolute);
        continue;
      }
      if (!entry.isFile() || !relative.endsWith(".py") || fs.statSync(absolute).size > 512_000) continue;
      const source = fs.readFileSync(absolute, "utf8");
      const imports = new Set();
      for (const match of source.matchAll(/^\s*from\s+([.\w]+)\s+import\s+/gm)) imports.add(pythonSpecifier(match[1]));
      for (const match of source.matchAll(/^\s*import\s+([^\n#]+)/gm)) {
        for (const item of match[1].split(",")) {
          const moduleName = item.trim().split(/\s+as\s+/, 1)[0];
          if (moduleName) imports.add(pythonSpecifier(moduleName));
        }
      }
      files.push({
        path: relative,
        imports: [...imports].slice(0, 80),
        isTest: /(^|\/)(test|tests)(\/|$)|test_.*\.py$/.test(relative),
        isSurface: /(^|\/)(routes?|views?|controllers?|handlers?)(\/|\.|$)/i.test(relative),
        hasDynamicImport: /\bimport_module\s*\(/.test(source),
      });
    }
  };
  visit(root);
  return { files, options: { aliases: {}, externalPackages: [] }, diagnostics: [] };
}

function bareRepository(repository) {
  const destination = path.join(cacheRoot, slug(repository), "history-full.git");
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    execFileSync(
      "git",
      ["clone", "--bare", "--depth", "1", "--quiet", `https://github.com/${repository}.git`, destination],
      { timeout: 180_000 },
    );
  }
  return destination;
}

function repositoryMapAtPull(configuration, pull) {
  const repository = configuration.repository;
  const bare = bareRepository(repository);
  const ref = `refs/evaluation/${pull.number}`;
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), `${slug(repository)}-${pull.number}-`));
  try {
    execFileSync(
      "git",
      [`--git-dir=${bare}`, "fetch", "--quiet", "--depth", "1", "origin", `refs/pull/${pull.number}/head:${ref}`],
      { timeout: 180_000 },
    );
    execFileSync(
      "git",
      [`--git-dir=${bare}`, `--work-tree=${checkout}`, "checkout", "--force", ref, "--", "."],
      { timeout: 180_000 },
    );
    const mapping = configuration.mapper === "python"
      ? mapPythonRepository(checkout)
      : mapTypeScriptRepository(checkout, { collectDiagnostics: false });
    return {
      snapshotSha: execFileSync("git", [`--git-dir=${bare}`, "rev-parse", ref], { encoding: "utf8" }).trim(),
      configPath: mapping.configPath,
      diagnostics: mapping.diagnostics.slice(0, 10),
      files: mapping.files,
      options: mapping.options,
    };
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true });
  }
}

function changedOrder(result, files) {
  const rank = new Map(result.reviewOrder.map((target, index) => [target.path, index]));
  return [...files]
    .sort((left, right) =>
      (rank.get(left.path) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.path) ?? Number.MAX_SAFE_INTEGER) ||
      left.path.localeCompare(right.path))
    .map((file) => file.path);
}

function singletonDiff(file) {
  return `diff --git a/${file} b/${file}
--- a/${file}
+++ b/${file}
@@ -1 +1 @@
-value
+value`;
}

function rankByDependents(files, mapping, cache) {
  return [...files]
    .sort((left, right) => {
      for (const file of [left.path, right.path]) {
        if (!cache.has(file)) {
          cache.set(file, analyzeChange(singletonDiff(file), mapping.files, mapping.options).stats.impactedFiles);
        }
      }
      return cache.get(right.path) - cache.get(left.path) ||
        (right.additions + right.deletions) - (left.additions + left.deletions) ||
        left.path.localeCompare(right.path);
    })
    .map((file) => file.path);
}

function emptyMetrics() {
  return { precisionAt1: 0, recallAt3: 0, meanReciprocalRank: 0 };
}

function orderedMetrics(order, labels) {
  const first = order.findIndex((file) => labels.has(file));
  return {
    precisionAt1: labels.has(order[0]) ? 1 : 0,
    recallAt3: [...labels].filter((file) => order.slice(0, 3).includes(file)).length / labels.size,
    meanReciprocalRank: first === -1 ? 0 : 1 / (first + 1),
  };
}

function randomMetrics(candidateCount, labelCount) {
  let reciprocal = 0;
  let noLabelBefore = 1;
  for (let rank = 1; rank <= candidateCount - labelCount + 1; rank += 1) {
    const remaining = candidateCount - rank + 1;
    const firstAtRank = noLabelBefore * (labelCount / remaining);
    reciprocal += firstAtRank / rank;
    noLabelBefore *= (remaining - labelCount) / remaining;
  }
  return {
    precisionAt1: labelCount / candidateCount,
    recallAt3: Math.min(3, candidateCount) / candidateCount,
    meanReciprocalRank: reciprocal,
  };
}

function average(values) {
  if (!values.length) return emptyMetrics();
  return {
    precisionAt1: values.reduce((sum, value) => sum + value.precisionAt1, 0) / values.length,
    recallAt3: values.reduce((sum, value) => sum + value.recallAt3, 0) / values.length,
    meanReciprocalRank: values.reduce((sum, value) => sum + value.meanReciprocalRank, 0) / values.length,
  };
}

function roundMetrics(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(4))]));
}

function evaluateExamples(examples) {
  const baselines = ["random", "churn", "dependents", "blastradius"];
  return Object.fromEntries(baselines.map((baseline) => [
    baseline,
    roundMetrics(average(examples.map((example) => example.metrics[baseline]))),
  ]));
}

const results = [];
const manifest = [];
for (const configuration of repositories) {
  const repository = configuration.repository;
  process.stdout.write(`${repository}: loading ${requestedLimit} merged pull requests\n`);
  const pulls = await mergedPullRequests(repository, requestedLimit);
  const evidence = await concurrentMap(pulls, async (pull, index) => {
    const value = await pullEvidence(repository, pull);
    if ((index + 1) % 25 === 0 || index + 1 === pulls.length) {
      process.stdout.write(`${repository}: ${index + 1}/${pulls.length} pull requests cached\n`);
    }
    return value;
  }, concurrency);
  const examples = [];
  const labeledEvidence = evidence.filter((pull) => {
    const candidatePaths = new Set(pull.files.map((file) => file.path));
    const labels = new Set(pull.reviewComments.map((comment) => comment.path).filter((file) => candidatePaths.has(file)));
    return labels.size && pull.files.length;
  });
  for (const [index, pull] of labeledEvidence.entries()) {
    const metricFile = path.join(cacheRoot, slug(repository), "historical-rank-v1", `${pull.number}.json`);
    if (fs.existsSync(metricFile)) {
      const cachedExample = readJson(metricFile);
      if (cachedExample.headSha === pull.headSha) {
        examples.push(cachedExample);
        continue;
      }
    }
    const candidatePaths = new Set(pull.files.map((file) => file.path));
    const labels = new Set(pull.reviewComments.map((comment) => comment.path).filter((file) => candidatePaths.has(file)));
    const mapping = repositoryMapAtPull(configuration, pull);
    if (mapping.snapshotSha !== pull.headSha) {
      throw new Error(`Historical checkout mismatch for ${repository}#${pull.number}`);
    }
    const knownPaths = new Set(mapping.files.map((file) => file.path));
    const analysis = analyzeChange(diffFor(pull.files), mapping.files, mapping.options);
    const reachCache = new Map();
    const orders = {
      churn: [...pull.files]
        .sort((left, right) =>
          (right.additions + right.deletions) - (left.additions + left.deletions) ||
          left.path.localeCompare(right.path))
        .map((file) => file.path),
      dependents: rankByDependents(pull.files, mapping, reachCache),
      blastradius: changedOrder(analysis, pull.files),
    };
    const example = {
      number: pull.number,
      mergedAt: pull.mergedAt,
      headSha: pull.headSha,
      mappedSha: mapping.snapshotSha,
      files: pull.files.length,
      labeledFiles: labels.size,
      mappedFiles: pull.files.filter((file) => knownPaths.has(file.path)).length,
      compilerDiagnostics: mapping.diagnostics.length,
      metrics: {
        random: randomMetrics(pull.files.length, labels.size),
        churn: orderedMetrics(orders.churn, labels),
        dependents: orderedMetrics(orders.dependents, labels),
        blastradius: orderedMetrics(orders.blastradius, labels),
      },
    };
    writeJson(metricFile, example);
    examples.push(example);
    if ((index + 1) % 5 === 0 || index + 1 === labeledEvidence.length) {
      process.stdout.write(`${repository}: ${index + 1}/${labeledEvidence.length} historical graphs analyzed\n`);
    }
  }
  examples.sort((left, right) => left.mergedAt.localeCompare(right.mergedAt));
  const split = Math.floor(examples.length * 0.8);
  const development = examples.slice(0, split);
  const heldOut = examples.slice(split);
  const mappedFiles = examples.reduce((sum, example) => sum + example.mappedFiles, 0);
  const totalFiles = examples.reduce((sum, example) => sum + example.files, 0);
  results.push({
    repository,
    graphSnapshots: "pull-request head commits",
    pulled: pulls.length,
    labeled: examples.length,
    development: {
      pullRequests: development.length,
      metrics: evaluateExamples(development),
    },
    heldOut: {
      pullRequests: heldOut.length,
      metrics: evaluateExamples(heldOut),
    },
    mappingCoverage: totalFiles ? Number((mappedFiles / totalFiles).toFixed(4)) : 0,
  });
  manifest.push({
    repository,
    pullRequests: evidence.map((pull) => ({
      number: pull.number,
      mergedAt: pull.mergedAt,
      headSha: pull.headSha,
      url: pull.url,
    })),
  });
  process.stdout.write(`${repository}: ${examples.length} labeled, ${heldOut.length} held out\n`);
}

const output = {
  policyVersion: "rank-v1",
  requestedPullRequestsPerRepository: requestedLimit,
  totalPullRequests: results.reduce((sum, result) => sum + result.pulled, 0),
  totalLabeledPullRequests: results.reduce((sum, result) => sum + result.labeled, 0),
  totalHeldOutPullRequests: results.reduce((sum, result) => sum + result.heldOut.pullRequests, 0),
  label: "Changed file with at least one inline human review comment, excluding the pull request author and bots.",
  split: "Oldest 80 percent development, newest 20 percent held out.",
  results,
};
writeJson(path.join(evaluationRoot, "results.json"), output);
writeJson(path.join(evaluationRoot, "dataset-manifest.json"), manifest);

const percent = (value) => `${(value * 100).toFixed(1)}%`;
const rows = results.flatMap((result) =>
  Object.entries(result.heldOut.metrics).map(([baseline, metrics]) =>
    `| ${result.repository} | ${result.heldOut.pullRequests} | ${baseline} | ${percent(metrics.precisionAt1)} | ${percent(metrics.recallAt3)} | ${metrics.meanReciprocalRank.toFixed(3)} |`,
  ),
).join("\n");
const details = results.map((result) =>
  `- ${result.repository}: ${result.pulled} merged pull requests fetched, ${result.labeled} had eligible review comments, ${result.heldOut.pullRequests} held out, ${percent(result.mappingCoverage)} of changed paths were supported source files present at the pull request head commit.`,
).join("\n");
const report = `# Evaluation

BlastRadius is evaluated as a changed-file review-ranking system. A positive label is a changed file that received at least one inline human review comment. Comments from bots and the pull request author are excluded.

## Held-out results

| Repository | n | Method | Precision@1 | Recall@3 | MRR |
| --- | ---: | --- | ---: | ---: | ---: |
${rows}

On Vite, BlastRadius ties the dependents baseline for Precision@1 but loses to churn on Recall@3 and loses narrowly to both churn and dependents on MRR. On Express, it ties dependents and leads churn on Precision@1. Flask has only two held-out labeled pull requests, so its 100 percent values are not a stable estimate.

## Dataset

${details}

The oldest 80 percent of labeled pull requests form the development split. The newest 20 percent are held out. Random is reported as its exact expected value. Churn orders files by changed lines. Dependents orders files by three-hop reverse-import reach at each pull request head commit, then churn. BlastRadius uses the published \`rank-v1\` policy.

## Limits

Inline comments are an observable proxy for reviewer attention, not ground truth for defects. Reviews without inline comments are excluded. Deleted files and unsupported non-source files do not appear in the repository graph. The Flask held-out split is only two pull requests and its percentages are not stable estimates. The manifest pins every pull request and head SHA, and the local cache can be rebuilt with \`npm run evaluate\`.
`;
fs.writeFileSync(path.join(evaluationRoot, "README.md"), report, "utf8");
process.stdout.write(`Wrote evaluation/results.json for ${results.length} repositories\n`);
