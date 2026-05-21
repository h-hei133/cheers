# Route 170: Edit snapshot recovery

## Goal

Add a real single-file snapshot and recovery substrate for Edit / Patch, then wire it into the activated exact fenced replacement lane.

Route 167 implemented the exact fenced replacement owner lane.
Route 168 activated it through prompt / CLI / agent-loop selection.
Route 169 closed out outcome taxonomy, Result Surface, Session / Continue, verifier markers, and no-write safety.

Route 170 should now add the missing safety substrate required before broader edit expansion:

- pre-write single-file snapshot receipt
- rollback readiness classification
- rollback plan projection
- failure recovery status for writer / verification failures
- explicit rollback seam for a known snapshot
- Result Surface / Session / Continue / verifier coverage
- future multi-file rollback precondition documented but not executed

This route is allowed to be larger than a contract-only route, but it must stay single-file and explicit.

## Expected outcome

By the end of Route 170:

1. Activated exact fenced replacement captures a pre-write snapshot before mutation.
2. Snapshot capture is part of the Edit / Patch owner lane, not an ad hoc caller behavior.
3. Write success reports snapshot receipt status without exposing raw file content.
4. Writer failure and verification failure report rollback readiness.
5. A rollback plan can be produced for a known single-file snapshot.
6. A narrow explicit rollback seam exists if it can be implemented safely.
7. No automatic rollback occurs.
8. Result Surface and Session / Continue can summarize snapshot / rollback status safely.
9. Verifier coverage proves snapshot receipt, rollback readiness, and no raw-content leakage.
10. Future discovery / multi-file edit still remains blocked until target-set and atomicity routes exist.

## Required docs

Read only these first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/tool-runtime-execution-flow.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/foundation/foundation-risk-register.md`

If one is stale or unavailable, prefer current code and focused tests.

Do not read browser/provider/history docs unless touched code proves they are needed.

## Reference scan

Use references only for edit snapshot, revert, undo, result, and gate patterns.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/inspect_ai`

Secondary:

- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 10 files
- ClaudeCode: max 8 files
- gemini-cli: max 6 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- snapshot / revert / undo model
- exact edit stale-file protection
- permission metadata for file modification
- result summary for write failure and recovery readiness
- verifier / eval report fields for recovery evidence

Do not copy broad patch engines, fuzzy replacement, generated edit, multi-file rollback, or autonomous recovery behavior.

## Owner modules

Primary owner:

- Edit / Patch

Required downstream owners:

- Workspace / File Context
- Permission / Policy
- Runtime, only for receipt vocabulary alignment
- Result Surface
- Session / Continue
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/orchestration/editSnapshot.ts`
- `packages/ts-shell/src/orchestration/editRollback.ts`
- `packages/ts-shell/src/orchestration/editRecoveryResult.ts`
- `packages/ts-shell/src/orchestration/editSnapshot.test.ts`
- `packages/ts-shell/src/orchestration/editRollback.test.ts`
- `packages/ts-shell/src/orchestration/editRecoveryResult.test.ts`

Likely touched files:

- `fencedEditRoute.ts`
- `fencedEditResult.ts`
- `fencedEditOutcome.ts`
- `editPatchModule.ts`
- `editPatchManifest.ts`
- `mutationVerificationProjection.ts`
- `resultSurfaceModule.ts`
- `actionableBlockerModule.ts`
- `capabilityResultClassification.ts`
- `terminalClassificationProjection.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `verify-edit-capability-closeout.mjs`
- `scripts/verify/*` only if verifier module boundaries require it

Avoid expanding `runMvpIntegratedFlow.ts`; it should only observe projected recovery facts if needed.

## Implementation tasks

### 1. Audit current recovery behavior

Before changing code, determine:

- whether any snapshot-like behavior already exists
- whether writer failure preserves enough pre-write state
- whether verification failure has any recovery projection
- where current results mention rollback or recovery, if anywhere
- whether verifier already asserts recovery is unsupported

Summarize this audit in the final report.

### 2. Define snapshot receipt

Add `editSnapshot.ts`.

Snapshot receipt should include:

- snapshot id
- target file
- workspace root hash or safe label
- pre-write content hash
- pre-write size
- pre-write mtime or freshness fact if available
- snapshot storage status
- redaction status
- created-at logical timestamp or deterministic test timestamp
- cleanup / retention class

Snapshot receipt must not be user-visible raw file content.

Internal snapshot storage may contain the pre-write file content only if needed for rollback, but reports, transcript, terminal output, and verifier JSON must not dump it.

### 3. Snapshot storage strategy

Implement the smallest safe storage strategy.

Preferred options, in order:

1. Existing project-local snapshot location if already present.
2. `.sisyphus/edit-snapshots/` with route-owned metadata and cleanup rules.
3. In-memory snapshot only for tests, if persistent storage is too risky.

If persistent snapshots are added:

- do not store outside workspace / project-controlled area
- avoid predictable content leaks in report names
- metadata must be safe
- cleanup behavior must be explicit
- verifier must classify expected residue or clean it

### 4. Wire snapshot into fenced replacement

Before the activated exact fenced replacement mutates the file:

- confirm workspace authority
- confirm target is explicit
- run final stale-read as currently required
- capture snapshot
- then run existing writer path

Do not capture snapshot for stopped unsupported / no-write paths.

Snapshot failure should stop before mutation unless there is an explicit route decision to allow no-snapshot writes. Prefer stop-before-mutation.

### 5. Define rollback readiness

Add `editRecoveryResult.ts`.

Classify recovery state:

- `snapshot-created`
- `snapshot-not-needed-no-write`
- `snapshot-failed-no-mutation`
- `rollback-available`
- `rollback-not-needed-success`
- `rollback-not-run`
- `rollback-not-supported`
- `rollback-blocked-stale-target`
- `rollback-failed`

Map recovery state to:

- result evidence marker
- terminal safe summary
- continuation-safe summary
- verifier marker

### 6. Rollback plan projection

Add `editRollback.ts`.

Support a rollback plan for a known single-file snapshot.

Plan should verify:

- snapshot id exists
- target is in workspace
- current target still corresponds to the same file
- rollback is single-file only
- rollback would restore pre-write content
- stale/changed-since-snapshot state is classified

The plan can be dry-run if apply is too risky.

If implementing explicit apply is safe, require:

- explicit snapshot id
- explicit target
- workspace authority
- final stale-read or changed-since-snapshot check
- no multi-file
- no automatic invocation from edit failure

No automatic rollback.

### 7. Writer and verification failure behavior

When fenced replacement writer or verification fails:

- preserve snapshot receipt facts
- classify rollback readiness
- report whether rollback is available
- do not automatically apply rollback
- do not call provider/model/browser
- do not hide partial mutation facts

Hard writer / verification failures should remain hard failures where current Result Surface requires that; rollback readiness is evidence, not terminal truthfulness by itself.

### 8. Result Surface integration

Terminal result should show:

- success: changed file, verification summary, snapshot receipt status
- stopped before mutation: no snapshot needed or snapshot failed before write
- writer failed: failure plus rollback readiness
- verification failed: failure plus rollback readiness
- explicit rollback plan/apply result if implemented

Do not let snapshot receipt make a failed edit look successful.

### 9. Session / Continue integration

Session / Continue should be able to summarize:

- snapshot created for successful fenced replacement
- snapshot failed before mutation
- rollback available after writer / verification failure
- rollback plan status
- rollback not run
- rollback applied if explicit apply is implemented

Do not persist raw snapshot content, raw file content, or full fenced blocks in transcript / continue summaries.

### 10. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- activated fenced replacement success includes snapshot receipt marker
- stopped unsupported edit does not create snapshot
- missing mapping / missing target does not create snapshot
- snapshot failure stops before mutation
- writer failure reports rollback readiness
- verification failure reports rollback readiness
- rollback plan dry-run works for known snapshot
- explicit rollback apply if implemented
- verifier report excludes raw snapshot/file content
- expected snapshot residue is cleaned or classified

### 11. Docs update

Update only long-lived docs affected:

- `future-edit-expansion-contract.md`: snapshot substrate status
- implementation manifest / recipes if new facades or validation gates are added
- foundation risk register if recovery readiness reduces an edit expansion risk
- module backlog if route status is tracked

No new large architecture doc unless the implementation truly needs it.

## Boundaries

Hard boundaries:

- no broad/fuzzy replacement execution
- no discovery edit execution
- no multi-file edit execution
- no generated-content edit
- no automatic rollback
- no rollback across multiple files
- no provider/model calls
- no browser work
- no workspace authority weakening
- no stale-read bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- snapshot tests
- rollback plan/apply tests if apply exists
- fenced edit route/result/outcome tests
- stale-read / workspace authority regression tests
- Result Surface tests if touched
- Session / Continue tests if touched
- verifier closeout tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are unexpectedly touched
- `rtk git diff --check`
- `rtk git status --short --branch`

## Final report

Include:

1. What changed
2. Current recovery audit
3. Snapshot receipt behavior
4. Snapshot storage strategy
5. Rollback readiness taxonomy
6. Rollback plan / apply behavior
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Validation
11. Remaining risks
12. Next route recommendation
