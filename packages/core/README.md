# @blastradius/core

The deterministic analysis engine behind BlastRadius. It parses unified diffs, builds TypeScript, JavaScript, and Python dependency evidence, ranks changed files, and keeps unchanged downstream context in a separate watchlist.

```ts
import { analyzeChange } from "@blastradius/core";

const result = analyzeChange(diff, repositoryFiles, { rankingPolicy: "rank-v2" });
```

The package performs no network requests. See the main repository for the evidence model, evaluation, and limitations.
