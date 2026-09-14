# ADR 0001: Keep the evidence engine deterministic

Status: Accepted

## Context

Pull-request impact analysis needs repeatable graph edges, visible ranking reasons, and predictable failure behavior. A language model can make a result easier to read, but using generated output as the source of graph or priority decisions would make the system difficult to test and audit.

## Decision

Diff parsing, import resolution, reverse traversal, surface matching, test matching, ranking, confidence, and verification-plan generation remain deterministic TypeScript functions executed in a browser Web Worker.

A local model adapter is optional. It receives only a bounded summary of computed evidence after an explicit user action and may replace only the short narrative brief. The result records whether the brief came from the evidence engine or local model.

The web application is local-first. Repository mapping and analysis stay in a browser Web Worker, and the hosted build has no analysis API. Optional narration calls a loopback model directly and is available only when the app runs locally. This boundary can be verified from the browser network log.

## Consequences

Benefits:

- Results are reproducible.
- Unit fixtures can cover the decision path.
- The product remains useful with no model installed.
- Users can distinguish evidence from narration.

Costs:

- Lightweight browser extraction misses some language semantics.
- Ranking rules require explicit policy maintenance.
- Compiler-backed mapping costs more CPU and is therefore reserved for the CLI and automation path.

These costs are acceptable because they are visible, bounded, measured, and replaceable without changing the core result contract.
