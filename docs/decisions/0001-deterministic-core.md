# ADR 0001: Keep the evidence engine deterministic

Status: Accepted

## Context

Pull-request impact analysis needs repeatable graph edges, visible ranking reasons, and predictable failure behavior. A language model can make a result easier to read, but using generated output as the source of graph or priority decisions would make the system difficult to test and audit.

## Decision

Diff parsing, import resolution, reverse traversal, surface matching, test matching, ranking, confidence, and verification-plan generation remain deterministic TypeScript functions executed in a browser Web Worker.

A local model adapter is optional. It receives only a bounded summary of computed evidence after an explicit user action and may replace only the short narrative brief. The response records whether the brief came from the evidence engine or local model.

The web application is local-first. Repository mapping and analysis stay in the browser. The server has one narrow job: proxying the optional evidence summary to a locally configured model. This boundary can be verified from the browser network log.

## Consequences

Benefits:

- Results are reproducible.
- Unit fixtures can cover the decision path.
- The product remains useful with no model installed.
- Users can distinguish evidence from narration.

Costs:

- Regex-based extraction misses language semantics.
- Ranking rules require explicit policy maintenance.
- More capable parsing needs compiler or syntax-tree adapters.

These costs are acceptable for the MVP because they are visible, bounded, and replaceable without changing the product contract.
