# Scoring model

BlastRadius produces a review-attention score from 5 to 96. The score is a triage policy, not a probability that a change contains a defect.

## Factors

| Factor | Maximum effect | Evidence |
| --- | ---: | --- |
| Change size | +18 | Log-scaled changed-line count |
| Dependency fan-out | +24 | Downstream files reached within three hops |
| Sensitive paths | +24 | Changed paths matching configured review-sensitive terms |
| Coverage gaps | +26 | Missing related tests and unpaired sensitive dependents |
| Verification added | -16 | Test files changed with the implementation |
| Configuration reach | +20 | Configuration, lockfile, schema, or migration paths |

Sensitive-path and configuration-path terms are disjoint. Schema and migration changes contribute only to configuration reach, so one path cannot collect both signals from the same filename.

The base score is 14. Contributions are summed and clamped to the published range.

## Levels

| Score | Level |
| ---: | --- |
| 5 to 34 | Low |
| 35 to 59 | Moderate |
| 60 to 79 | High |
| 80 to 96 | Critical |

These labels prioritize review effort. They are not severity labels and should not block a change without human judgment.

## Confidence

Confidence begins at 0.36 and changes with evidence quality:

- repository metadata supplied: +0.20
- changed paths mapped into the repository: up to +0.24
- at least one resolved import edge: +0.12
- unresolved relative imports: up to -0.16
- dynamic imports: up to -0.10

The final value is clamped between 0.20 and 0.94. Confidence never reaches 1.00 because static analysis cannot observe all runtime behavior.

## Changing the policy

Any weight change should include:

1. a fixture demonstrating the intended ordering
2. an explanation of the product assumption
3. an update to this document
4. evaluation against labeled changes before claiming improved accuracy
