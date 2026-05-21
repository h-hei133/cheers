# Route 173: Edit recovery apply

## Goal

Make edit recovery operational through explicit rollback apply for snapshot-backed edits.

Routes 167-172 established:

- exact fenced replacement
- runtime activation
- stable outcome taxonomy
- single-file snapshot / rollback readiness
- discovery manifest and confirmation
- bounded confirmed target-set execution
- partial-failure evidence and rollback readiness

Route 173 should now close the recovery loop:

- expose explicit rollback planning and apply through Edit / Patch owner module
- support single-file rollback from a known snapshot
- support target-set partial recovery by explicitly selecting snapshot-backed changed files
- verify target freshness before rollback
- report post-rollback verification
- project rollback result through Result Surface
- persist replay-safe rollback evidence for Session / Continue
- extend edit closeout verifier coverage

This route should make rollback user-reachable only as an explicit recovery action. No automatic rollback.

## Expected outcome

By the end of Route 173:

1. A user-facing explicit rollback request can target a known snapshot id and file.
2. Rollback apply restores the pre-write content for one snapshot-backed file when all preconditions pass.
3. Target-set partial failure can produce an explicit recovery plan for changed snapshot-backed files.
4. Recovery apply can handle a user-confirmed subset of snapshot-backed files.
5. Rollback preflight blocks stale/ambiguous/unknown/out-of-workspace targets before mutation.
6. Rollback results include verification, recovery status, and safe evidence markers.
7. Result Surface distinguishes rollback success, rollback stopped, rollback failed, and rollback not supported.
8. Session / Continue can summarize rollback actions without raw file content.
9. Verifier coverage proves explicit recovery works and automatic recovery does not happen.
10. No broad undo stack, automatic rollback, fuzzy recovery, or cross-session hidden mutation is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect current code/tests.

Do not load browser/provider/history docs unless a touched file proves they are needed.

## Reference scan

Use references only for explicit undo/revert/recovery behavior and result reporting.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/inspect_ai`

Secondary:

- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 12 files
- ClaudeCode: max 8 files
- gemini-cli: max 8 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- snapshot / revert / undo model
- explicit recovery confirmation
- stale-state protection before revert
- per-file recovery result metadata
- partial failure reporting
- verifier/eval report shape

Do not copy broad patch engines, fuzzy rollback, automatic recovery, generated edits, or multi-file atomic rollback claims.

## Owner modules

Primary owner:

- Edit / Patch

Collaborating owners:

- Workspace / File Context
- Permission / Policy
- Result Surface
- Session / Continue
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/orchestration/editRecoveryPlan.ts`
- `packages/ts-shell/src/orchestration/editRecoveryApply.ts`
- `packages/ts-shell/src/orchestration/editRecoveryOutcome.ts`
- `packages/ts-shell/src/orchestration/editRecoveryResult.ts` if existing file needs split/extension
- `packages/ts-shell/src/orchestration/editRecoveryPlan.test.ts`
- `packages/ts-shell/src/orchestration/editRecoveryApply.test.ts`
- `packages/ts-shell/src/orchestration/editRecoveryOutcome.test.ts`

Likely touched files:

- `editRollback.ts`
- `editSnapshot.ts`
- `editRecoveryResult.ts`
- `targetSetEditRecovery.ts`
- `targetSetEditResult.ts`
- `fencedEditResult.ts`
- `editPatchModule.ts`
- `workspaceFileContract.ts`
- `workspaceTargetProjection.ts`
- `resultSurfaceModule.ts`
- `actionableBlockerModule.ts`
- `capabilityResultClassification.ts`
- `terminalClassificationProjection.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if recovery activation requires it.

## Implementation tasks

### 1. Audit current recovery reachability

Before changing behavior, determine:

- how Route 170 rollback plan/apply seam is callable today
- whether any CLI/prompt path can request rollback
- whether target-set partial failures expose enough snapshot facts for recovery
- whether verifier currently asserts rollback is readiness-only
- whether snapshot residue cleanup/classification is stable

Summarize in the final report.

### 2. Define recovery plan

Add or strengthen `editRecoveryPlan.ts`.

Plan must include:

- recovery plan id
- requested recovery mode: single-file or target-set-subset
- explicit snapshot id(s)
- explicit target path(s)
- snapshot metadata safe summary
- workspace authority requirement
- freshness / changed-since-snapshot classification
- verification requirement
- mutation scope
- confirmation requirement
- redaction status

Plan itself is not mutation authority.

### 3. Explicit single-file rollback apply

Implement explicit rollback apply for one known snapshot-backed file.

Preconditions:

- explicit snapshot id
- explicit target file
- target is in workspace
- snapshot belongs to target
- workspace authority passes
- target freshness / changed-since-snapshot is classified
- final pre-rollback check runs
- user request is explicitly rollback/recover, not inferred from failure

Behavior:

- restore pre-write snapshot content
- run verification projection where available
- emit rollback outcome and recovery receipt
- preserve snapshot metadata safely
- no raw file content in output/transcript/report

### 4. Target-set partial recovery plan

For target-set edit partial failures:

- collect changed files with snapshot receipts
- identify files eligible for explicit recovery
- produce recovery plan for the eligible subset
- require explicit user confirmation for apply
- keep non-snapshot-backed or unchanged files out of apply
- classify ineligible files with safe reasons

Do not claim atomic rollback.

### 5. Optional target-set subset rollback apply

If safe, allow explicit apply over a bounded confirmed subset of snapshot-backed files.

Constraints:

- max files should not exceed Route 172 target-set max
- preflight every rollback target before mutation
- if preflight fails, stop before rollback mutation
- per-file rollback results are collected
- partial rollback failure is reported honestly
- no automatic rollback

If apply is too risky, implement the plan and stopped apply surface only, then explain why in final report.

### 6. Recovery outcome taxonomy

Define outcomes:

- `edit-recovery-plan-created`
- `edit-rollback-success`
- `edit-rollback-stopped-missing-snapshot`
- `edit-rollback-stopped-missing-target`
- `edit-rollback-stopped-ambiguous-target`
- `edit-rollback-stopped-out-of-workspace`
- `edit-rollback-stopped-stale-target`
- `edit-rollback-stopped-confirmation-required`
- `edit-rollback-stopped-not-supported`
- `edit-rollback-partial-failure`
- `edit-rollback-failed`

Map each to:

- terminal classification
- result status
- mutation ran / did not run
- rollback applied / not applied
- safe reason
- do-next text
- verifier marker
- continuation evidence eligibility

### 7. Result Surface integration

Terminal output should show:

- rollback success with restored file count
- rollback stopped with no mutation and do-next
- rollback failure with per-file summary
- partial rollback failure if subset apply partly succeeds
- verification summary after rollback
- snapshot ids or safe labels only

Rollback evidence must not make the original edit failure look successful.

### 8. Session / Continue integration

Session / Continue should summarize:

- recovery plan created
- rollback applied
- rollback stopped and why
- partial rollback failure
- verification summary
- remaining do-next

Do not persist raw snapshot content, raw file content, or fenced block contents.

`/continue` should be able to explain:

- what rollback is available
- what rollback was applied
- what remains unresolved
- what confirmation or target facts are missing

### 9. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- single-file rollback apply restores snapshot-backed file
- rollback with missing snapshot stops/no-write
- rollback with missing target stops/no-write
- rollback with stale/changed target is classified
- rollback request without explicit snapshot stops
- target-set partial failure produces recovery plan
- target-set recovery subset apply if implemented
- no automatic rollback after failed edit
- rollback report excludes raw content
- result-contract compatibility

### 10. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: explicit rollback apply status
- implementation manifest / recipes if new facades or gates are added
- foundation risk register if recovery risk changes
- module backlog if route status is tracked

No large new architecture doc.

## Boundaries

Hard boundaries:

- no automatic rollback
- no broad undo stack
- no rollback without explicit snapshot id / target facts
- no atomic rollback claim
- no broad/fuzzy replacement execution
- no generated-content edit
- no unconfirmed target-set mutation
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

- recovery plan tests
- rollback apply tests
- target-set recovery tests
- snapshot regression tests
- target-set edit regression tests
- fenced edit regression tests
- Result Surface tests if touched
- Session / Continue tests if touched
- verifier closeout tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

## Final report

Include:

1. What changed
2. Current recovery reachability audit
3. Recovery plan behavior
4. Single-file rollback apply behavior
5. Target-set partial recovery behavior
6. Outcome taxonomy
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Validation
11. Remaining risks
12. Next route recommendation
