# Configuration

BlastRadius looks for `blastradius.config.json` at the analyzed repository root. The browser also reads it when the file is included in a selected folder.

```json
{
  "rankingPolicy": "rank-v2",
  "hopLimit": 3,
  "sensitiveTerms": ["auth", "billing", "checkout", "payment"],
  "ignore": ["fixtures/**", "generated/**"],
  "format": "markdown",
  "failOn": "never"
}
```

## Fields

| Field | Accepted values | Default |
| --- | --- | --- |
| `rankingPolicy` | `rank-v2`, `rank-v1`, `no-buckets`, `buckets-only`, `churn-only` | `rank-v2` |
| `hopLimit` | Integer from 1 through 10 | `3` |
| `sensitiveTerms` | Non-empty path words | `auth`, `billing`, `checkout`, `payment`, `permission`, `role`, `security`, `session`, `token`, `webhook` |
| `ignore` | Glob-style repository paths | Empty list |
| `format` | `markdown`, `json`, `sarif` | `markdown` |
| `failOn` | `never`, `unknowns`, `watchlist` | `never` |

Sensitive terms match complete words within path segments. For example, `auth/session.ts` matches while `authors.ts` and `tokenizer.ts` do not. Supplying `sensitiveTerms` replaces the default list so repository policy stays explicit.

Command-line `--format` and `--fail-on` values override the file. A failure threshold writes the report first and then exits with status 2 when the selected condition is present. Invalid or unknown configuration fields fail fast with a readable error.
