import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { analyzeChange } from "../packages/core/dist/analyzer.js";
import { mapTypeScriptRepository } from "../packages/core/dist/compiler-adapter.js";
import { mapPythonRepository } from "../packages/core/dist/python-adapter.js";
import { buildEvaluationArtifacts } from "./evaluation-report.mjs";

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
  const mappingFile = path.join(cacheRoot, slug(repository), "mappings-v2", `${pull.headSha}.json`);
  if (fs.existsSync(mappingFile)) return readJson(mappingFile);
  const bare = bareRepository(repository);
  const ref = `refs/evaluation/${pull.number}`;
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), `${slug(repository)}-${pull.number}-`));
  try {
    let cachedSha = "";
    try {
      cachedSha = execFileSync("git", [`--git-dir=${bare}`, "rev-parse", ref], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      cachedSha = "";
    }
    if (cachedSha !== pull.headSha) {
      execFileSync(
        "git",
        [`--git-dir=${bare}`, "fetch", "--quiet", "--depth", "1", "origin", `+refs/pull/${pull.number}/head:${ref}`],
        { timeout: 180_000 },
      );
    }
    execFileSync(
      "git",
      [`--git-dir=${bare}`, `--work-tree=${checkout}`, "checkout", "--force", ref, "--", "."],
      { timeout: 180_000 },
    );
    const mapping = configuration.mapper === "python"
      ? mapPythonRepository(checkout)
      : mapTypeScriptRepository(checkout, { collectDiagnostics: false });
    const result = {
      snapshotSha: execFileSync("git", [`--git-dir=${bare}`, "rev-parse", ref], { encoding: "utf8" }).trim(),
      configPath: mapping.configPath,
      diagnostics: mapping.diagnostics.slice(0, 10),
      files: mapping.files,
      options: mapping.options,
    };
    writeJson(mappingFile, result);
    return result;
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

const allExamples = [];
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
    const metricFile = path.join(cacheRoot, slug(repository), "historical-rank-v2", `${pull.number}.json`);
    if (fs.existsSync(metricFile)) {
      const cachedExample = readJson(metricFile);
      if (cachedExample.headSha === pull.headSha && cachedExample.sourceMetrics) {
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
    const diff = diffFor(pull.files);
    const policies = {
      rankV1: "rank-v1",
      noBuckets: "no-buckets",
      bucketsOnly: "buckets-only",
      churnOnly: "churn-only",
      rankV2: "rank-v2",
    };
    const analyses = Object.fromEntries(Object.entries(policies).map(([name, rankingPolicy]) => [
      name,
      analyzeChange(diff, mapping.files, { ...mapping.options, rankingPolicy }),
    ]));
    const reachCache = new Map();
    const orders = {
      churn: [...pull.files]
        .sort((left, right) =>
          (right.additions + right.deletions) - (left.additions + left.deletions) ||
          left.path.localeCompare(right.path))
        .map((file) => file.path),
      dependents: rankByDependents(pull.files, mapping, reachCache),
      ...Object.fromEntries(Object.entries(analyses).map(([name, analysis]) => [
        name,
        changedOrder(analysis, pull.files),
      ])),
    };
    const publishedFile = path.join(cacheRoot, slug(repository), "historical-rank-v1", `${pull.number}.json`);
    const published = fs.existsSync(publishedFile) ? readJson(publishedFile) : undefined;
    const sourceFiles = pull.files.filter((file) => knownPaths.has(file.path));
    const sourceLabels = new Set([...labels].filter((file) => knownPaths.has(file)));
    const metricsFor = (order) => orderedMetrics(order.filter((file) => knownPaths.has(file)), sourceLabels);
    const example = {
      repository,
      number: pull.number,
      url: pull.url,
      mergedAt: pull.mergedAt,
      headSha: pull.headSha,
      mappedSha: mapping.snapshotSha,
      files: pull.files.length,
      labeledFiles: labels.size,
      candidateFiles: pull.files.map((file) => file.path),
      labeledPaths: [...labels].sort(),
      mappedFiles: pull.files.filter((file) => knownPaths.has(file.path)).length,
      mappedLabeledFiles: sourceLabels.size,
      compilerDiagnostics: mapping.diagnostics.length,
      metrics: {
        random: randomMetrics(pull.files.length, labels.size),
        churn: orderedMetrics(orders.churn, labels),
        dependents: orderedMetrics(orders.dependents, labels),
        rankV1Published: published?.metrics?.blastradius ?? orderedMetrics(orders.rankV1, labels),
        rankV1: orderedMetrics(orders.rankV1, labels),
        noBuckets: orderedMetrics(orders.noBuckets, labels),
        bucketsOnly: orderedMetrics(orders.bucketsOnly, labels),
        churnOnly: orderedMetrics(orders.churnOnly, labels),
        rankV2: orderedMetrics(orders.rankV2, labels),
      },
      sourceMetrics: sourceFiles.length && sourceLabels.size ? {
        random: randomMetrics(sourceFiles.length, sourceLabels.size),
        churn: metricsFor(orders.churn),
        dependents: metricsFor(orders.dependents),
        rankV2: metricsFor(orders.rankV2),
      } : undefined,
    };
    writeJson(metricFile, example);
    examples.push(example);
    if ((index + 1) % 5 === 0 || index + 1 === labeledEvidence.length) {
      process.stdout.write(`${repository}: ${index + 1}/${labeledEvidence.length} historical graphs analyzed\n`);
    }
  }
  examples.sort((left, right) => left.mergedAt.localeCompare(right.mergedAt));
  const split = Math.floor(examples.length * 0.8);
  allExamples.push(...examples.map((example, index) => ({
    ...example,
    split: index < split ? "development" : "held-out",
  })));
  manifest.push({
    repository,
    pullRequests: evidence.map((pull) => ({
      number: pull.number,
      mergedAt: pull.mergedAt,
      headSha: pull.headSha,
      url: pull.url,
    })),
  });
  process.stdout.write(`${repository}: ${examples.length} labeled, ${examples.length - split} held out\n`);
}

writeJson(path.join(evaluationRoot, "examples.json"), allExamples);
writeJson(path.join(evaluationRoot, "dataset-manifest.json"), manifest);
buildEvaluationArtifacts(allExamples, evaluationRoot, { requestedLimit });
process.stdout.write(`Wrote evaluation artifacts for ${allExamples.length} labeled pull requests\n`);
