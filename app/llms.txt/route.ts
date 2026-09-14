import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const body = `# BlastRadius

> Evidence-backed pull-request impact analysis for software engineers.

BlastRadius parses a unified diff, resolves relative and configured alias imports through a locally extracted repository map, identifies exposed surfaces and related tests, and produces a transparent ordinal review queue. It does not claim to detect defects.

## Primary pages

- [Home](${absoluteUrl("/")}): Product purpose and differentiation.
- [Analyzer](${absoluteUrl("/analyze")}): Working interactive MVP with a built-in sample.
- [Method](${absoluteUrl("/method")}): Algorithm, ranking policy, architecture, and limitations.
- [Sources](${absoluteUrl("/sources")}): Primary documentation behind product comparisons.

## Important limits

- Static dependency traversal is limited to three hops.
- TypeScript, JavaScript, and Python use lightweight import extraction.
- The rank orders review attention; it is not defect probability.
- Optional local narration calls a loopback Ollama endpoint only when the app runs locally.
- Deterministic analysis is always available and the hosted demo makes no API request.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
