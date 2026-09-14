# Mapping benchmarks

The CLI caches its compact repository map in the target repository's Git directory. The cache key hashes every supported source file plus root package and compiler configuration files, together with the mapper version. A changed input invalidates the cache.

## Vite snapshot

Measured on Vite commit `99bd9d1d46153fa939f4a304cc0177db42e28776` with one added TypeScript probe so the CLI had a real revision range to analyze.

| Measurement | Result |
| --- | ---: |
| Supported source files scanned | 1,572 |
| Imports observed | 3,788 |
| Cold median, three runs | 19.606 seconds |
| Warm median, five runs | 0.933 seconds |
| Compact cache size | 813 KiB |

Environment: Node.js 24.16.0, Windows, AMD Ryzen 5 5600X, 16 GB memory. Each run launched a fresh Node.js process. A cold run removed only the generated mapping cache first. A warm run still walked and hashed relevant files before loading the cached graph, so the timing includes cache validation and analysis.

These are engineering measurements, not a cross-machine performance claim. The exact result depends on storage, CPU, repository state, compiler configuration, and operating system. The commands used the same compiled CLI distributed by the workspace.
