# Evaluation

BlastRadius is evaluated as a changed-file review-ranking system. A positive label is a changed file that received at least one inline human review comment. Comments from bots and the pull request author are excluded.

## Held-out results

| Repository | n | Method | Precision@1 | Recall@3 | MRR |
| --- | ---: | --- | ---: | ---: | ---: |
| vitejs/vite | 12 | random | 46.4% | 61.7% | 0.647 |
| vitejs/vite | 12 | churn | 66.7% | 77.8% | 0.800 |
| vitejs/vite | 12 | dependents | 75.0% | 61.1% | 0.807 |
| vitejs/vite | 12 | blastradius | 75.0% | 58.3% | 0.791 |
| pallets/flask | 2 | random | 28.8% | 61.5% | 0.497 |
| pallets/flask | 2 | churn | 100.0% | 100.0% | 1.000 |
| pallets/flask | 2 | dependents | 100.0% | 100.0% | 1.000 |
| pallets/flask | 2 | blastradius | 100.0% | 100.0% | 1.000 |
| expressjs/express | 12 | random | 81.9% | 100.0% | 0.905 |
| expressjs/express | 12 | churn | 83.3% | 100.0% | 0.903 |
| expressjs/express | 12 | dependents | 91.7% | 100.0% | 0.958 |
| expressjs/express | 12 | blastradius | 91.7% | 100.0% | 0.958 |

On Vite, BlastRadius ties the dependents baseline for Precision@1 but loses to churn on Recall@3 and loses narrowly to both churn and dependents on MRR. On Express, it ties dependents and leads churn on Precision@1. Flask has only two held-out labeled pull requests, so its 100 percent values are not a stable estimate.

## Dataset

- vitejs/vite: 300 merged pull requests fetched, 56 had eligible review comments, 12 held out, 70.4% of changed paths were supported source files present at the pull request head commit.
- pallets/flask: 300 merged pull requests fetched, 8 had eligible review comments, 2 held out, 69.2% of changed paths were supported source files present at the pull request head commit.
- expressjs/express: 300 merged pull requests fetched, 57 had eligible review comments, 12 held out, 35.3% of changed paths were supported source files present at the pull request head commit.

The oldest 80 percent of labeled pull requests form the development split. The newest 20 percent are held out. Random is reported as its exact expected value. Churn orders files by changed lines. Dependents orders files by three-hop reverse-import reach at each pull request head commit, then churn. BlastRadius uses the published `rank-v1` policy.

## Limits

Inline comments are an observable proxy for reviewer attention, not ground truth for defects. Reviews without inline comments are excluded. Deleted files and unsupported non-source files do not appear in the repository graph. The Flask held-out split is only two pull requests and its percentages are not stable estimates. The manifest pins every pull request and head SHA, and the local cache can be rebuilt with `npm run evaluate`.
