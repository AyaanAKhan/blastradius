#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { analyzeChange, type AnalysisResult } from "../../core/src/analyzer.js";
import { mapTypeScriptRepository } from "../../core/src/compiler-adapter.js";

type CliOptions = {
  base?: string;
  head: string;
  repository: string;
  format: "markdown" | "json";
  output?: string;
};

const HELP = `BlastRadius compiler-backed pull-request impact analysis

Usage:
  blastradius [--base <ref>] [--head <ref>] [--repo <path>]
              [--format markdown|json] [--output <file>]

Defaults:
  --base HEAD^    --head HEAD    --repo current directory

Examples:
  blastradius --base main --head HEAD
  blastradius --base origin/main --format json --output report.json`;

function parseArguments(values: string[]): CliOptions {
  const options: CliOptions = {
    head: "HEAD",
    repository: process.cwd(),
    format: "markdown",
  };
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${HELP}\n`);
      process.exit(0);
    }
    if (argument === "--version" || argument === "-v") {
      process.stdout.write("1.1.1\n");
      process.exit(0);
    }
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    if (argument === "--base") options.base = value;
    else if (argument === "--head") options.head = value;
    else if (argument === "--repo") options.repository = value;
    else if (argument === "--format" && (value === "markdown" || value === "json")) options.format = value;
    else if (argument === "--output") options.output = value;
    else throw new Error(`Unknown argument: ${argument}`);
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

function markdown(result: AnalysisResult, diagnostics: string[]) {
  const factors = result.factors
    .map((factor) => `| ${factor.label} | ${factor.signal} | ${factor.explanation} |`)
    .join("\n");
  const targets = result.reviewOrder.length
    ? result.reviewOrder.map((target) =>
        `${target.rank}. \`${target.path}\` (${target.kind})\n   ${target.reasons.join("; ") || "Graph evidence"}`,
      ).join("\n")
    : "No review targets were produced.";
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

### Review order

${targets}

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

function run() {
  const options = parseArguments(process.argv.slice(2));
  const repository = path.resolve(options.repository);
  const base = options.base ?? git(repository, ["rev-parse", "HEAD^"]);
  git(repository, ["rev-parse", "--is-inside-work-tree"]);
  const diff = git(repository, ["diff", "--find-renames", "--binary", `${base}...${options.head}`]);
  if (!diff.trim()) throw new Error(`No changes found between ${base} and ${options.head}`);

  const mapping = mapTypeScriptRepository(repository);
  const result = analyzeChange(diff, mapping.files, mapping.options);
  const output = options.format === "json"
    ? `${JSON.stringify({ result, compiler: { configPath: mapping.configPath, diagnostics: mapping.diagnostics } }, null, 2)}\n`
    : `${markdown(result, mapping.diagnostics)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), output, "utf8");
  else process.stdout.write(output);
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`BlastRadius failed: ${message}\n`);
  process.exitCode = 1;
}
