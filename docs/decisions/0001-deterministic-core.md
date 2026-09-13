# ADR 0001: Keep the evidence engine deterministic

Status: Accepted

## Context

Pull-request impact analysis needs repeatable graph edges, visible score contributions, and predictable failure behavior. A language model can make a result easier to read, but using generated output as the source of graph or risk decisions would make the system difficult to test and audit.

## Decision

Diff parsing, import resolution, reverse traversal, surface matching, test matching, scoring, confidence, and verification-plan generation remain deterministic TypeScript functions.

A local model adapter is optional. It receives only a bounded summary of computed evidence and may replace only the short narrative brief. The response records whether the brief came from the evidence engine or local model.

## Consequences

Benefits:

- Results are reproducible.
- Unit fixtures can cover the decision path.
- The product remains useful with no model installed.
- Users can distinguish evidence from narration.

Costs:

- Regex-based extraction misses language semantics.
- Score weights require explicit policy maintenance.
- More capable parsing needs compiler or syntax-tree adapters.

These costs are acceptable for the MVP because they are visible, bounded, and replaceable without changing the product contract.
