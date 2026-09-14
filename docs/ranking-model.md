# Ranking model

BlastRadius version `rank-v1` produces an ordinal review queue. It does not publish a defect probability, severity band, or calibrated risk score.

## Ordering policy

Files are ordered by the strongest visible reason for human attention:

| Order | Target | Evidence |
| ---: | --- | --- |
| 1 | Uncovered sensitive dependent | A downstream sensitive path has no matching test evidence |
| 2 | Sensitive changed file | A changed path matches an auth, billing, security, or permission term |
| 3 | Configuration changed file | A changed path is a schema, migration, lockfile, environment, or config file |
| 4 | Other changed file | The file appears directly in the parsed diff |
| 5 | Exposed surface | A route, page, worker, controller, or handler is reached by the graph |
| 6 | Other dependent | A downstream file is reached within three import hops |
| 7 | Changed test | Verification code changed with the implementation |

Ties are resolved by graph depth and then lexical path order. The response includes `policyVersion` so output from different ranking policies is never compared silently.

## Evidence factors

The interface reports context separately from ordering:

- change size
- dependency fan-out
- sensitive paths
- related tests
- sensitive dependents without tests
- verification added
- configuration reach

Each factor is labeled as attention, mitigation, or context. There are no numeric contributions. Sensitive-path terms and configuration-path terms are disjoint.

## Confidence

Confidence measures evidence completeness. It rises when changed paths map into the repository and imports resolve. It falls when aliases, relative imports, or dynamic imports cannot be followed. A repository map with more than five files and zero resolved edges is capped at 0.35. An unparseable diff is fixed at 0.20.

The current confidence formula is a product policy, not an empirical probability. Evaluation should test the ranking against human review comments before any calibrated claim is introduced.
