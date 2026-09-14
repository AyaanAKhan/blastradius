import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractPythonImports,
  mapPythonRepository,
} from "../packages/core/src/python-adapter.ts";

test("Python import extraction preserves relative depth", () => {
  assert.deepEqual(extractPythonImports(`from .ledger import post
from ..core.util import normalize
import package.module as module
import json, pathlib`), ["./ledger", "../core/util", "package/module", "json", "pathlib"]);
});

test("Python repository mapping identifies tests and surfaces", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blastradius-python-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "routes"));
  fs.mkdirSync(path.join(root, "tests"));
  fs.writeFileSync(path.join(root, "routes", "users.py"), "from ..core import users\n");
  fs.writeFileSync(path.join(root, "tests", "test_users.py"), "from routes.users import get\n");

  const mapping = mapPythonRepository(root);
  assert.equal(mapping.files.find((file) => file.path === "routes/users.py")?.isSurface, true);
  assert.equal(mapping.files.find((file) => file.path === "tests/test_users.py")?.isTest, true);
});
