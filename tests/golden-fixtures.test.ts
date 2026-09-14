import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  analyzeChange,
  type AnalysisOptions,
  type AnalysisResult,
  type RepositoryFile,
} from "../packages/core/src/analyzer.ts";

const fixtureRoot = path.join(import.meta.dirname, "fixtures");
const sources = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "sources.json"), "utf8")) as Array<{ id: string }>;

for (const source of sources) {
  test(`golden output remains stable for ${source.id}`, () => {
    const directory = path.join(fixtureRoot, source.id);
    const diff = fs.readFileSync(path.join(directory, "change.diff"), "utf8");
    const repository = JSON.parse(fs.readFileSync(path.join(directory, "repository.json"), "utf8")) as {
      files: RepositoryFile[];
      options: AnalysisOptions;
    };
    const expected = JSON.parse(fs.readFileSync(path.join(directory, "expected.json"), "utf8")) as {
      policyVersion: string;
      sha256: string;
      result: AnalysisResult;
    };
    const result = analyzeChange(diff, repository.files, repository.options);
    const sha256 = createHash("sha256").update(JSON.stringify(result)).digest("hex");

    assert.equal(result.policyVersion, expected.policyVersion);
    assert.equal(sha256, expected.sha256);
    assert.deepEqual(result, expected.result);
  });
}
