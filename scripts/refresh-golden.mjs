import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { analyzeChange } from "../packages/core/dist/analyzer.js";

const fixtureRoot = path.resolve(import.meta.dirname, "..", "tests", "fixtures");
const sources = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "sources.json"), "utf8"));

for (const source of sources) {
  const directory = path.join(fixtureRoot, source.id);
  const diff = fs.readFileSync(path.join(directory, "change.diff"), "utf8");
  const repository = JSON.parse(fs.readFileSync(path.join(directory, "repository.json"), "utf8"));
  const result = analyzeChange(diff, repository.files, repository.options);
  const sha256 = createHash("sha256").update(JSON.stringify(result)).digest("hex");
  fs.writeFileSync(
    path.join(directory, "expected.json"),
    `${JSON.stringify({ policyVersion: result.policyVersion, sha256, result }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${source.id}: ${sha256}\n`);
}
