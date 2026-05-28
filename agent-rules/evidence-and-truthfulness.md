# Evidence And Truthfulness

User-visible success must be backed by evidence. Presentation layers must not create success that the runtime did not prove.

## Success Evidence

- Model/provider output is a claim, not fact.
- `provider-called` is not proposal success.
- `exact-ready` is not write authority.
- Write authority is not verification success.
- Apply without verification is not verified success.
- Repair proposal is not repair success.
- Repair apply without re-verification is not repair success.
- Skipped, not-run, blocked, partial, and not-proven states must not become success.

## Write Evidence

- Do not infer write authorization from prompt text.
- Keep dry-run, preview, permission-pending, denied, blocked, approved-for-write, and write-success states distinct.
- Do not treat dry-run, preview, or permission-pending as write success.
- Do not skip final stale-read before writer.
- Do not hide unverified write outcomes behind success-like terminal states.
- Writer-started unknown or unverified outcomes must remain visible as unknown or unverified until stronger evidence exists.

## Verification Evidence

- Evidence and verdict layers determine success.
- Verification must prove the relevant behavior, not just run a loosely related command.
- If verification is skipped, blocked, incomplete, or not run, report that state directly.
- Do not claim validation or verification passed unless the command actually ran and passed.

## Presentation

- CLI, session, result, and report presentation must preserve truthfulness.
- Terminal/session surfaces may summarize, but they must not upgrade a stopped, blocked, partial, failed, or unverified state into success.
- Compact output should stay answer-first and actionable while preserving status, changed files, verification state, and next-step truth.
- Preserve redaction and report-safe projections.
