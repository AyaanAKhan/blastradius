#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  analyzeChange,
  CONFIG_FILE,
  mapPythonRepository,
  mapTypeScriptRepository,
  mergeAnalysisOptions,
  parseBlastRadiusConfig,
  type AnalysisResult,
  type BlastRadiusConfig,
  type CompilerMap,
} from "@blastradius/core";

type OutputFormat = "markdown" | "json" | "sarif";
type FailureMode = "never" | "unknowns" | "watchlist";

type CliOptions = {
  base?: string;
  head: string;
  repository: string;
  format?: OutputFormat;
  failOn?: FailureMode;
  output?: string;
};

const VERSION = "1.2.0";
const HELP = `BlastRadius compiler-backed pull-request impact analysis

Usage:
  blastradius [--base <ref>] [--head <ref>] [--repo <path>]
              [--format markdown|json|sarif] [--fail-on never|unknowns|watchlist]
              [--output <file>] [--no-color]

Defaults:
  --base HEAD^    --head HEAD    --repo current directory

Configuration:
  ${CONFIG_FILE} at the repository root can set sensitiveTerms, hopLimit,
  ignore, format, failOn, and rankingPolicy. Command-line values win.

Examples:
  blastradius --base main --head HEAD
  blastradius --base origin/main --format json --output report.json`;

function parseArguments(values: string[]): CliOptions {
  const options: CliOptions = { head: "HEAD", repository: process.cwd() };
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${HELP}\n`);
      process.exit(0);
    }
    if (argument === "--version" || argument === "-v") {
      process.stdout.write(`${VERSION}\n`);
      process.exit(0);
    }
    if (argument === "--no-color") continue;
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    if (argument === "--base") options.base = value;
    else if (argument === "--head") options.head = value;
    else if (argument === "--repo") options.repository = value;
    else if (argument === "--format" && ["markdown", "json", "sarif"].includes(value)) options.format = value as OutputFormat;
    else if (argument === "--fail-on" && ["never", "unknowns", "watchlist"].includes(value)) options.failOn = value as FailureMode;
    else if (argument === "--output") options.output = value;
    else throw new Error(`Unknown argument or value: ${argument} ${value}`);
    index += 1;
  }
  return options;
}

function git(repository: string, arguments_: string[]) {
  return execFileSync("git", ["-C", repository, ...arguments_], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function loadConfig(repository: string): BlastRadiusConfig {
  const configPath = path.join(repository, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return {};
  try {
    return parseBlastRadiusConfig(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${CONFIG_FILE}: ${message}`);
  }
}

function globExpression(pattern: string) {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") expression += "[^/]*";
    else if (character === "?") expression += "[^/]";
    else expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`^${expression}$`);
}

function mergeMappings(typeScript: CompilerMap, python: CompilerMap, ignore: string[] = []): CompilerMap {
  const ignored = ignore.map(globExpression);
  const files = [...typeScript.files, ...python.files]
    .filter((file, index, all) => all.findIndex((candidate) => candidate.path === file.path) === index)
    .filter((file) => !ignored.some((pattern) => pattern.test(file.path)))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    files,
    options: typeScript.options,
    diagnostics: typeScript.diagnostics,
    configPath: typeScript.configPath,
  };
}

const MAPPING_EXTENSIONS = /\.(?:tsx?|jsx?|mjs|cjs|py)$/i;
const MAPPING_IGNORES = new Set([".git", "node_modules", ".next", "dist", "build", "out", "coverage", ".venv", "venv", "__pycache__"]);

function mappingFingerprint(repository: string) {
  const hash = createHash("sha256").update(`mapping-v3:${VERSION}\0`);
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory() && MAPPING_IGNORES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && (MAPPING_EXTENSIONS.test(entry.name) || ["package.json", "tsconfig.json", "jsconfig.json", CONFIG_FILE].includes(entry.name))) {
        hash.update(path.relative(repository, absolute).replaceAll("\\", "/")).update("\0");
        hash.update(fs.readFileSync(absolute)).update("\0");
      }
    }
  };
  visit(repository);
  return hash.digest("hex");
}

function mapRepository(repository: string, config: BlastRadiusConfig) {
  const fingerprint = mappingFingerprint(repository);
  const gitDirectory = path.resolve(repository, git(repository, ["rev-parse", "--git-dir"]));
  const cachePath = path.join(gitDirectory, "blastradius-mapping-v3.json");
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as { fingerprint?: string; mapping?: CompilerMap };
      if (cached.fingerprint === fingerprint && cached.mapping) return cached.mapping;
    } catch {
      // A partial or stale cache is replaced below.
    }
  }
  const mapping = mergeMappings(
    mapTypeScriptRepository(repository),
    mapPythonRepository(repository),
    config.ignore,
  );
  fs.writeFileSync(cachePath, `${JSON.stringify({ fingerprint, mapping })}\n`, "utf8");
  return mapping;
}

function markdown(result: AnalysisResult, diagnostics: string[]) {
  const factors = result.factors
    .map((factor) => `| ${factor.label} | ${factor.signal} | ${factor.explanation} |`)
    .join("\n");
  const targets = result.reviewOrder.length
    ? result.reviewOrder.slice(0, 10).map((target) =>
        `${target.rank}. \`${target.path}\` (${target.kind})\n   ${target.reasons.join("; ") || "Graph evidence"}`,
      ).join("\n") + (result.reviewOrder.length > 10 ? `\n\n${result.reviewOrder.length - 10} additional changed files omitted from this Markdown view.` : "")
    : "No changed-file review targets were produced.";
  const watchlist = result.impactWatchlist.length
    ? result.impactWatchlist.slice(0, 10).map((target) =>
        `- \`${target.path}\` (${target.kind}, hop ${target.depth})\n  ${target.reasons.join("; ") || "Graph evidence"}`,
      ).join("\n") + (result.impactWatchlist.length > 10 ? `\n\n${result.impactWatchlist.length - 10} additional watchlist files omitted from this Markdown view.` : "")
    : "- No unchanged downstream files were reached.";
  const verification = result.verificationPlan.map((step) => `- [ ] ${step}`).join("\n");
  const unknowns = result.unknowns.length
    ? result.unknowns.map((unknown) => `- ${unknown}`).join("\n")
    : "- None reported.";
  const compilerNote = diagnostics.length
    ? `\nCompiler diagnostics: ${diagnostics.length}. The first ${Math.min(3, diagnostics.length)} are shown below.\n\n${diagnostics.slice(0, 3).map((item) => `- ${item}`).join("\n")}\n`
    : "";

  return `## BlastRadius review plan

Policy: \`${result.policyVersion}\` | Confidence: ${Math.round(result.confidence * 100)}% | Changed: ${result.changedFiles.length} | Downstream: ${result.stats.impactedFiles}

${result.brief}

### Changed-file review order

${targets}

### Downstream watchlist

These files are unchanged context and are not part of the evaluated changed-file ranking.

${watchlist}

### Evidence

| Signal | Direction | Observation |
| --- | --- | --- |
${factors}

### Verification

${verification}

### Unknowns

${unknowns}
${compilerNote}`;
}

function sarif(result: AnalysisResult) {
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: {
        driver: {
          name: "BlastRadius",
          version: VERSION,
          informationUri: "https://ayaanakhan.github.io/blastradius/",
          rules: [{
            id: "downstream-impact",
            name: "DownstreamImpact",
            shortDescription: { text: "Changed code reaches an unchanged downstream file." },
            defaultConfiguration: { level: "note" },
          }],
        },
      },
      results: result.impactWatchlist.map((target) => ({
        ruleId: "downstream-impact",
        level: "note",
        message: { text: target.reasons.join("; ") || `Reached at hop ${target.depth}.` },
        locations: [{ physicalLocation: { artifactLocation: { uri: target.path } } }],
        properties: { kind: target.kind, depth: target.depth, policyVersion: result.policyVersion },
      })),
    }],
  };
}

function run() {
  const options = parseArguments(process.argv.slice(2));
  const repository = path.resolve(options.repository);
  const config = loadConfig(repository);
  const format = options.format ?? config.format ?? "markdown";
  const failOn = options.failOn ?? config.failOn ?? "never";
  const base = options.base ?? git(repository, ["rev-parse", "HEAD^"]);
  git(repository, ["rev-parse", "--is-inside-work-tree"]);
  const diff = git(repository, ["diff", "--no-color", "-M", `${base}...${options.head}`]);
  if (!diff.trim()) throw new Error(`No changes found between ${base} and ${options.head}`);

  const mapping = mapRepository(repository, config);
  const analysisOptions = mergeAnalysisOptions(mapping.options, config);
  const result = analyzeChange(diff, mapping.files, analysisOptions);
  const output = format === "json"
    ? `${JSON.stringify({ result, mapping: { configPath: mapping.configPath, diagnostics: mapping.diagnostics } }, null, 2)}\n`
    : format === "sarif"
      ? `${JSON.stringify(sarif(result), null, 2)}\n`
      : `${markdown(result, mapping.diagnostics)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), output, "utf8");
  else process.stdout.write(output);

  if (failOn === "unknowns" && result.unknowns.length) process.exitCode = 2;
  if (failOn === "watchlist" && result.impactWatchlist.length) process.exitCode = 2;
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`BlastRadius failed: ${message}\n`);
  process.exitCode = 1;
}
