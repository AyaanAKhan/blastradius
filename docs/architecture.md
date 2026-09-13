# Architecture

BlastRadius separates evidence collection, deterministic analysis, and optional narration so each part can fail without corrupting the others.

## Components

### Browser repository mapper

The browser reads a user-selected directory and extracts metadata from supported TypeScript, JavaScript, and Python files. It records paths, static import specifiers, test markers, surface markers, and dynamic-import flags. Source contents are not included in the API request.

Limits:

- 600 supported files
- 256 KB per file during browser extraction
- 80 import specifiers per file
- 400 characters per path

### Analysis API

`POST /api/analyze` validates request shape and size before calling the pure analysis module. Diff input is capped at 500,000 characters. Responses are marked `no-store`.

If `OLLAMA_URL` is configured, the route may request a short local summary. The request contains summarized evidence, not repository source. A timeout or model error returns the deterministic result.

### Analysis engine

The engine performs six steps:

1. Parse changed paths and line counts from the unified diff.
2. Normalize repository paths.
3. Resolve relative static imports against known paths.
4. Build a reverse dependency graph.
5. Traverse downstream dependents for at most three hops.
6. Match exposed surfaces and likely tests, then calculate score and confidence.

The engine is a pure module with no network or filesystem access. This makes the scoring contract reproducible and easy to test.

## Trust boundaries

```mermaid
flowchart TB
  U[Untrusted diff and local files]
  B[Bounded browser extraction]
  V[API validation]
  E[Pure evidence engine]
  R[Rendered result]
  M[Optional local model]

  U --> B
  B --> V
  V --> E
  E --> R
  E --> M
  M --> R
```

- Diff text and extracted metadata are untrusted.
- Request validation limits input size and structure.
- React renders strings without interpreting them as markup.
- The local model receives a constrained evidence summary.
- Model output changes only the brief and is labeled by `narrativeSource`.

## Failure behavior

| Failure | Behavior |
| --- | --- |
| Invalid JSON | HTTP 400 with a stable error message |
| Oversized diff | HTTP 400 before analysis |
| Invalid repository map | HTTP 400 before traversal |
| Missing repository map | Diff-only result with lower confidence |
| Unresolved import | Reported as an unknown and confidence penalty |
| Local model unavailable | Deterministic brief remains active |

## Scaling path

The current engine is intentionally in-memory and bounded. A production version could move repository mapping into a CI job, store versioned graph artifacts, use compiler-backed parsers, and join coverage or ownership evidence by commit SHA. The API contract can remain stable while those adapters evolve.
