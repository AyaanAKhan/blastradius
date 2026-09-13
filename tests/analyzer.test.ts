import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeChange,
  applyAlias,
  classifySpecifier,
  parseUnifiedDiff,
  testMatchesSource,
  type RepositoryFile,
} from "../lib/analyzer.ts";

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
    { path: "src/core/auth.ts", additions: 2, deletions: 1, changeType: "modified" },
  ]);
});

test("parseUnifiedDiff handles no-prefix patches", () => {
  const patch = `--- src/a.ts
+++ src/a.ts
@@ -1 +1 @@
-old
+new`;
  assert.deepEqual(parseUnifiedDiff(patch), [
    { path: "src/a.ts", additions: 1, deletions: 1, changeType: "modified" },
  ]);
});

test("parseUnifiedDiff counts content beginning with three plus signs", () => {
  const patch = `diff --git a/notes.md b/notes.md
--- a/notes.md
+++ b/notes.md
@@ -0,0 +1 @@
+++ content, not a file marker`;
  assert.equal(parseUnifiedDiff(patch)[0]?.additions, 1);
});

test("parseUnifiedDiff labels renames and binary changes", () => {
  const rename = `diff --git a/src/old.ts b/src/new.ts
similarity index 100%
rename from src/old.ts
rename to src/new.ts`;
  const binary = `diff --git a/public/old.png b/public/new.png
index 123..456 100644
Binary files a/public/old.png and b/public/new.png differ`;

  assert.equal(parseUnifiedDiff(rename)[0]?.changeType, "renamed");
  assert.equal(parseUnifiedDiff(rename)[0]?.path, "src/new.ts");
  assert.equal(parseUnifiedDiff(binary)[0]?.changeType, "binary");
});

test("parseUnifiedDiff returns no invented file when parsing fails", () => {
  assert.deepEqual(parseUnifiedDiff("not a unified diff"), []);
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

test("configured aliases resolve into the dependency graph", () => {
  const files: RepositoryFile[] = [
    { path: "lib/core.ts", imports: [], isTest: false, isSurface: false },
    { path: "app/page.tsx", imports: ["@/lib/core"], isTest: false, isSurface: true },
  ];
  const change = `diff --git a/lib/core.ts b/lib/core.ts
--- a/lib/core.ts
+++ b/lib/core.ts
@@ -1 +1 @@
-export const value = 1
+export const value = 2`;
  const result = analyzeChange(change, files, { aliases: { "@/": "./" } });

  assert.ok(result.edges.some((edge) => edge.from === "lib/core.ts" && edge.to === "app/page.tsx"));
  assert.equal(result.stats.unresolvedImports, 0);
});

test("an unconfigured alias is visible and caps an empty graph confidence", () => {
  const files: RepositoryFile[] = [
    { path: "lib/core.ts", imports: [], isTest: false, isSurface: false },
    ...Array.from({ length: 6 }, (_, index): RepositoryFile => ({
      path: `app/page-${index}.tsx`,
      imports: ["@/lib/core"],
      isTest: false,
      isSurface: true,
    })),
  ];
  const result = analyzeChange(diff.replaceAll("src/core/auth.ts", "lib/core.ts"), files);

  assert.ok(result.unknowns.some((unknown) => unknown.includes("unrecognized path alias")));
  assert.ok(result.unknowns.some((unknown) => unknown.includes("confidence is capped")));
  assert.ok(result.confidence <= 0.35);
});

test("external packages do not count as unresolved imports", () => {
  const files: RepositoryFile[] = [
    { path: "src/core/auth.ts", imports: ["react", "@next/font/google"], isTest: false, isSurface: false },
  ];
  const result = analyzeChange(diff, files);

  assert.equal(classifySpecifier("react"), "external");
  assert.equal(classifySpecifier("@next/font/google"), "external");
  assert.equal(result.stats.unresolvedImports, 0);
  assert.equal(result.stats.ignoredExternalImports, 2);
});

test("applyAlias expands the longest matching prefix", () => {
  assert.equal(applyAlias("@/lib/analyzer", { "@/": "./", "@/lib/": "src/core/" }), "src/core/analyzer");
});

test("test matching accepts exact names and rejects substring collisions", () => {
  assert.equal(testMatchesSource("src/api/session.test.ts", "src/api/session.ts"), true);
  assert.equal(testMatchesSource("tests/test_ledger.py", "src/ledger.py"), true);
  assert.equal(testMatchesSource("tests/dbdriver-unrelated.test.ts", "src/db.ts"), false);
  assert.equal(testMatchesSource("src/api/session.test.ts", "src/a.ts"), false);
  assert.equal(testMatchesSource("src/index.test.ts", "src/index.ts"), false);
});

test("substring collisions never invent test coverage", () => {
  const files: RepositoryFile[] = [
    { path: "src/db.ts", imports: [], isTest: false, isSurface: false },
    { path: "tests/dbdriver-unrelated.test.ts", imports: [], isTest: true, isSurface: false },
  ];
  const change = `diff --git a/src/db.ts b/src/db.ts
--- a/src/db.ts
+++ b/src/db.ts
@@ -1 +1 @@
-export const ready = false
+export const ready = true`;
  const result = analyzeChange(change, files);

  assert.equal(result.stats.impactedTests, 0);
  assert.equal(result.verificationPlan.includes("Run tests/dbdriver-unrelated.test.ts"), false);
});
