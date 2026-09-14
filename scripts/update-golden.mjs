import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { analyzeChange } from "../packages/core/dist/analyzer.js";
import { mapTypeScriptRepository } from "../packages/core/dist/compiler-adapter.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.join(repositoryRoot, "tests", "fixtures");
const sources = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "sources.json"), "utf8"));
const token = process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();

async function request(url, accept = "application/vnd.github+json") {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept,
          authorization: `Bearer ${token}`,
          "user-agent": "blastradius-fixture-builder",
          "x-github-api-version": "2022-11-28",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return accept.includes("diff") ? response.text() : response.json();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Unable to fetch ${url}`);
}

function slash(value) {
  return value.replaceAll("\\", "/");
}

function pythonSpecifier(raw) {
  const match = raw.match(/^(\.*)(.*)$/);
  const dots = match?.[1].length ?? 0;
  const modulePath = (match?.[2] ?? raw).replaceAll(".", "/");
  if (!dots) return modulePath;
  if (dots === 1) return `./${modulePath}`;
  return `${"../".repeat(dots - 1)}${modulePath}`;
}

function pythonImports(source) {
  const imports = new Set();
  for (const match of source.matchAll(/^\s*from\s+([.\w]+)\s+import\s+/gm)) imports.add(pythonSpecifier(match[1]));
  for (const match of source.matchAll(/^\s*import\s+([^\n#]+)/gm)) {
    for (const item of match[1].split(",")) {
      const moduleName = item.trim().split(/\s+as\s+/, 1)[0];
      if (moduleName) imports.add(pythonSpecifier(moduleName));
    }
  }
  return [...imports].slice(0, 80);
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
      files.push({
        path: relative,
        imports: pythonImports(source),
        isTest: /(^|\/)(test|tests)(\/|$)|test_.*\.py$/.test(relative),
        isSurface: /(^|\/)(routes?|views?|controllers?|handlers?)(\/|\.|$)/i.test(relative),
        hasDynamicImport: /\bimport_module\s*\(/.test(source),
      });
    }
  };
  visit(root);
  return { files, options: { aliases: {}, externalPackages: [] }, diagnostics: [] };
}

function cloneAt(repository, sha, destination) {
  execFileSync("git", ["init", "--quiet", destination]);
  execFileSync("git", ["-C", destination, "remote", "add", "origin", `https://github.com/${repository}.git`]);
  execFileSync("git", ["-C", destination, "fetch", "--quiet", "--depth", "1", "origin", sha], { timeout: 180_000 });
  execFileSync("git", ["-C", destination, "checkout", "--quiet", "FETCH_HEAD"]);
}

function compactMap(mapping, fullResult) {
  const selectedPaths = new Set([
    ...fullResult.changedFiles.map((file) => file.path),
    ...fullResult.nodes.map((node) => node.path),
  ]);
  return mapping.files.filter((file) => selectedPaths.has(file.path));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

for (const source of sources) {
  const metadata = await request(`https://api.github.com/repos/${source.repository}/pulls/${source.pullRequest}`);
  const diff = await request(
    `https://api.github.com/repos/${source.repository}/pulls/${source.pullRequest}`,
    "application/vnd.github.v3.diff",
  );
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), `${source.id}-`));
  try {
    cloneAt(source.repository, metadata.base.sha, checkout);
    const mapping = source.repository === "pallets/flask"
      ? mapPythonRepository(checkout)
      : mapTypeScriptRepository(checkout);
    const fullResult = analyzeChange(diff, mapping.files, mapping.options);
    const repositoryFiles = compactMap(mapping, fullResult);
    const result = analyzeChange(diff, repositoryFiles, mapping.options);
    const serialized = JSON.stringify(result);
    const directory = path.join(fixtureRoot, source.id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "change.diff"), diff.endsWith("\n") ? diff : `${diff}\n`, "utf8");
    writeJson(path.join(directory, "repository.json"), {
      files: repositoryFiles,
      options: mapping.options,
    });
    writeJson(path.join(directory, "expected.json"), {
      policyVersion: result.policyVersion,
      sha256: createHash("sha256").update(serialized).digest("hex"),
      result,
    });
    writeJson(path.join(directory, "provenance.json"), {
      repository: source.repository,
      pullRequest: source.pullRequest,
      url: metadata.html_url,
      baseSha: metadata.base.sha,
      mergedAt: metadata.merged_at,
      title: metadata.title,
    });
    process.stdout.write(`${source.id}: ${repositoryFiles.length} files, ${result.nodes.length} nodes\n`);
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true });
  }
}
