# @blastradius/cli

The BlastRadius command-line interface maps a local repository and produces an explainable changed-file review order plus a separate downstream watchlist.

```sh
npx @blastradius/cli --base main --head HEAD
```

Markdown, JSON, and SARIF output are supported. Add `blastradius.config.json` at the repository root to configure hop limits, ignored paths, review-sensitive terms, failure behavior, and the ranking policy.
