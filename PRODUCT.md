# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web application with a server-side analysis endpoint and an optional local Ollama adapter.

## Users

Software engineers reviewing pull requests in TypeScript, JavaScript, or Python repositories. The primary user is a reviewer who understands a diff but needs to decide where limited review and testing time should go. A secondary audience is engineering hiring teams evaluating this project as evidence of full-stack and systems ability.

## Product Purpose

BlastRadius turns a code diff and a locally extracted repository structure into a prioritized review plan. It maps changed files to downstream modules, user-facing surfaces, and related tests; scores review attention from visible evidence; and names what the analysis cannot know.

Success means a reviewer can identify the highest-value file and verification step in under one minute without mistaking the output for proof that a bug exists.

## Positioning

BlastRadius is a review-planning tool, not another general AI code reviewer. Existing products review lines, draw code maps, select tests, or expose runtime impact. BlastRadius combines structural reach, test evidence, transparent scoring, and uncertainty into one decision surface.

## Operating Context

Users paste a unified diff and may select a local repository folder. The browser extracts paths and import relationships; raw repository source is not sent to the scoring model. The application can run as a private hosted demo or locally with an optional Ollama model.

## Capabilities and Constraints

- MVP language support is TypeScript, JavaScript, and Python.
- Static imports are followed for at most three dependency hops.
- Folder analysis accepts at most 600 supported files and 256 KB per file.
- The score measures review attention, not defect probability.
- Runtime traces, code ownership, historical failures, and monorepo package aliases are explicitly outside the MVP.
- Local-model narration is optional; the evidence engine remains the reliable fallback.
- No paid API or service is required.

## Brand Commitments

Precise, skeptical, and useful. The interface should feel like an engineering review desk: paper, redlines, measured rules, compact evidence, and no artificial futurism. Copy states facts directly, avoids hype, and distinguishes evidence from inference.

## Evidence on Hand

- The application includes a working commerce-service fixture with an intentionally unpaired refund path.
- The analyzer exposes every score contribution and unresolved dependency.
- Unit fixtures cover diff parsing, downstream traversal, and risk reduction when a test changes.
- Product comparison is grounded in the official documentation for GitHub review, CodeSee, Codecov Impact Analysis, Launchable test selection, Semgrep, and OpenTelemetry.
- No production accuracy study or user research has been completed; the interface must not imply otherwise.

## Product Principles

1. Evidence before explanation.
2. Uncertainty is a result, not an error to hide.
3. Human review order matters more than a dramatic risk number.
4. Local-first structure extraction is the default.
5. Every output should be reproducible from visible inputs.

## Accessibility & Inclusion

- Keyboard-accessible controls and visible focus indicators.
- Text and status never rely on color alone.
- Responsive layouts avoid horizontal page overflow.
- Main interface text remains at least 14 px; explanatory body copy is 16 px.
- Motion is limited and respects reduced-motion preferences.
