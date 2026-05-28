# Provider And Secret Boundary

Real provider access is opt-in and tightly bounded.

## Real Provider Home

Real provider configuration may exist at:

```text
/home/wang/.private-agents-real
```

Never manually read, print, copy, summarize, clean, or modify files under this path. This includes provider env files, config files, keys, tokens, headers, credentials, session files, and any provider-auth material.

## Opt-In Only

Real provider configuration may be consumed only through explicit opt-in gates that set:

```text
PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real
```

`PRIVATE_AGENTS_REAL_HOME` is a credential/config source, not a runtime home.

Real-provider gates must use isolated runtime and test directories such as:

```text
PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/<gate-name>
HOME=/tmp/private-agents-test/<gate-name>-home
USERPROFILE=/tmp/private-agents-test/<gate-name>-home
```

Provider defaults must remain off.

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
