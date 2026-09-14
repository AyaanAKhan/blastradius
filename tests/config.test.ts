import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeAnalysisOptions,
  parseBlastRadiusConfig,
} from "../packages/core/src/config.ts";

test("project configuration validates and merges analyzer settings", () => {
  const config = parseBlastRadiusConfig(JSON.stringify({
    sensitiveTerms: ["ledger", "ledger"],
    hopLimit: 4,
    ignore: ["fixtures/**"],
    format: "sarif",
    failOn: "watchlist",
    rankingPolicy: "rank-v2",
  }));
  const options = mergeAnalysisOptions({ aliases: { "@/": "src" } }, config);

  assert.deepEqual(config.sensitiveTerms, ["ledger"]);
  assert.equal(config.format, "sarif");
  assert.equal(options.hopLimit, 4);
  assert.equal(options.rankingPolicy, "rank-v2");
});

test("project configuration rejects unknown and invalid fields", () => {
  assert.throws(() => parseBlastRadiusConfig('{"hopLimit":0}'), /hopLimit/);
  assert.throws(() => parseBlastRadiusConfig('{"surprise":true}'), /Unknown/);
});
