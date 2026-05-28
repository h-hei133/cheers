# Validation Plan

This audit route changes only documentation. No build or tests are required for
this route unless documentation tooling is introduced. Future implementation
routes must run focused validation tied to the ownership they touch.

## This Audit Route

Required:

- Check all required docs exist under
  `docs/product-architecture-reset/sessionManager/`.
- `git diff --check`.
- `git status --short --branch`.

Not required:

- Build.
- Test suite.
- Live provider.
- Package script changes.

## Route 1: Store, Schema, Transcript Boundary

Focused tests:

- `npm test -w packages/ts-shell -- src/session/SessionManager.test.ts`
  filtered or full if filtering is not available.
- Cases covering:
  - directory substrate.
  - metadata/state/transcript load and write.
  - current-session selection.
  - workspace binding.
  - addTurn and transcript append.
  - corrupt session guidance.
  - unreadable session directory warning.
- `npm test -w packages/ts-shell -- src/session/sessionManagerBoundary.test.ts`.

Other checks:

- `npm run build -w packages/ts-shell`.
- Import scan for session modules importing `SessionManager.ts` after schema
  types move.
- `git diff --check`.

## Route 2: Replay, Recovery Snapshot, Pending Lifecycle

Focused tests:

- `npm test -w packages/ts-shell -- src/session/SessionManager.test.ts`
  covering replay plan, runtime seed, pending lifecycle, direct-resolution
  dedupe, transcript repair, terminal persistence, and recovery snapshot.
- `npm test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts`.
- Shell recovery tests:
  - `src/core/shell/recovery.test.ts`.
  - `src/core/shell/recovery.read-model-priority.test.ts`.
  - `src/core/shell/recovery.repeated-handoff-cleanup.test.ts`.
  - `src/core/shell/recovery.repeated-handoff-direct-resolution.test.ts`.
  - `src/core/shell/recovery.terminal-boundary.test.ts`.

Truth gates if terminal or result fields are touched:

- `npm run verify:result-contract`.
- `npm run verify:route221-anti-false-success-gate`.

Other checks:

- `npm run build -w packages/ts-shell`.
- `git diff --check`.

## Route 3: Continuity Snapshot And Legacy Working Memory

Focused tests:

- `npm test -w packages/ts-shell -- src/session/SessionManager.test.ts`
  covering legacy permissions, approval memory, task truth anchors, compact
  continuity, stopped failure details, approval/tool provenance, and transform
  evidence.
- `npm test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts`.
- `npm test -w packages/ts-shell -- src/session/longSessionDurability.test.ts`.
- `npm test -w packages/ts-shell -- src/session/continuationEvidenceParity.test.ts`.
- `npm test -w packages/ts-shell -- src/session/sessionCompactModule.test.ts`.
- `npm test -w packages/ts-shell -- src/session/approvalMemoryCodec.test.ts`.
- `npm test -w packages/ts-shell -- src/session/permissionRequestMemoryCodec.test.ts`.

Truth gates:

- `npm run verify:result-contract` if terminal/result truth is touched.
- `npm run verify:route221-anti-false-success-gate` if success/not-proven,
  skipped, partial, blocked, stopped, or redaction semantics are touched.

Other checks:

- `npm run build -w packages/ts-shell`.
- Import scan for product runtime importing docs/scripts/history.
- `git diff --check`.

## Route 4: Approval Memory And Request-Scope Facts

Focused tests:

- Approval and permission request cases in `SessionManager.test.ts`.
- `npm test -w packages/ts-shell -- src/session/approvalMemoryCodec.test.ts`.
- `npm test -w packages/ts-shell -- src/session/approvalAuditProjection.test.ts`.
- `npm test -w packages/ts-shell -- src/session/permissionRequestMemoryCodec.test.ts`.

Policy-adjacent gates if any write/command policy consumes the facts:

- Focused permission/write-gate tests.
- Mutation-lane rejection regression if write authorization behavior changes.

Other checks:

- `npm run build -w packages/ts-shell`.
- `git diff --check`.

## Route 5: Recovery Selection And Presentation

Focused tests:

- `npm test -w packages/ts-shell -- src/session/sessionRecoverySelection.test.ts`.
- Reentry and project context cases in `SessionManager.test.ts`.
- Shell recovery tests if eligibility changes.
- CLI/session surface tests if rendered output changes:
  - `src/core/shell/sessionStateSurface` tests if present.
  - `src/core/shell/startupSurfaceRenderer` tests if present.
  - relevant `entrypoints/cliSessionModule` tests if touched.

Truth gates:

- Result contract and Route221 gate only if terminal truth fields or success
  surfaces change.

Other checks:

- `npm run build -w packages/ts-shell`.
- `git diff --check`.

## Route 6: Dead Residue And Compatibility Cleanup

Focused tests:

- Old-session fixture tests proving legacy compatibility can be removed or
  remains covered.
- Import scan for no remaining production callers of deprecated facade methods
  or type re-exports.
- `SessionManager.test.ts` compatibility subset.

Other checks:

- `npm run build -w packages/ts-shell`.
- `git diff --check`.
- `git status --short --branch`.

## Validation Principles

- Do not run live provider gates for SessionManager extraction unless a future
  route explicitly changes provider-facing behavior.
- Do not change package scripts to make validation convenient.
- Do not weaken tests to make extraction pass.
- If broad tests fail, classify failures as product drift, stale expectation,
  harness/setup drift, obsolete scenario, future expectation, or environment
  issue before changing implementation or tests.
- Treat audit residue and generated files as cleanup obligations before final
  status.
