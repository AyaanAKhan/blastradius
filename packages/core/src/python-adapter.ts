import fs from "node:fs";
import path from "node:path";

import type { CompilerMap } from "./compiler-adapter.js";

const IGNORED_DIRECTORY = /(^|\/)(\.git|node_modules|\.venv|venv|__pycache__|dist|build|out|coverage)(\/|$)/i;

function slash(value: string) {
  return value.replaceAll("\\", "/");
}

export function pythonSpecifier(raw: string) {
  const match = raw.match(/^(\.*)(.*)$/);
  const dots = match?.[1].length ?? 0;
  const modulePath = (match?.[2] ?? raw).replaceAll(".", "/");
  if (!dots) return modulePath;
  if (dots === 1) return `./${modulePath}`;
  return `${"../".repeat(dots - 1)}${modulePath}`;
}

export function extractPythonImports(source: string) {
  const imports = new Set<string>();
  for (const match of source.matchAll(/^\s*from\s+([.\w]+)\s+import\s+/gm)) {
    imports.add(pythonSpecifier(match[1]));
  }
  for (const match of source.matchAll(/^\s*import\s+([^\n#]+)/gm)) {
    for (const item of match[1].split(",")) {
      const moduleName = item.trim().split(/\s+as\s+/, 1)[0];
      if (moduleName) imports.add(pythonSpecifier(moduleName));
    }
  }
  return [...imports].slice(0, 80);
}

export function mapPythonRepository(rootDirectory: string): CompilerMap {
  const root = path.resolve(rootDirectory);
  const files: CompilerMap["files"] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = slash(path.relative(root, absolute));
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY.test(relative)) visit(absolute);
        continue;
      }
      if (!entry.isFile() || !relative.endsWith(".py") || fs.statSync(absolute).size > 512_000) continue;
      const source = fs.readFileSync(absolute, "utf8");
      files.push({
        path: relative,
        imports: extractPythonImports(source),
        isTest: /(^|\/)(test|tests)(\/|$)|test_.*\.py$/.test(relative),
        isSurface: /(^|\/)(routes?|views?|controllers?|handlers?)(\/|\.|$)/i.test(relative),
        hasDynamicImport: /\bimport_module\s*\(/.test(source),
      });
    }
  };
  visit(root);
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    options: { aliases: {}, externalPackages: [] },
    diagnostics: [],
  };
}
