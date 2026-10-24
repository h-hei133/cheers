# Provider And Secret Boundary

Live provider models are configured and permitted for development, debugging, and end-to-end verification.

## Live Provider Usage & Isolation

1. **Real Interaction Allowed**: You may invoke configured live provider models during development, interactive smoke tests, and end-to-end verification whenever live model behavior or protocol verification is useful.
2. **Isolated Test Homes**: Automated tests and verification gates that mutate session files, caches, or profile configs must use isolated temporary directories (such as `/tmp/cheers-test/<gate-name>` or `.tmp/`) for `HOME` / `USERPROFILE` / `CHEERS_TEST_ROOT` so test runs do not pollute the user's primary runtime state or leave dirty files in the repository.
## Redaction

Do not print, record, summarize, or commit:

- provider output that contains secrets or unsafe raw content
- `oldText` or `newText` when report-safe projection is required
- keys
- headers
- tokens
- credential values
- config paths when the route requires redaction
- secrets from provider config or runtime homes

Use redacted, report-safe projections.

## Failure Classification

Classify these separately:

- provider-network failure
- provider-config failure
- provider-auth failure
- route failure
- redaction failure
- unexpected write
- unexpected success claim

A real-provider run that reaches the provider path but fails because the provider or network is unavailable is not automatically a product route failure.
