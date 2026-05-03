# Real-Provider Read-Only Coding Smoke Flag Design

## Purpose

Design an explicit opt-in contract for a future real-provider read-only coding smoke without changing runtime behavior in this checkpoint.

The future flag is:

```text
--real-readonly-coding-smoke
```

It belongs on `scripts/verify-real-user-capabilities.mjs` or a small script helper it calls. It must never be part of default CI or default local verification.

## Default behavior

Without the flag:

- Do not run a real provider model turn.
- Do not use `D:/Test/home-sf` as runtime home.
- Do not read, print, copy, modify, or clean real auth/key/provider config.
- Return skip/deferred metadata for the real read-only coding smoke if the mode is queried by dry-run/report logic.

## Opt-in behavior

With `--real-readonly-coding-smoke`:

- Print an explicit notice before any real-provider preflight:
  - external network/auth/model failures are attribution outcomes, not automatic product regressions.
  - real auth/key/provider config must not be printed, copied, modified, or cleaned.
  - only a temporary read-only fixture workspace is in scope.
- Use `D:/Test/home-sf` only as runtime home for provider loading.
- Create/use a temporary safe fixture workspace outside the real provider home.
- Run only read/inspect/summarize prompts.
- Assert no fixture mutation by comparing before/after snapshots.
- Require `changedFiles` to be empty.
- Redact output tails, report fields, and failure reasons before printing or writing reports.

## Failure attribution

The future flag must classify failures before returning an exit code:

- auth/config failure: safe config/auth attribution, no secret detail.
- provider/network unavailable: inconclusive external provider failure.
- unsupported model/provider: safe unsupported attribution.
- product regression: only for local contract failures such as mutation, missing terminal result, unredacted output, or changed files.
- environment issue: filesystem or spawn failures such as sandbox `EPERM`.

## Help text contract

Future `--help` output should mention:

- `--real-readonly-coding-smoke` is opt-in.
- default runs do not execute real provider smoke.
- the smoke is read-only and must not edit files.
- external provider failures are attribution, not automatic product regressions.
- real provider secrets/config are redacted and must not be printed.

## Out of scope for this checkpoint

- No script flag implementation.
- No real provider execution.
- No fixture implementation.
- No redaction helper implementation.
- No production CLI, session, or orchestration change.
