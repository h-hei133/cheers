# Single-file apply_patch guarded production route wiring

Status: route contract, synthetic route, result/session projection, and real-provider guarded route smoke passed; default production write remains disabled.

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
- `productionRouteProjection.ts` maps verified route output through
  resultMapper-facing and session-display-facing success/stopped projections.
- `guardedRouteSmoke.ts` records real-provider route smoke safety requirements.
- `scripts/verify-real-user-capabilities.mjs --real-apply-patch-guarded-route-smoke`
  runs the explicit opt-in real-provider route gate against an isolated
  workspace and verifies the runtime projection.

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
- resultMapper projection reports success only for a verified write
- session display projection reports `write-success` only for a verified write
- redaction passes
- target repository remains clean
- default production `apply_patch` and unified diff rejection remains unchanged

## Latest Run

2026-05-06 real-provider guarded route smoke rerun after result/session
projection wiring:

- repository pre-check: clean
- readiness preflight: passed with explicit `PRIVATE_AGENTS_REAL_HOME`
- provider path: reached
- provider output: exactly one `apply_patch` block
- write decision: `approved-for-write`
- guarded gate: `ready`
- route gate: `ready`
- production route: `written`
- write lane: `written`
- resultMapper projection: `completed/success`
- session display projection: `write-success`
- fixture changed: `src/app.ts`
- changed files / write intents: `src/app.ts`
- production writer target: `isolated-workspace`
- real repository write: false
- no applied patch record: true
- terminal success allowed: true only after verified isolated workspace write
- repository clean: true
- redaction: pass

This is a passed explicit opt-in guarded route gate. It does not enable default
production write.

## Next Boundary

The guarded production route is implemented, locally validated, and
real-provider validated against an isolated workspace. Production write remains
blocked by default; any CLI / `runMvpIntegratedFlow` real-user workspace wiring
still requires a separate entrypoint review for explicit opt-in UX, durable
state implications, and abort/rollback boundaries.
