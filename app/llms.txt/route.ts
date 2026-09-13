import { absoluteUrl } from "@/lib/site";

export function GET() {
  const body = `# BlastRadius

> Evidence-backed pull-request impact analysis for software engineers.

BlastRadius parses a unified diff, follows relative imports through a locally extracted repository map, identifies exposed surfaces and related tests, and produces a transparent review-attention score. It does not claim to detect defects.

## Primary pages

- [Home](${absoluteUrl("/")}): Product purpose and differentiation.
- [Analyzer](${absoluteUrl("/analyze")}): Working interactive MVP with a built-in sample.
- [Method](${absoluteUrl("/method")}): Algorithm, score factors, architecture, and limitations.
- [Sources](${absoluteUrl("/sources")}): Primary documentation behind product comparisons.

## API

- POST ${absoluteUrl("/api/analyze")}
- JSON body: { "diff": string, "files": RepositoryFile[] }
- RepositoryFile fields: path, imports, isTest, isSurface, optional hasDynamicImport.

## Important limits

- Static relative-import traversal is limited to three hops.
- TypeScript, JavaScript, and Python use lightweight import extraction.
- The score ranks review attention; it is not defect probability.
- A local Ollama endpoint may provide narration, but deterministic analysis is always available.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
