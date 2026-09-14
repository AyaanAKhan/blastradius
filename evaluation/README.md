# Evaluation

BlastRadius is evaluated as a changed-file review-ranking system. A positive label is a changed file that received at least one inline human review comment. Comments from bots and the pull request author are excluded.

## Pooled held-out results

Values are means with deterministic 95 percent bootstrap intervals from 10,000 resamples.

| Method | Precision@1 | Recall@3 | MRR |
| --- | ---: | ---: | ---: |
| Random expected value | 61.5% [48.8, 74.4] | 79.3% [67.0, 90.9] | 0.755 [0.657, 0.845] |
| Churn | 76.9% [61.5, 92.3] | 89.7% [78.8, 98.1] | 0.863 [0.755, 0.955] |
| Dependents | 84.6% [69.2, 96.2] | 82.0% [68.6, 93.6] | 0.892 [0.779, 0.981] |
| Published rank-v1 | 84.6% [69.2, 96.2] | 80.8% [66.7, 93.0] | 0.884 [0.768, 0.981] |
| BlastRadius rank-v2 | 73.1% [53.8, 88.5] | 82.0% [68.6, 93.6] | 0.832 [0.714, 0.936] |

The primary comparison is honest and limited: rank-v2 trails the dependents baseline on held-out MRR in this sample. The paired mean MRR difference is -0.059 with a 95 percent interval of [-0.135, -0.002]. The median paired difference is 0.000 [0.000, 0.000], and the Wilcoxon signed-rank p-value is 0.0679. This evidence does not establish defect prediction.

### Normalized lift over random

Lift is `(rank-v2 - random) / (1 - random)`. Positive values use some of the available headroom above random.

| Metric | Lift | 95 percent interval |
| --- | ---: | ---: |
| precisionAt1 | 30.1% | -13.5% to 69.5% |
| recallAt3 | 13.1% | -33.5% to 53.5% |
| meanReciprocalRank | 31.7% | -11.2% to 69.8% |

### Repository breakdown

Groups below n=10 are omitted from this table. Intervals remain available in `results.json`.

| Repository | n | Method | Precision@1 | Recall@3 | MRR |
| --- | ---: | --- | ---: | ---: | ---: |
| expressjs/express | 12 | Dependents | 91.7% | 100.0% | 0.958 |
| expressjs/express | 12 | BlastRadius rank-v2 | 91.7% | 100.0% | 0.958 |
| vitejs/vite | 12 | Dependents | 75.0% | 61.1% | 0.807 |
| vitejs/vite | 12 | BlastRadius rank-v2 | 50.0% | 61.1% | 0.678 |

## Hard subset

The hard subset has at least four mapped candidate source files and one or two labeled source files. It contains 6 held-out pull requests.

| Method | Precision@1 | Recall@3 | MRR |
| --- | ---: | ---: | ---: |
| Random expected value | 20.7% [11.1, 33.4] | 43.1% [24.5, 61.7] | 0.419 [0.298, 0.563] |
| Churn | 83.3% [50.0, 100.0] | 83.3% [50.0, 100.0] | 0.852 [0.556, 1.000] |
| Dependents | 50.0% [16.7, 83.3] | 58.3% [25.0, 91.7] | 0.614 [0.314, 0.889] |
| BlastRadius rank-v2 | 33.3% [0.0, 66.7] | 58.3% [25.0, 91.7] | 0.523 [0.245, 0.806] |

## Design evidence

The development-only ablation compares the originally published truncated rank-v1 output, the corrected full rank-v1 list, bucket removal, buckets alone, churn alone, and rank-v2. The held-out split was not used to choose rank-v2. See `results.json` for every interval and `examples.json` for the committed per-example measurements.

| Development policy | Precision@1 | Recall@3 | MRR |
| --- | ---: | ---: | ---: |
| Published rank-v1 | 66.3% [56.8, 75.8] | 87.1% [80.9, 92.6] | 0.794 [0.733, 0.854] |
| Full-list rank-v1 | 67.4% [57.9, 76.8] | 87.5% [81.1, 93.3] | 0.800 [0.739, 0.859] |
| No buckets | 70.5% [61.1, 80.0] | 92.9% [88.3, 96.9] | 0.832 [0.777, 0.885] |
| Buckets only | 61.1% [51.6, 70.5] | 84.0% [76.9, 90.4] | 0.761 [0.698, 0.822] |
| Churn-only policy | 65.3% [55.8, 74.7] | 90.3% [84.7, 95.3] | 0.796 [0.736, 0.854] |
| BlastRadius rank-v2 | 71.6% [62.1, 80.0] | 92.9% [88.3, 96.9] | 0.837 [0.782, 0.888] |

rank-v2 was selected on these 95 development examples, where it has the strongest P@1 and MRR among the listed policies. The published rank-v1 versus full-list rank-v1 rows expose the effect of fixing the ten-item truncation. The held-out split has now been evaluated for two published policy versions, rank-v1 and rank-v2. Further policy tuning requires a new validation split.

## Dataset

- 121 labeled pull requests, with 26 held out.
- Candidate count distribution: min 1, p25 1, median 2, p75 5, max 40.
- Mapping coverage across changed paths: 61.4 percent.
- The default sensitive-path signal fired on 1.2 percent of development files. Its file-level label precision was 40.0 percent versus an overall label rate of 29.9 percent.
- Repository-specific metrics are excluded from headline interpretation below n=10. Sparse held-out groups: pallets/flask (n=2).

| Repository | Min | P25 | Median | P75 | Max changed files |
| --- | ---: | ---: | ---: | ---: | ---: |
| expressjs/express | 1 | 1 | 2 | 3 | 22 |
| pallets/flask | 2 | 3 | 4 | 13 | 23 |
| vitejs/vite | 1 | 2 | 3.5 | 7.5 | 40 |

The oldest 80 percent within each repository form the development split. The newest 20 percent are held out. Random is its exact expected value. Churn orders changed files by line count. Dependents orders by reverse-import reach and then churn. rank-v2 orders changed files by reverse-import reach, churn, and path, with lockfiles last. Unchanged dependents are reported separately as a watchlist.

## Reproduce without network access

Run `npm run evaluation:report`. It reads only the committed `evaluation/examples.json` file and regenerates `results.json` plus this report. Rebuilding repository snapshots requires network access through `npm run evaluate`.

## Limits

Inline comments are an observable proxy for reviewer attention, not ground truth for defects. Reviews without inline comments are excluded. Deleted files and unsupported non-source files do not appear in the repository graph. Small repository slices are not treated as stable estimates. Confidence intervals quantify sampling uncertainty in this dataset, not all sources of bias.
