import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeChange } from "../packages/core/src/analyzer.ts";
import { mapTypeScriptRepository } from "../packages/core/src/compiler-adapter.ts";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blastradius-compiler-"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      baseUrl: ".",
      paths: { "@/*": ["src/*"] },
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
    },
    include: ["src/**/*.ts"],
  }));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "core.ts"), `
export const allow = false;
export const untouched = true;
export type Policy = { allow: boolean };
`);
  fs.writeFileSync(path.join(root, "src", "barrel.ts"), `export { allow } from "./core";`);
  fs.writeFileSync(path.join(root, "src", "allowed.ts"), `import { allow } from "@/core"; export const result = allow;`);
  fs.writeFileSync(path.join(root, "src", "unrelated.ts"), `import { untouched } from "@/core"; export const result = untouched;`);
  fs.writeFileSync(path.join(root, "src", "types.ts"), `import type { Policy } from "@/core"; export type Copy = Policy;`);
  fs.writeFileSync(path.join(root, "src", "consumer.ts"), `import { allow } from "./barrel"; export const result = allow;`);
  return root;
}

test("compiler adapter resolves aliases, barrels, symbols, and type-only imports", (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mapping = mapTypeScriptRepository(root);
  const allowed = mapping.files.find((file) => file.path === "src/allowed.ts");
  const barrel = mapping.files.find((file) => file.path === "src/barrel.ts");
  const types = mapping.files.find((file) => file.path === "src/types.ts");

  assert.equal(mapping.configPath, "tsconfig.json");
  assert.deepEqual(mapping.options.aliases, { "@/": "src" });
  assert.ok(allowed?.importMetadata?.some((entry) =>
    entry.target === "src/core.ts" && entry.kind === "value" && entry.symbols.includes("allow"),
  ));
  assert.ok(barrel?.importMetadata?.some((entry) => entry.isReExport && entry.symbols.includes("allow")));
  assert.ok(types?.importMetadata?.some((entry) => entry.kind === "type" && entry.symbols.includes("Policy")));
});

test("symbol evidence filters consumers that import an unchanged export", (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mapping = mapTypeScriptRepository(root);
  const diff = `diff --git a/src/core.ts b/src/core.ts
--- a/src/core.ts
+++ b/src/core.ts
@@ -1 +1 @@ export const allow = false;
-export const allow = false;
+export const allow = true;`;
  const result = analyzeChange(diff, mapping.files, mapping.options);

  assert.ok(result.nodes.some((node) => node.path === "src/allowed.ts"));
  assert.ok(result.nodes.some((node) => node.path === "src/barrel.ts"));
  assert.ok(result.nodes.some((node) => node.path === "src/consumer.ts"));
  assert.equal(result.nodes.some((node) => node.path === "src/unrelated.ts"), false);
  assert.equal(result.nodes.some((node) => node.path === "src/types.ts"), false);
  assert.equal(result.stats.symbolFilteredImports, 2);
  assert.equal(result.stats.typeOnlyImports, 1);
});
