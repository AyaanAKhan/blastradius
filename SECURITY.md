# Security policy

## Reporting a vulnerability

Please use the repository's private security advisory flow instead of opening a public issue. Include the affected route or module, reproduction steps, impact, and any suggested mitigation.

## Scope

BlastRadius accepts untrusted diff text and repository metadata. Reports involving input validation, denial of service, unintended source transmission, prompt injection into the optional local summary, or unsafe rendering are in scope.

The current version does not provide authentication, persistence, or multi-user data storage. The selected repository is read in the browser, and source contents are not included in the analysis request.

## Supported versions

Security fixes are applied to the latest release on the `main` branch.
