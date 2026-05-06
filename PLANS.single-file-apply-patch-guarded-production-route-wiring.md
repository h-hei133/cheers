# Single-file apply_patch guarded production route wiring

Status: route contract and synthetic route passed; real-provider guarded route smoke attempted/blocked by provider network; default production write remains disabled.

## Scope

This phase adds a guarded production route seam for a single-file `apply_patch`
Update File operation. The route is explicit opt-in only and may write only an
isolated temporary workspace target during the real-provider smoke.

It does not enable default production `apply_patch`, unified diff, multi-file,
add, delete, move, AST, fuzzy patching, rollback, release/default gates, or
unreviewed CLI/session/runtime wiring.

## Implemented Boundaries

- `routeWiringGate.ts` defines the route-level entry gate.
- `productionRoute.ts` composes the route gate with the guarded write lane.
- `guardedRouteSmoke.ts` records real-provider route smoke safety requirements.
- `scripts/verify-real-user-capabilities.mjs --real-apply-patch-guarded-route-smoke`
  runs the explicit opt-in real-provider route gate against an isolated
  workspace.

## Required Evidence

- explicit route opt-in is required
- write decision status must be `approved-for-write`
- route wiring gate status must be `ready`
- guarded gate status must be `ready`
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

2026-05-06 real-provider guarded route smoke:

- in-sandbox attempt: readiness preflight passed, then tsx IPC failed with
  `listen EPERM` on `/tmp/tsx-1000/*.pipe` before route execution
- rerun outside sandbox: readiness preflight passed and provider path was reached
- result: `PROVIDER_NETWORK`, `provider-network-inconclusive`
- provider message after redaction: `fetch failed`, retriable
- fixture changed: none
- repository clean: true
- redaction: pass

This is an attempted/blocked provider-network result, not a route failure,
redaction failure, unexpected write, or write-success result. Do not retry
repeatedly; rerun only as an explicit real-provider gate attempt.

## Next Boundary

The guarded production route is implemented and locally validated, but the
real-provider route smoke is not passed yet. Production write remains blocked
until the real-provider guarded route smoke passes and a separate review
approves any CLI/session/runtime production wiring.
