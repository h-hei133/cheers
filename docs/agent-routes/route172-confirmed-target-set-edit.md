# Route 172: Confirmed target-set edit

## Goal

Enable a bounded multi-file discovery edit execution lane for explicitly confirmed target sets, limited to exact fenced replacement only.

Routes 167-170 established the safe single-file lane:

- exact fenced replacement
- runtime activation
- stable outcome taxonomy
- single-file snapshot / rollback readiness

Route 171 added discovery edit manifest and confirmation:

- no-write candidate manifest
- mutationAuthority: not-granted
- explicit confirmation model
- confirmed single-target handoff to existing fenced replacement

Route 172 should now open the next narrow execution lane:

- confirmed target-set execution
- bounded max-file guard
- per-file exact fenced replacement plan
- per-file workspace authority
- per-file final stale-read
- per-file pre-write snapshot
- per-file verification projection
- partial-failure taxonomy
- rollback readiness per changed file
- Result Surface / Session / Continue / verifier coverage

This is the first bounded multi-file edit route, but it is not broad edit.

## Expected outcome

By the end of Route 172:

1. A discovery manifest with an explicitly confirmed target set can execute when every candidate reduces to exact fenced replacement.
2. Multi-file mutation is capped by a strict max-file guard.
3. Every file has its own authority, stale-read, snapshot, write, verification, and recovery facts.
4. Preflight failures stop before any mutation.
5. Mid-execution failures produce partial-failure evidence and rollback readiness for changed files.
6. Result Surface distinguishes full success, stopped preflight, partial failure, and hard failure.
7. Session / Continue can summarize target-set execution without raw file content.
8. Verifier coverage proves confirmed target-set execution, no-write stopped paths, and partial-failure behavior.
9. Fuzzy, generated, broad, automatic discovery, and unconfirmed target-set edits remain stopped/no-write.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect current code/tests.

Do not load browser/provider/history docs unless touched code proves they are needed.

## Reference scan

Use references only for multi-file edit confirmation, per-file write planning, partial failure, and result reporting.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 12 files
- ClaudeCode: max 8 files
- gemini-cli: max 8 files
- Inspect AI: max 4 files
- mini-swe-agent: max 4 files

Focus:

- edit target-set confirmation
- per-file modification metadata
- permission and stale-state protection
- partial failure reporting
- verifier/eval report shape
- concise user-facing summaries

Do not copy broad patch engines, fuzzy recovery, generated edit, autonomous refactor, or automatic rollback.

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

- `packages/ts-shell/src/orchestration/targetSetEditPlan.ts`
- `packages/ts-shell/src/orchestration/targetSetEditRoute.ts`
- `packages/ts-shell/src/orchestration/targetSetEditResult.ts`
- `packages/ts-shell/src/orchestration/targetSetEditRecovery.ts`
- `packages/ts-shell/src/orchestration/targetSetEditPlan.test.ts`
- `packages/ts-shell/src/orchestration/targetSetEditRoute.test.ts`
- `packages/ts-shell/src/orchestration/targetSetEditResult.test.ts`

Likely touched files:

- `discoveryEditManifest.ts`
- `discoveryEditConfirmation.ts`
- `discoveryEditRuntime.ts`
- `discoveryEditResult.ts`
- `fencedEditRoute.ts`
- `fencedEditOutcome.ts`
- `fencedEditResult.ts`
- `editSnapshot.ts`
- `editRecoveryResult.ts`
- `editRollback.ts`
- `editPatchModule.ts`
- `futureEditContract.ts`
- `futureEditPlanner.ts`
- `workspaceFileContract.ts`
- `workspaceTargetProjection.ts`
- `resultSurfaceModule.ts`
- `actionableBlockerModule.ts`
- `capabilityResultClassification.ts`
- `terminalClassificationProjection.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if required.

## Implementation tasks

### 1. Audit current target-set behavior

Before changing behavior, determine:

- how confirmed target-set discovery edit currently stops
- what evidence/session summaries are already emitted
- how single-target handoff currently reuses fenced replacement
- whether any multi-file planning helper already exists
- which verifier markers prove target-set remains no-write today

Summarize in the final report.

### 2. Define target-set edit plan

Add `targetSetEditPlan.ts`.

Plan requirements:

- source discovery manifest id
- explicit confirmed target set
- target count within max-file guard
- per-target path label
- per-target exact old/new fenced mapping
- per-target match expectation: exactly one
- per-target workspace authority requirement
- per-target stale-read requirement
- per-target snapshot requirement
- per-target verification requirement
- execution order
- redaction status

The plan is not itself mutation authority. Execution still re-checks all write preconditions.

### 3. Max-file guard

Add a strict guard.

Suggested default:

- max 3 files for the first execution route

Behavior:

- over max target set stops before mutation
- missing target set stops before mutation
- duplicate targets stop before mutation
- target outside workspace stops before mutation
- generated/fuzzy/broad edit stops before mutation

### 4. Preflight all targets before writing

Before any file is mutated:

- confirm target set is explicit
- confirm every target is in workspace
- confirm every target has exact mapping
- confirm every target has exactly one match
- confirm no unsupported target kind exists
- confirm planned verification exists
- classify stale-read requirements

If any preflight fails, stop with `mutation:not-run`.

### 5. Execute per-file through existing lane

For each target:

- reuse existing exact fenced replacement route or its internal owner helper
- do not create a second writer
- run workspace authority
- run final stale-read
- capture pre-write snapshot
- write exact replacement
- project verification result
- collect per-file result and recovery status

Avoid duplicating single-file logic. Create a multi-file coordinator over the existing safe lane.

### 6. Failure model

Define outcome taxonomy:

- `target-set-edit-success`
- `target-set-edit-preflight-stopped`
- `target-set-edit-confirmation-required`
- `target-set-edit-over-max-files`
- `target-set-edit-unsupported-fuzzy`
- `target-set-edit-unsupported-generated`
- `target-set-edit-unsupported-broad`
- `target-set-edit-partial-failure`
- `target-set-edit-writer-failed`
- `target-set-edit-verification-failed`
- `target-set-edit-rollback-ready`
- `target-set-edit-rollback-not-run`

Rules:

- preflight failure: no mutation
- all files success: success
- any write after earlier success fails: partial failure
- verification failure after mutation: partial or failed according to current Result Surface rules
- rollback readiness is evidence, not automatic terminal success
- no automatic rollback

### 7. Result Surface integration

Terminal output should show:

- changed files count
- per-file summary
- verification summary
- snapshot/recovery summary
- partial failure details
- do-next text for rollback or target confirmation
- no-write evidence when stopped before mutation

Do not emit raw old/new blocks or full file contents.

### 8. Session / Continue integration

Session / Continue should summarize:

- manifest id
- confirmed target set
- per-file changed/stopped/failed summaries
- snapshot ids or safe labels
- rollback readiness per changed file
- verification summary
- do-next text

Do not persist raw file content or raw fenced blocks.

`/continue` should be able to explain:

- full success
- preflight stopped no-write
- partial failure
- rollback readiness
- required next confirmation/action

### 9. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- confirmed target-set success with 2 files
- over max files stopped/no-write
- unconfirmed target set stopped/no-write
- missing mapping in one file stops before any mutation
- multiple match in one file stops before any mutation
- stale-read in one file stops or fails safely according to route design
- partial failure reports changed files and rollback readiness
- unsupported fuzzy/generated/broad target-set stopped/no-write
- continuation-safe target-set evidence present
- raw content excluded
- result-contract compatibility

### 10. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: target-set execution status
- implementation manifest / recipes if new facades or validation gates are added
- foundation risk register if multi-file edit risk changes
- module backlog if route status is tracked

No new large architecture doc.

## Boundaries

Hard boundaries:

- no broad/fuzzy replacement execution
- no generated-content edit
- no automatic target discovery mutation
- no unconfirmed target-set mutation
- no target set above max-file guard
- no automatic rollback
- no atomic rollback claim
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

- target-set plan tests
- target-set route tests
- target-set result/recovery tests
- discovery confirmation/runtime regression tests
- fenced edit route/result/outcome regression tests
- snapshot/recovery regression tests
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
2. Current target-set behavior audit
3. Target-set plan behavior
4. Confirmation and max-file guard
5. Execution model
6. Failure / partial-failure model
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Validation
11. Remaining risks
12. Next route recommendation
