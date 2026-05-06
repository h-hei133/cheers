# Single-file apply_patch guarded production write enablement

Status: guarded production-write candidate smoke passed with an isolated workspace; default production write remains disabled.

## Scope

This phase defines and validates a guarded production-write candidate lane for a
single-file `apply_patch` Update File operation. The lane is explicit opt-in
only and may write only an isolated temporary workspace target during the real
provider smoke.

It does not enable default production `apply_patch`, unified diff, multi-file,
add, delete, move, AST, fuzzy patching, rollback, release/default gates, or
unreviewed CLI/session/runtime wiring.

## Implemented Boundaries

- `guardedWriteGate.ts` defines the production-write candidate gate.
- `productionWriteLane.ts` performs parse/verify, then final stale-read
  immediately before the guarded writer.
- `guardedWriteSmoke.ts` records real-provider smoke safety requirements.
- `scripts/verify-real-user-capabilities.mjs --real-apply-patch-guarded-write-smoke`
  runs the explicit opt-in real-provider gate against an isolated workspace.

## Required Evidence

- explicit opt-in is required
- write decision status is `approved-for-write`
- guarded gate status is `ready`
- final stale-read passes before the writer
- only one single-file Update File target is written
- changed files and write intents contain only the approved target
- production writer target is `isolated-workspace`
- real repository write is false
- terminal success is allowed only after verified write
- redaction passes
- target repository remains clean
- default production `apply_patch` and unified diff rejection remains unchanged

## Latest Run

2026-05-06 real-provider guarded write smoke:

- readiness preflight: passed
- real-provider model path: reached
- provider output: exactly one `apply_patch` block
- write decision: `approved-for-write`
- guarded gate: `ready`
- write lane: `written`
- changed files: `src/app.ts`
- write intents: `src/app.ts`
- production writer invoked: true, scoped to `isolated-workspace`
- real repository write: false
- no applied patch record: true
- terminal success allowed: true only after verified isolated workspace write
- repository clean: true
- redaction: pass

The first in-sandbox attempt failed before route execution with tsx IPC
`listen EPERM` on `/tmp/tsx-1000/*.pipe`; the rerun outside the sandbox passed.
That sandbox failure is not provider-network, route, redaction, or write-safety
evidence.

## Next Boundary

A passing guarded write candidate smoke is not default production write
readiness. Production write remains blocked until a separate production route
wiring review approves the entrypoint, result/session success surface, durable
state implications, and rollback/abort behavior for the real user workspace.
