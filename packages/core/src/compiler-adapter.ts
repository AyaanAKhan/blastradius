import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import type {
  AnalysisOptions,
  RepositoryFile,
  RepositoryImport,
} from "./analyzer.js";

export type CompilerMap = {
  files: RepositoryFile[];
  options: AnalysisOptions;
  diagnostics: string[];
  configPath?: string;
};

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const IGNORED_DIRECTORY = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage)(\/|$)/i;

function slash(value: string) {
  return value.replaceAll("\\", "/");
}

function relativePath(root: string, value: string) {
  return slash(path.relative(root, value)).replace(/^\.\//, "");
}

function isInside(root: string, value: string) {
  const relative = path.relative(root, value);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isTestPath(value: string) {
  return /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\./.test(value);
}

function isSurfacePath(value: string) {
  return /(^|\/)(route|routes|pages|app\/api|controllers?|workers?|handlers?)(\/|\.|$)/i.test(value);
}

function readExternalPackages(root: string) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as Record<string, unknown>;
    const packages = new Set<string>();
    for (const group of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const dependencies = packageJson[group];
      if (dependencies && typeof dependencies === "object") {
        for (const name of Object.keys(dependencies)) packages.add(name);
      }
    }
    return [...packages].sort();
  } catch {
    return [];
  }
}

function compilerOptionsFor(root: string, configPath?: string) {
  if (!configPath) {
    const options: ts.CompilerOptions = {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    };
    const files = ts.sys.readDirectory(root, SOURCE_EXTENSIONS, ["node_modules", ".git", ".next", "dist", "build", "out", "coverage"], ["**/*"]);
    return { options, fileNames: files, errors: [] as ts.Diagnostic[] };
  }

  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return { options: {}, fileNames: [], errors: [read.error] };
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath), undefined, configPath);
  return { options: parsed.options, fileNames: parsed.fileNames, errors: parsed.errors };
}

function analysisOptions(root: string, compilerOptions: ts.CompilerOptions): AnalysisOptions {
  const aliases: Record<string, string> = {};
  const baseUrlAbsolute = compilerOptions.baseUrl
    ? path.resolve(compilerOptions.baseUrl)
    : root;
  for (const [pattern, targets] of Object.entries(compilerOptions.paths ?? {})) {
    const prefix = pattern.replace(/\*.*$/, "");
    const target = targets[0]?.replace(/\*.*$/, "");
    if (prefix && target) aliases[prefix] = relativePath(root, path.resolve(baseUrlAbsolute, target));
  }
  return {
    aliases,
    baseUrl: compilerOptions.baseUrl ? relativePath(root, baseUrlAbsolute) : "",
    externalPackages: readExternalPackages(root),
  };
}

function resolveTarget(
  root: string,
  sourceFile: ts.SourceFile,
  specifier: string,
  compilerOptions: ts.CompilerOptions,
) {
  const resolved = ts.resolveModuleName(specifier, sourceFile.fileName, compilerOptions, ts.sys).resolvedModule;
  if (!resolved || resolved.isExternalLibraryImport || !isInside(root, resolved.resolvedFileName)) return undefined;
  return relativePath(root, resolved.resolvedFileName).replace(/\.d\.ts$/, ".ts");
}

function addImport(collection: RepositoryImport[], entry: RepositoryImport) {
  const key = `${entry.specifier}\0${entry.target ?? ""}\0${entry.kind}\0${entry.symbols.join(",")}\0${entry.isReExport ? "1" : "0"}`;
  if (!collection.some((candidate) =>
    `${candidate.specifier}\0${candidate.target ?? ""}\0${candidate.kind}\0${candidate.symbols.join(",")}\0${candidate.isReExport ? "1" : "0"}` === key)) {
    collection.push(entry);
  }
}

function declarationImports(
  root: string,
  sourceFile: ts.SourceFile,
  compilerOptions: ts.CompilerOptions,
) {
  const imports: RepositoryImport[] = [];
  let hasDynamicImport = false;
  const entry = (
    specifier: string,
    kind: RepositoryImport["kind"],
    symbols: string[],
    isReExport = false,
  ) => addImport(imports, {
    specifier,
    target: resolveTarget(root, sourceFile, specifier, compilerOptions),
    kind,
    symbols: symbols.length ? symbols.sort() : ["*"],
    isReExport,
  });

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (!clause) {
        entry(specifier, "value", ["*"]);
        continue;
      }
      if (clause.name) entry(specifier, clause.isTypeOnly ? "type" : "value", ["default"]);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        entry(specifier, clause.isTypeOnly ? "type" : "value", ["*"]);
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        const typeSymbols: string[] = [];
        const valueSymbols: string[] = [];
        for (const item of clause.namedBindings.elements) {
          const name = item.propertyName?.text ?? item.name.text;
          if (clause.isTypeOnly || item.isTypeOnly) typeSymbols.push(name);
          else valueSymbols.push(name);
        }
        if (typeSymbols.length) entry(specifier, "type", typeSymbols);
        if (valueSymbols.length) entry(specifier, "value", valueSymbols);
      }
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const typeSymbols: string[] = [];
      const valueSymbols: string[] = [];
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const item of statement.exportClause.elements) {
          const name = item.propertyName?.text ?? item.name.text;
          if (statement.isTypeOnly || item.isTypeOnly) typeSymbols.push(name);
          else valueSymbols.push(name);
        }
      } else {
        valueSymbols.push("*");
      }
      if (typeSymbols.length) entry(specifier, "type", typeSymbols, true);
      if (valueSymbols.length) entry(specifier, "value", valueSymbols, true);
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const required = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (dynamic || required) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) entry(argument.text, "value", ["*"]);
        else if (dynamic) hasDynamicImport = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { imports, hasDynamicImport };
}

function formatDiagnostic(diagnostic: ts.Diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${slash(diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`;
}

export function mapTypeScriptRepository(rootDirectory: string): CompilerMap {
  const root = path.resolve(rootDirectory);
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json")
    ?? ts.findConfigFile(root, ts.sys.fileExists, "jsconfig.json");
  const parsed = compilerOptionsFor(root, configPath);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const checker = program.getTypeChecker();
  const files: RepositoryFile[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const repositoryPath = relativePath(root, sourceFile.fileName);
    if (
      sourceFile.isDeclarationFile ||
      !isInside(root, sourceFile.fileName) ||
      IGNORED_DIRECTORY.test(repositoryPath)
    ) continue;
    const extracted = declarationImports(root, sourceFile, parsed.options);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    const exportedSymbols = moduleSymbol
      ? checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.getName()).sort()
      : [];
    files.push({
      path: repositoryPath,
      imports: [...new Set(extracted.imports.map((item) => item.specifier))],
      importMetadata: extracted.imports,
      exportedSymbols,
      isTest: isTestPath(repositoryPath),
      isSurface: isSurfacePath(repositoryPath),
      hasDynamicImport: extracted.hasDynamicImport,
    });
  }

  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
    .slice(0, 50)
    .map(formatDiagnostic);
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    options: analysisOptions(root, parsed.options),
    diagnostics,
    configPath: configPath ? relativePath(root, configPath) : undefined,
  };
}
