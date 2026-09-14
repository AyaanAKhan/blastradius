import fs from "node:fs";
import path from "node:path";

const METRICS = ["precisionAt1", "recallAt3", "meanReciprocalRank"];
const METHODS = [
  "random",
  "churn",
  "dependents",
  "rankV1Published",
  "rankV1",
  "noBuckets",
  "bucketsOnly",
  "churnOnly",
  "rankV2",
];
const LABELS = {
  random: "Random expected value",
  churn: "Churn",
  dependents: "Dependents",
  rankV1Published: "Published rank-v1",
  rankV1: "Full-list rank-v1",
  noBuckets: "No buckets",
  bucketsOnly: "Buckets only",
  churnOnly: "Churn-only policy",
  rankV2: "BlastRadius rank-v2",
};
const RESAMPLES = 10_000;
const SENSITIVE_TERMS = ["auth", "billing", "checkout", "payment", "permission", "role", "security", "session", "token", "webhook"];

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values, probability) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const remainder = position - lower;
  return sorted[lower + 1] === undefined
    ? sorted[lower]
    : sorted[lower] + remainder * (sorted[lower + 1] - sorted[lower]);
}

function seedFor(value) {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function randomGenerator(seed) {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrap(values, seed) {
  if (!values.length) return { value: 0, ci95: [0, 0] };
  if (values.length === 1) return { value: round(values[0]), ci95: [round(values[0]), round(values[0])] };
  const random = randomGenerator(seed);
  const samples = new Array(RESAMPLES);
  for (let sample = 0; sample < RESAMPLES; sample += 1) {
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) {
      sum += values[Math.floor(random() * values.length)];
    }
    samples[sample] = sum / values.length;
  }
  return {
    value: round(mean(values)),
    ci95: [round(quantile(samples, 0.025)), round(quantile(samples, 0.975))],
  };
}

function bootstrapMedian(values, seed) {
  if (!values.length) return { value: 0, ci95: [0, 0], statistic: "median" };
  if (values.length === 1) return { value: round(values[0]), ci95: [round(values[0]), round(values[0])], statistic: "median" };
  const random = randomGenerator(seed);
  const samples = new Array(RESAMPLES);
  for (let sample = 0; sample < RESAMPLES; sample += 1) {
    const draw = new Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
      draw[index] = values[Math.floor(random() * values.length)];
    }
    samples[sample] = quantile(draw, 0.5);
  }
  return {
    value: round(quantile(values, 0.5)),
    ci95: [round(quantile(samples, 0.025)), round(quantile(samples, 0.975))],
    statistic: "median",
  };
}

function summarize(examples, methods = METHODS, scope = "all") {
  return Object.fromEntries(methods.map((method) => [
    method,
    Object.fromEntries(METRICS.map((metric) => [
      metric,
      bootstrap(examples.map((example) => example.metrics[method][metric]), seedFor(`${scope}:${method}:${metric}`)),
    ])),
  ]));
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return (1 + erf) / 2;
}

function wilcoxonSignedRank(values) {
  const nonzero = values.filter((value) => Math.abs(value) > 1e-12);
  if (!nonzero.length) return { n: 0, statistic: 0, pValue: 1 };
  const ordered = nonzero
    .map((value) => ({ value, absolute: Math.abs(value), rank: 0 }))
    .sort((left, right) => left.absolute - right.absolute);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].absolute === ordered[start].absolute) end += 1;
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) ordered[index].rank = averageRank;
    start = end;
  }
  const positive = ordered.filter((item) => item.value > 0).reduce((sum, item) => sum + item.rank, 0);
  const negative = ordered.filter((item) => item.value < 0).reduce((sum, item) => sum + item.rank, 0);
  const n = ordered.length;
  const expected = n * (n + 1) / 4;
  const standardDeviation = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
  const z = standardDeviation ? (positive - expected) / standardDeviation : 0;
  return { n, statistic: round(Math.min(positive, negative)), pValue: round(Math.min(1, 2 * (1 - normalCdf(Math.abs(z))))) };
}

function paired(examples, left, right, scope) {
  return Object.fromEntries(METRICS.map((metric) => {
    const differences = examples.map((example) => example.metrics[left][metric] - example.metrics[right][metric]);
    return [metric, {
      meanDifference: bootstrap(differences, seedFor(`${scope}:mean:${left}:${right}:${metric}`)),
      medianDifference: bootstrapMedian(differences, seedFor(`${scope}:median:${left}:${right}:${metric}`)),
      wilcoxon: wilcoxonSignedRank(differences),
    }];
  }));
}

function normalizedLift(examples, method, baseline, scope) {
  return Object.fromEntries(METRICS.map((metric) => {
    const statistic = (sample) => {
      const methodMean = mean(sample.map((example) => example.metrics[method][metric]));
      const baselineMean = mean(sample.map((example) => example.metrics[baseline][metric]));
      const headroom = 1 - baselineMean;
      return headroom > 1e-12 ? (methodMean - baselineMean) / headroom : 0;
    };
    if (!examples.length) return [metric, { value: 0, ci95: [0, 0], statistic: "normalized lift" }];
    const random = randomGenerator(seedFor(`${scope}:${method}:${baseline}:${metric}`));
    const samples = new Array(RESAMPLES);
    for (let sampleIndex = 0; sampleIndex < RESAMPLES; sampleIndex += 1) {
      const sample = new Array(examples.length);
      for (let index = 0; index < examples.length; index += 1) {
        sample[index] = examples[Math.floor(random() * examples.length)];
      }
      samples[sampleIndex] = statistic(sample);
    }
    return [metric, {
      value: round(statistic(examples)),
      ci95: [round(quantile(samples, 0.025)), round(quantile(samples, 0.975))],
      statistic: "normalized lift",
    }];
  }));
}

function distribution(values) {
  return {
    min: Math.min(...values),
    p25: round(quantile(values, 0.25), 2),
    median: round(quantile(values, 0.5), 2),
    p75: round(quantile(values, 0.75), 2),
    max: Math.max(...values),
  };
}

function sensitivePath(value) {
  const words = value.toLowerCase().split("/").flatMap((segment) => segment.split(/[^a-z0-9]+/)).filter(Boolean);
  return SENSITIVE_TERMS.some((term) => words.includes(term));
}

function percentage(metric) {
  return `${(metric.value * 100).toFixed(1)}% [${(metric.ci95[0] * 100).toFixed(1)}, ${(metric.ci95[1] * 100).toFixed(1)}]`;
}

function metricRow(name, metrics) {
  return `| ${name} | ${percentage(metrics.precisionAt1)} | ${percentage(metrics.recallAt3)} | ${metrics.meanReciprocalRank.value.toFixed(3)} [${metrics.meanReciprocalRank.ci95[0].toFixed(3)}, ${metrics.meanReciprocalRank.ci95[1].toFixed(3)}] |`;
}

export function buildEvaluationArtifacts(examples, evaluationRoot, options = {}) {
  const development = examples.filter((example) => example.split === "development");
  const heldOut = examples.filter((example) => example.split === "held-out");
  const hardHeldOut = heldOut
    .filter((example) => example.mappedFiles >= 4 && example.mappedLabeledFiles >= 1 && example.mappedLabeledFiles <= 2 && example.sourceMetrics)
    .map((example) => ({ ...example, metrics: example.sourceMetrics }));
  const repositoryNames = [...new Set(examples.map((example) => example.repository))].sort();
  const candidateFilesByRepository = Object.fromEntries(repositoryNames.map((repository) => [
    repository,
    distribution(examples.filter((example) => example.repository === repository).map((example) => example.files)),
  ]));
  const byRepository = Object.fromEntries(repositoryNames.map((repository) => {
    const repositoryExamples = heldOut.filter((example) => example.repository === repository);
    return [repository, {
      n: repositoryExamples.length,
      stableForHeadline: repositoryExamples.length >= 10,
      metrics: repositoryExamples.length >= 10
        ? summarize(repositoryExamples, ["random", "churn", "dependents", "rankV2"], `repo:${repository}`)
        : undefined,
    }];
  }));
  const mappedFiles = examples.reduce((sum, example) => sum + example.mappedFiles, 0);
  const totalFiles = examples.reduce((sum, example) => sum + example.files, 0);
  const developmentFiles = development.flatMap((example) => example.candidateFiles.map((file) => ({
    file,
    labeled: example.labeledPaths.includes(file),
  })));
  const sensitiveFiles = developmentFiles.filter((item) => sensitivePath(item.file));
  const heldOutMetrics = summarize(heldOut, ["random", "churn", "dependents", "rankV1Published", "rankV2"], "held-out");
  const result = {
    policyVersion: "rank-v2",
    generatedFrom: "evaluation/examples.json",
    bootstrapResamples: RESAMPLES,
    requestedPullRequestsPerRepository: options.requestedLimit,
    totalLabeledPullRequests: examples.length,
    totalHeldOutPullRequests: heldOut.length,
    label: "Changed file with at least one inline human review comment, excluding the pull request author and bots.",
    split: "Within each repository, oldest 80 percent development and newest 20 percent held out.",
    methods: LABELS,
    candidateFiles: distribution(examples.map((example) => example.files)),
    candidateFilesByRepository,
    mappingCoverage: totalFiles ? round(mappedFiles / totalFiles) : 0,
    developmentSensitiveSignal: {
      files: developmentFiles.length,
      matchedFiles: sensitiveFiles.length,
      firingRate: developmentFiles.length ? round(sensitiveFiles.length / developmentFiles.length) : 0,
      precisionWhenMatched: sensitiveFiles.length ? round(sensitiveFiles.filter((item) => item.labeled).length / sensitiveFiles.length) : 0,
      overallLabelRate: developmentFiles.length ? round(developmentFiles.filter((item) => item.labeled).length / developmentFiles.length) : 0,
    },
    heldOut: { n: heldOut.length, metrics: heldOutMetrics },
    hardSubset: {
      definition: "At least four candidate files and one or two labeled files.",
      n: hardHeldOut.length,
      metrics: summarize(hardHeldOut, ["random", "churn", "dependents", "rankV2"], "hard-held-out"),
    },
    pairedAgainstDependents: {
      n: heldOut.length,
      rankV2: paired(heldOut, "rankV2", "dependents", "paired-held-out"),
      liftOverRandom: normalizedLift(heldOut, "rankV2", "random", "lift-held-out"),
    },
    developmentAblation: {
      n: development.length,
      metrics: summarize(development, ["rankV1Published", "rankV1", "noBuckets", "bucketsOnly", "churnOnly", "rankV2"], "development-ablation"),
    },
    byRepository,
  };

  const resultPath = path.join(evaluationRoot, "results.json");
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const heldRows = ["random", "churn", "dependents", "rankV1Published", "rankV2"]
    .map((method) => metricRow(LABELS[method], heldOutMetrics[method]))
    .join("\n");
  const hardRows = ["random", "churn", "dependents", "rankV2"]
    .map((method) => metricRow(LABELS[method], result.hardSubset.metrics[method]))
    .join("\n");
  const ablationRows = ["rankV1Published", "rankV1", "noBuckets", "bucketsOnly", "churnOnly", "rankV2"]
    .map((method) => metricRow(LABELS[method], result.developmentAblation.metrics[method]))
    .join("\n");
  const repositoryRows = Object.entries(byRepository)
    .filter(([, value]) => value.stableForHeadline)
    .flatMap(([repository, value]) => ["dependents", "rankV2"].map((method) =>
      `| ${repository} | ${value.n} | ${LABELS[method]} | ${(value.metrics[method].precisionAt1.value * 100).toFixed(1)}% | ${(value.metrics[method].recallAt3.value * 100).toFixed(1)}% | ${value.metrics[method].meanReciprocalRank.value.toFixed(3)} |`,
    )).join("\n");
  const liftRows = METRICS.map((metric) => {
    const value = result.pairedAgainstDependents.liftOverRandom[metric];
    return `| ${metric} | ${(value.value * 100).toFixed(1)}% | ${(value.ci95[0] * 100).toFixed(1)}% to ${(value.ci95[1] * 100).toFixed(1)}% |`;
  }).join("\n");
  const candidateRows = Object.entries(candidateFilesByRepository).map(([repository, value]) =>
    `| ${repository} | ${value.min} | ${value.p25} | ${value.median} | ${value.p75} | ${value.max} |`,
  ).join("\n");
  const comparison = result.pairedAgainstDependents.rankV2.meanReciprocalRank;
  const comparisonText = comparison.meanDifference.ci95[0] > 0
    ? "rank-v2 improves held-out MRR over the dependents baseline in this sample"
    : comparison.meanDifference.ci95[1] < 0
      ? "rank-v2 trails the dependents baseline on held-out MRR in this sample"
      : "the held-out MRR difference between rank-v2 and dependents is inconclusive because its paired interval includes zero";
  const sparse = Object.entries(byRepository)
    .filter(([, value]) => !value.stableForHeadline)
    .map(([repository, value]) => `${repository} (n=${value.n})`)
    .join(", ");
  const report = `# Evaluation

BlastRadius is evaluated as a changed-file review-ranking system. A positive label is a changed file that received at least one inline human review comment. Comments from bots and the pull request author are excluded.

## Pooled held-out results

Values are means with deterministic 95 percent bootstrap intervals from ${RESAMPLES.toLocaleString("en-US")} resamples.

| Method | Precision@1 | Recall@3 | MRR |
| --- | ---: | ---: | ---: |
${heldRows}

The primary comparison is honest and limited: ${comparisonText}. The paired mean MRR difference is ${comparison.meanDifference.value.toFixed(3)} with a 95 percent interval of [${comparison.meanDifference.ci95[0].toFixed(3)}, ${comparison.meanDifference.ci95[1].toFixed(3)}]. The median paired difference is ${comparison.medianDifference.value.toFixed(3)} [${comparison.medianDifference.ci95[0].toFixed(3)}, ${comparison.medianDifference.ci95[1].toFixed(3)}], and the Wilcoxon signed-rank p-value is ${comparison.wilcoxon.pValue.toFixed(4)}. This evidence does not establish defect prediction.

### Normalized lift over random

Lift is \`(rank-v2 - random) / (1 - random)\`. Positive values use some of the available headroom above random.

| Metric | Lift | 95 percent interval |
| --- | ---: | ---: |
${liftRows}

### Repository breakdown

Groups below n=10 are omitted from this table. Intervals remain available in \`results.json\`.

| Repository | n | Method | Precision@1 | Recall@3 | MRR |
| --- | ---: | --- | ---: | ---: | ---: |
${repositoryRows}

## Hard subset

The hard subset has at least four mapped candidate source files and one or two labeled source files. It contains ${hardHeldOut.length} held-out pull requests.

| Method | Precision@1 | Recall@3 | MRR |
| --- | ---: | ---: | ---: |
${hardRows}

## Design evidence

The development-only ablation compares the originally published truncated rank-v1 output, the corrected full rank-v1 list, bucket removal, buckets alone, churn alone, and rank-v2. The held-out split was not used to choose rank-v2. See \`results.json\` for every interval and \`examples.json\` for the committed per-example measurements.

| Development policy | Precision@1 | Recall@3 | MRR |
| --- | ---: | ---: | ---: |
${ablationRows}

rank-v2 was selected on these 95 development examples, where it has the strongest P@1 and MRR among the listed policies. The published rank-v1 versus full-list rank-v1 rows expose the effect of fixing the ten-item truncation. The held-out split has now been evaluated for two published policy versions, rank-v1 and rank-v2. Further policy tuning requires a new validation split.

## Dataset

- ${examples.length} labeled pull requests, with ${heldOut.length} held out.
- Candidate count distribution: min ${result.candidateFiles.min}, p25 ${result.candidateFiles.p25}, median ${result.candidateFiles.median}, p75 ${result.candidateFiles.p75}, max ${result.candidateFiles.max}.
- Mapping coverage across changed paths: ${(result.mappingCoverage * 100).toFixed(1)} percent.
- The default sensitive-path signal fired on ${(result.developmentSensitiveSignal.firingRate * 100).toFixed(1)} percent of development files. Its file-level label precision was ${(result.developmentSensitiveSignal.precisionWhenMatched * 100).toFixed(1)} percent versus an overall label rate of ${(result.developmentSensitiveSignal.overallLabelRate * 100).toFixed(1)} percent.
- Repository-specific metrics are excluded from headline interpretation below n=10.${sparse ? ` Sparse held-out groups: ${sparse}.` : ""}

| Repository | Min | P25 | Median | P75 | Max changed files |
| --- | ---: | ---: | ---: | ---: | ---: |
${candidateRows}

The oldest 80 percent within each repository form the development split. The newest 20 percent are held out. Random is its exact expected value. Churn orders changed files by line count. Dependents orders by reverse-import reach and then churn. rank-v2 orders changed files by reverse-import reach, churn, and path, with lockfiles last. Unchanged dependents are reported separately as a watchlist.

## Reproduce without network access

Run \`npm run evaluation:report\`. It reads only the committed \`evaluation/examples.json\` file and regenerates \`results.json\` plus this report. Rebuilding repository snapshots requires network access through \`npm run evaluate\`.

## Limits

Inline comments are an observable proxy for reviewer attention, not ground truth for defects. Reviews without inline comments are excluded. Deleted files and unsupported non-source files do not appear in the repository graph. Small repository slices are not treated as stable estimates. Confidence intervals quantify sampling uncertainty in this dataset, not all sources of bias.
`;
  fs.writeFileSync(path.join(evaluationRoot, "README.md"), report, "utf8");
  return result;
}
