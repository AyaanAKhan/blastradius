import type { AnalysisOptions, RepositoryFile } from "./analyzer.ts";
import { mergeAnalysisOptions, parseBlastRadiusConfig } from "./analyzer.ts";

export const SOURCE_FILE_PATTERN = /\.(tsx?|jsx?|mjs|cjs|py)$/i;
export const IGNORED_DIRECTORY_PATTERN =
  /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|venv|__pycache__|\.venv)(\/|$)/i;

export type RepositoryConfigSource = {
  path: string;
  source: string;
};

function normalizePath(value: string) {
  const parts: string[] = [];
  for (const part of value.replaceAll("\\", "/").replace(/^\.\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function joinPath(left: string, right: string) {
  return normalizePath(left ? `${left}/${right}` : right);
}

export function repositoryRelativePath(path: string) {
  const slashPath = path.replaceAll("\\", "/");
  return slashPath.includes("/") ? slashPath.slice(slashPath.indexOf("/") + 1) : slashPath;
}

export function pythonSpecifier(raw: string) {
  const match = raw.match(/^(\.*)(.*)$/);
  const dots = match?.[1].length ?? 0;
  const modulePath = (match?.[2] ?? raw).replaceAll(".", "/");
  if (dots === 0) return modulePath;
  if (dots === 1) return `./${modulePath}`;
  return `${"../".repeat(dots - 1)}${modulePath}`;
}

export function extractImports(source: string, extension: string) {
  const imports = new Set<string>();
  if (extension === "py") {
    for (const match of source.matchAll(/^\s*from\s+([.\w]+)\s+import\s+/gm)) {
      imports.add(pythonSpecifier(match[1]));
    }
    for (const match of source.matchAll(/^\s*import\s+([^\n#]+)/gm)) {
      for (const item of match[1].split(",")) {
        const moduleName = item.trim().split(/\s+as\s+/, 1)[0];
        if (moduleName) imports.add(pythonSpecifier(moduleName));
      }
    }
  } else {
    const patterns = [
      /\b(?:import|export)\s+(?:type\s+)?(?:[^"'\n;]*?\s+from\s+)?["']([^"']+)["']/g,
      /\brequire\(\s*["']([^"']+)["']\s*\)/g,
      /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    ];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) imports.add(match[1]);
    }
  }
  return [...imports].slice(0, 80);
}

export function toRepositoryFile(path: string, source: string): RepositoryFile {
  const normalized = repositoryRelativePath(path);
  const extension = normalized.split(".").pop()?.toLowerCase() ?? "";
  return {
    path: normalized,
    imports: extractImports(source, extension),
    isTest: /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\./.test(normalized),
    isSurface: /(^|\/)(route|routes|pages|app\/api|controllers?|workers?|handlers?)(\/|\.|$)/i.test(normalized),
    hasDynamicImport: /import\(\s*[^"'\s]/.test(source),
  };
}

function stripJsonComments(value: string) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === "/" && next === "/") {
      while (index < value.length && value[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (index < value.length - 1 && !(value[index] === "*" && value[index + 1] === "/")) {
        if (value[index] === "\n") output += "\n";
        index += 1;
      }
      index += 1;
      continue;
    }
    output += character;
  }
  return output;
}

function parseJsonConfig(source: string) {
  return JSON.parse(stripJsonComments(source).replace(/,\s*([}\]])/g, "$1")) as Record<string, unknown>;
}

export function extractRepositoryOptions(configSources: RepositoryConfigSource[]): AnalysisOptions {
  const options: AnalysisOptions = { aliases: {}, externalPackages: [] };
  const packageSource = configSources.find((file) => repositoryRelativePath(file.path) === "package.json");
  if (packageSource) {
    try {
      const packageJson = parseJsonConfig(packageSource.source);
      const dependencyGroups = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
      const packages = new Set<string>();
      for (const group of dependencyGroups) {
        const dependencies = packageJson[group];
        if (dependencies && typeof dependencies === "object") {
          for (const name of Object.keys(dependencies)) packages.add(name);
        }
      }
      options.externalPackages = [...packages].sort();
    } catch {
      options.externalPackages = [];
    }
  }

  const tsconfigSource = configSources
    .filter((file) => /(^|\/)(tsconfig|jsconfig)\.json$/i.test(repositoryRelativePath(file.path)))
    .sort((left, right) => left.path.length - right.path.length)[0];
  if (!tsconfigSource) return mergeProjectConfig(options, configSources);

  try {
    const config = parseJsonConfig(tsconfigSource.source);
    const compilerOptions = config.compilerOptions as Record<string, unknown> | undefined;
    const baseUrl = typeof compilerOptions?.baseUrl === "string" ? normalizePath(compilerOptions.baseUrl) : "";
    options.baseUrl = baseUrl;
    const paths = compilerOptions?.paths;
    if (paths && typeof paths === "object") {
      for (const [pattern, rawTargets] of Object.entries(paths)) {
        if (!Array.isArray(rawTargets) || typeof rawTargets[0] !== "string") continue;
        const prefix = pattern.replace(/\*.*$/, "");
        const target = rawTargets[0].replace(/\*.*$/, "");
        if (prefix) options.aliases![prefix] = joinPath(baseUrl, target);
      }
    }
  } catch {
    return mergeProjectConfig(options, configSources);
  }
  return mergeProjectConfig(options, configSources);
}

function mergeProjectConfig(
  options: AnalysisOptions,
  configSources: RepositoryConfigSource[],
) {
  const source = configSources.find(
    (file) => repositoryRelativePath(file.path) === "blastradius.config.json",
  );
  if (!source) return options;
  return mergeAnalysisOptions(options, parseBlastRadiusConfig(source.source));
}
