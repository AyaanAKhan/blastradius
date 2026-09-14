# Contributing

Thank you for helping improve BlastRadius. Changes should preserve the central contract: analysis must remain explainable, uncertainty must remain visible, and optional model output must never alter deterministic evidence.

## Local workflow

1. Fork and clone the repository.
2. Use Node.js 22.13 or newer.
3. Run `npm ci`.
4. Create a focused branch.
5. Add or update fixtures for analysis behavior.
6. Run `npm run check` before opening a pull request.

## Pull requests

Keep changes small enough to review. Explain the behavior change, tests, tradeoffs, and any new limitations. Include screenshots for visible interface changes. Avoid claims that a ranking predicts defects unless the claim is supported by a documented evaluation dataset.

## Analyzer changes

- Keep parsing and scoring functions deterministic.
- Add fixtures for new syntax or graph behavior.
- Bound new traversal and input work.
- Surface unresolved evidence instead of silently discarding it.
- Document ranking-policy changes in `docs/ranking-model.md`.

## Commit style

Use concise imperative subjects such as `Add alias-resolution fixture` or `Explain confidence penalty`.
