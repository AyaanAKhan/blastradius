# Ranking model

BlastRadius version `rank-v2` produces an ordinal changed-file review queue and a separate unchanged-file impact watchlist. It does not publish a defect probability, severity band, or calibrated risk score.

## Ordering policy

Only files present in the parsed diff enter the review queue. They are ordered by this exact comparator:

| Order | Comparator | Direction |
| ---: | --- | --- |
| 1 | Lockfile status | Source, test, and configuration files before lockfiles |
| 2 | Reverse-import reach | More reached downstream files first |
| 3 | Churn | More added and deleted lines first |
| 4 | Path | Lexical order for a deterministic final tie-break |

Sensitive-path and configuration signals remain visible evidence, but they are not ranking buckets in `rank-v2`. This change follows the development-only ablation. The original bucketed `rank-v1` policy underperformed the simpler dependents baseline in the first evaluation.

Unchanged dependents, exposed surfaces, and related tests appear in `impactWatchlist`, not `reviewOrder`. This keeps the measured changed-file ranking aligned with what the interface and CLI show. The response includes `policyVersion` so different policies are never compared silently.

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

Confidence measures evidence completeness for the current change. It uses supported changed paths, mapped changed paths, imports resolved from changed files, incident dependency edges, downstream reach, repository availability, and dynamic-import penalties. A nontrivial repository map with zero resolved edges is capped at 0.35. A mapped change with no downstream reach is capped at 0.55. An unparseable diff is fixed at 0.10.

The current confidence formula is a product policy, not an empirical probability. Evaluation should test the ranking against human review comments before any calibrated claim is introduced.
