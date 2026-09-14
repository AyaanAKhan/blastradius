import assert from "node:assert/strict";
import test from "node:test";

import {
  extractImports,
  extractRepositoryOptions,
  IGNORED_DIRECTORY_PATTERN,
  pythonSpecifier,
  toRepositoryFile,
} from "../lib/repository-mapper.ts";

test("pythonSpecifier preserves Python relative-import depth", () => {
  assert.equal(pythonSpecifier(".ledger"), "./ledger");
  assert.equal(pythonSpecifier("..core.util"), "../core/util");
  assert.equal(pythonSpecifier("...pkg"), "../../pkg");
  assert.equal(pythonSpecifier("package.module"), "package/module");
});

test("extractImports finds Python from and plain imports", () => {
  const source = `from .ledger import post
from ..core.util import normalize
import package.module as module
import json, pathlib`;
  assert.deepEqual(extractImports(source, "py"), [
    "./ledger",
    "../core/util",
    "package/module",
    "json",
    "pathlib",
  ]);
});

test("extractImports finds side-effect imports without crossing statements", () => {
  const source = `import "./polyfills";
import type { User } from "./user";
export { value } from "./value";
const lazy = import("./lazy");
const required = require("./required");
export type A = 1;
const msg = \`imported from "the legacy service"\`;`;
  assert.deepEqual(extractImports(source, "ts"), [
    "./polyfills",
    "./user",
    "./value",
    "./required",
    "./lazy",
  ]);
});

test("repository mapping ignores generated and vendored directories", () => {
  assert.equal(IGNORED_DIRECTORY_PATTERN.test("project/node_modules/pkg/index.js"), true);
  assert.equal(IGNORED_DIRECTORY_PATTERN.test("project/.next/server/app.js"), true);
  assert.equal(IGNORED_DIRECTORY_PATTERN.test("project/src/index.ts"), false);
});

test("toRepositoryFile detects tests, surfaces, and dynamic imports", () => {
  const file = toRepositoryFile(
    "project/src/app/api/users/route.ts",
    `export async function load(name) { return import(name) }`,
  );
  assert.equal(file.path, "src/app/api/users/route.ts");
  assert.equal(file.isSurface, true);
  assert.equal(file.isTest, false);
  assert.equal(file.hasDynamicImport, true);
});

test("repository options include aliases, baseUrl, and external packages", () => {
  const options = extractRepositoryOptions([
    {
      path: "project/tsconfig.json",
      source: `{
        // JSON comments are allowed
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./*"],
            "@core/*": ["src/core/*"],
          },
        },
      }`,
    },
    {
      path: "project/package.json",
      source: JSON.stringify({ dependencies: { react: "19.0.0" }, devDependencies: { typescript: "5.0.0" } }),
    },
    {
      path: "project/blastradius.config.json",
      source: JSON.stringify({ hopLimit: 5, sensitiveTerms: ["ledger"] }),
    },
  ]);

  assert.deepEqual(options.aliases, { "@/": "", "@core/": "src/core" });
  assert.equal(options.baseUrl, "");
  assert.deepEqual(options.externalPackages, ["react", "typescript"]);
  assert.equal(options.hopLimit, 5);
  assert.deepEqual(options.sensitiveTerms, ["ledger"]);
});
