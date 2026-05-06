# Single-file apply_patch real-provider isolated write gate

Status: passed as an explicit opt-in isolated fixture smoke after the route bridge repair; production write remains disabled.

## Scope

This gate lets a real provider produce one single-file `apply_patch` preview, then routes that preview through the local write decision gate and the synthetic isolated write lane. The only allowed mutation is `src/app.ts` inside a temporary fixture under `PRIVATE_AGENTS_TEST_ROOT`.

It does not enable the production writer, default production `apply_patch`, unified diff, multi-file, add, delete, move, AST, fuzzy patching, rollback, or release/default gates.

## Command

```bash
rtk proxy env HOME=/tmp/private-agents-test/apply-patch-write-gate-home USERPROFILE=/tmp/private-agents-test/apply-patch-write-gate-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-write-gate PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-real-user-capabilities.mjs --real-apply-patch-write-fixture-smoke
```

The command is explicit opt-in. It uses the existing readiness/redaction smoke infrastructure and must not manually read, print, copy, or modify real provider configuration.

## Required Evidence

- readiness preflight passes before the model turn
- real provider path reaches one model turn
- exactly one `apply_patch` block is extracted
- `writeLaneStatus=written`
- `changedFiles=src/app.ts`
- `writeIntents=src/app.ts`
- `fixtureWriterInvoked=true`
- `productionWriterInvoked=false`
- `noAppliedPatchRecord=true`
- `terminalSuccessAllowed=true` only after verified fixture write
- `redaction=pass`
- temporary fixture `LOCKED.md` remains unchanged
- target repository remains clean before and after

## Failure Attribution

- `provider-network-inconclusive`: provider endpoint, network, or timeout failure
- `config-failure`: missing or invalid explicit real-provider opt-in
- `redaction-failure`: provider output could leak provider/auth details
- `provider-output-missing-apply-patch`: provider did not emit an apply_patch block
- `provider-output-multiple-patches`: provider emitted more than one patch block
- `write-fixture-failure`: local write decision or isolated lane failed
- `unexpected-write`: files outside the approved fixture target changed, protected fixture file changed, or production writer became reachable
- `unexpected-success-claim`: success was surfaced without a verified isolated fixture write

## Next Boundary

A passing isolated fixture write gate is evidence for planning production write wiring, not approval to wire it. Production write remains blocked.

Before any production write wiring, separately review the production route, final stale-read location, writer boundary, result/session success surface, and default rejection behavior.

## Latest Runs

2026-05-06 initial attempt:

- readiness preflight: passed
- real-provider model path: reached
- result: `PROVIDER_NETWORK`, `provider-network-inconclusive`
- provider message after redaction: operation aborted due to timeout
- fixture mutation: none
- repository clean: true
- redaction: pass

This is an attempted/blocked gate result, not a route failure and not a write-success result. Do not retry repeatedly; rerun only as an explicit real-provider gate attempt.

2026-05-06 single retry:

- readiness preflight: passed with explicit `PRIVATE_AGENTS_REAL_HOME`
- default production `apply_patch` / unified diff rejection regression: passed
- real-provider model path: reached
- result: `PROVIDER_NETWORK`, `provider-network-inconclusive`
- provider message after redaction: operation aborted due to timeout
- fixture mutation: none
- repository clean: true
- redaction: pass

The retry remains attempted/blocked by provider timeout. It is not evidence of route failure, unexpected write, or write success.

2026-05-06 route repair and rerun:

- readiness preflight: passed with explicit `PRIVATE_AGENTS_REAL_HOME`
- real-provider model path: reached
- provider output: exactly one `apply_patch` block
- route bridge: repaired to return the isolated write lane result from the eval runner
- write decision: `approved-for-write`
- write lane: `written`
- changed files: `src/app.ts`
- write intents: `src/app.ts`
- fixture writer invoked: true
- production writer invoked: false
- no applied patch record: true
- terminal success allowed: true only after verified isolated fixture write
- repository clean: true
- redaction: pass

This is a passed isolated fixture write gate. It is not production write wiring and does not change default production `apply_patch` / unified diff rejection.

## Blocker Closure

Provider-timeout closure status: superseded by the passed route-repair rerun.

- no further automatic retry is planned
- the real-provider isolated fixture write gate can be treated as passed
- production write remains blocked
- default production `apply_patch` and unified diff rejection must remain unchanged
- a future rerun requires explicit real-provider opt-in and the same isolated fixture/redaction/repo-clean constraints
