import assert from "node:assert/strict";
import test from "node:test";

import { analyzeChange, parseUnifiedDiff, type RepositoryFile } from "../lib/analyzer.ts";

const diff = `diff --git a/src/core/auth.ts b/src/core/auth.ts
--- a/src/core/auth.ts
+++ b/src/core/auth.ts
@@ -1 +1,2 @@
-export const allow = false
+export const allow = true
+export const reason = "fixture"`;

const repository: RepositoryFile[] = [
  { path: "src/core/auth.ts", imports: [], isTest: false, isSurface: false },
  { path: "src/api/session.ts", imports: ["../core/auth"], isTest: false, isSurface: false },
  { path: "src/app/api/session/route.ts", imports: ["../../../api/session"], isTest: false, isSurface: true },
  { path: "src/api/session.test.ts", imports: ["./session"], isTest: true, isSurface: false },
];

test("parseUnifiedDiff counts changed lines without counting file markers", () => {
  assert.deepEqual(parseUnifiedDiff(diff), [
    { path: "src/core/auth.ts", additions: 2, deletions: 1 },
  ]);
});

test("analysis follows reverse imports to a surface and related test", () => {
  const result = analyzeChange(diff, repository);
  assert.equal(result.changedFiles[0]?.path, "src/core/auth.ts");
  assert.ok(result.nodes.some((node) => node.path === "src/app/api/session/route.ts" && node.kind === "surface"));
  assert.ok(result.nodes.some((node) => node.path === "src/api/session.test.ts" && node.kind === "test"));
  assert.equal(result.stats.impactedSurfaces, 1);
  assert.equal(result.stats.impactedTests, 1);
});

test("test changes lower review attention compared with implementation-only changes", () => {
  const withTest = `${diff}

diff --git a/src/api/session.test.ts b/src/api/session.test.ts
--- a/src/api/session.test.ts
+++ b/src/api/session.test.ts
@@ -2,0 +3,1 @@
+expect(session.allowed).toBe(true)`;
  assert.ok(analyzeChange(withTest, repository).score < analyzeChange(diff, repository).score);
});

test("analysis names missing repository context instead of hiding uncertainty", () => {
  const result = analyzeChange(diff, []);
  assert.ok(result.unknowns.some((unknown) => unknown.includes("No repository map")));
  assert.ok(result.confidence < 0.7);
});

test("reverse traversal stops after three dependency hops", () => {
  const files: RepositoryFile[] = [
    { path: "src/a.ts", imports: [], isTest: false, isSurface: false },
    { path: "src/b.ts", imports: ["./a"], isTest: false, isSurface: false },
    { path: "src/c.ts", imports: ["./b"], isTest: false, isSurface: false },
    { path: "src/d.ts", imports: ["./c"], isTest: false, isSurface: true },
    { path: "src/e.ts", imports: ["./d"], isTest: false, isSurface: true },
  ];
  const change = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-export const value = 1
+export const value = 2`;
  const result = analyzeChange(change, files);

  assert.equal(result.nodes.find((node) => node.path === "src/d.ts")?.depth, 3);
  assert.equal(result.nodes.some((node) => node.path === "src/e.ts"), false);
});

test("unresolved relative imports are reported and reduce confidence", () => {
  const unresolvedRepository: RepositoryFile[] = [
    ...repository,
    {
      path: "src/api/orphan.ts",
      imports: ["../missing/module"],
      isTest: false,
      isSurface: false,
    },
  ];
  const complete = analyzeChange(diff, repository);
  const incomplete = analyzeChange(diff, unresolvedRepository);

  assert.ok(incomplete.unknowns.some((unknown) => unknown.includes("could not be resolved")));
  assert.ok(incomplete.confidence < complete.confidence);
});

test("configuration changes contribute explicit review evidence", () => {
  const configDiff = `diff --git a/config/schema.ts b/config/schema.ts
--- a/config/schema.ts
+++ b/config/schema.ts
@@ -1 +1 @@
-export const version = 1
+export const version = 2`;
  const result = analyzeChange(configDiff, []);
  const factor = result.factors.find((entry) => entry.label === "Configuration reach");

  assert.ok(factor);
  assert.equal(factor.contribution, 10);
  assert.match(factor.explanation, /1 configuration/);
});

test("the same evidence always produces the same result", () => {
  assert.deepEqual(analyzeChange(diff, repository), analyzeChange(diff, repository));
});
