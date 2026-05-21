# Route 174: Target-set edit transaction

## Goal

Harden bounded target-set edit execution into an auditable transaction model with explicit partial-failure and recovery workflow.

Routes 167-173 established:

- exact fenced replacement lane
- runtime activation
- stable outcome taxonomy
- single-file snapshot and rollback readiness
- discovery manifest and confirmation
- confirmed target-set execution
- explicit snapshot-backed recovery apply

Route 174 should now define and implement the transaction layer for target-set edit:

- transaction id and execution journal
- all-target preflight atomicity
- per-file execution journal
- partial-failure policy
- verification aggregation
- rollback recommendation policy
- explicit recovery workflow handoff
- Result Surface / Session / Continue / verifier coverage
- no claim of true atomic rollback

This route should make target-set edit operationally trustworthy before any broader edit expansion.

## Expected outcome

By the end of Route 174:

1. Every target-set edit execution has a transaction id and safe journal.
2. Preflight checks all targets before the first mutation.
3. If preflight fails, no file is mutated.
4. If execution partially fails, changed files and failed files are clearly separated.
5. Every changed file has snapshot / recovery state.
6. Verification aggregation reports per-file and overall outcome.
7. Terminal output gives a clear recovery recommendation.
8. Session / Continue can guide the user into explicit recovery apply.
9. Verifier coverage proves preflight no-write, partial failure, recovery recommendation, and no raw content leakage.
10. The implementation does not claim true atomic multi-file rollback.

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

Then inspect current Route 172/173 code and tests.

Do not load browser/provider/history docs unless touched code proves they are needed.

## Reference scan

Use references only for multi-file edit transaction, partial failure, journal, verification aggregation, and recovery UX.

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

- multi-file edit summaries
- partial failure result shape
- transaction / journal / trajectory shape
- verification aggregation
- explicit recovery recommendation
- user-facing stopped/error wording

Do not copy broad patch engines, fuzzy repair, generated edit, autonomous rollback, or atomic rollback claims.

## Owner modules

Primary owner:

- Edit / Patch

Collaborating owners:

- Workspace / File Context
- Permission / Policy
- Result Surface
- Session / Continue
- Harness / Eval
- Runtime only for receipt vocabulary alignment if needed

Likely new files:

- `packages/ts-shell/src/orchestration/targetSetEditTransaction.ts`
- `packages/ts-shell/src/orchestration/targetSetEditJournal.ts`
- `packages/ts-shell/src/orchestration/targetSetEditPolicy.ts`
- `packages/ts-shell/src/orchestration/targetSetEditVerification.ts`
- `packages/ts-shell/src/orchestration/targetSetEditRecoveryWorkflow.ts`
- `packages/ts-shell/src/orchestration/targetSetEditTransaction.test.ts`
- `packages/ts-shell/src/orchestration/targetSetEditJournal.test.ts`
- `packages/ts-shell/src/orchestration/targetSetEditPolicy.test.ts`
- `packages/ts-shell/src/orchestration/targetSetEditVerification.test.ts`

Likely touched files:

- `targetSetEditPlan.ts`
- `targetSetEditRoute.ts`
- `targetSetEditResult.ts`
- `targetSetEditRecovery.ts`
- `editRecoveryPlan.ts`
- `editRecoveryApply.ts`
- `editRecoveryOutcome.ts`
- `editRecoveryResult.ts`
- `editSnapshot.ts`
- `fencedEditRoute.ts`
- `fencedEditResult.ts`
- `editPatchModule.ts`
- `resultSurfaceModule.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current target-set transaction behavior

Before changing behavior, determine:

- how target-set route currently tracks execution
- whether transaction ids exist
- how partial failure is represented
- how changed/failed/skipped files are separated
- how verification aggregation works today
- how explicit recovery apply is linked from target-set partial failure
- what verifier already proves

Summarize in the final report.

### 2. Add transaction model

Add `targetSetEditTransaction.ts`.

Transaction should include:

- transaction id
- source discovery manifest id
- confirmed target set
- max-file guard status
- preflight status
- execution status
- verification status
- recovery status
- redaction status
- transaction-level outcome

Transaction status values:

- `planned`
- `preflight-stopped`
- `executing`
- `succeeded`
- `partial-failure`
- `failed`
- `recovery-available`
- `recovery-applied`
- `recovery-partial-failure`

Do not encode raw file content.

### 3. Add execution journal

Add `targetSetEditJournal.ts`.

Journal should record safe per-file steps:

- preflight started / passed / failed
- authority checked
- match count checked
- stale-read checked
- snapshot captured
- write attempted
- write succeeded / failed
- verification projected
- recovery readiness projected
- rollback applied if explicit recovery path runs

Journal must not include:

- raw old/new blocks
- raw file content
- secrets
- provider paths

### 4. Preflight atomicity policy

Add `targetSetEditPolicy.ts`.

Policy:

- all targets must preflight before first write
- any preflight failure stops transaction with mutation:not-run
- no target over max-file guard
- no duplicate targets
- no outside-workspace targets
- no missing mapping
- no multiple-match target
- no unsupported fuzzy/generated/broad operation
- no unconfirmed target set

This is preflight atomicity only, not write atomicity.

### 5. Execution failure policy

Define execution behavior:

- once mutation starts, failures become partial-failure if any previous file changed
- changed files must have snapshot/recovery state
- failed files must have safe failure reason
- unattempted files must be reported separately if execution stops early
- no automatic rollback
- rollback recommendation should point to explicit recovery workflow

### 6. Verification aggregation

Add `targetSetEditVerification.ts`.

Aggregate:

- per-file verification summary
- overall verification status
- failed verification files
- skipped verification files
- verification hard failure vs warning
- recovery recommendation if verification failure follows mutation

Do not let verification failure appear as full success.

### 7. Recovery workflow handoff

Add `targetSetEditRecoveryWorkflow.ts`.

Given a partial-failure transaction, produce:

- eligible rollback targets
- ineligible rollback targets with reasons
- required explicit confirmation
- recovery command/prompt guidance if an existing surface supports it
- recovery plan ids or safe snapshot ids
- do-next text

Do not apply rollback automatically.

### 8. Result Surface integration

Update target-set result projection.

Terminal output should distinguish:

- full success
- preflight stopped no-write
- partial failure
- writer failed before any file changed
- verification failed after mutation
- recovery available
- explicit recovery applied
- recovery partial failure

Output should show:

- changed file count
- failed file count
- unattempted file count
- verification aggregate
- recovery recommendation
- safe transaction id / evidence id

No raw file content or fenced blocks.

### 9. Session / Continue integration

Session / Continue should preserve:

- transaction id
- manifest id
- changed/failed/unattempted file summaries
- verification aggregate
- recovery availability
- recovery recommendation
- explicit recovery result if applied

`/continue` should be able to guide:

- explain preflight stopped no-write
- explain partial failure
- propose explicit recovery apply
- explain recovery applied / failed
- list remaining unresolved files safely

### 10. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- transaction id emitted for target-set success
- preflight failure mutates no files
- over-max stopped no-write
- one target preflight failure stops before all writes
- partial failure separates changed/failed/unattempted
- changed files include snapshot/recovery status
- verification aggregation visible
- recovery recommendation visible
- explicit recovery workflow evidence present
- no automatic rollback after partial failure
- raw content excluded from report/session/result
- result-contract compatibility

### 11. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: target-set transaction / partial-failure policy
- implementation manifest / recipes if new facades or gates are added
- foundation risk register if target-set risk changes
- module backlog if route status is tracked

No large new architecture doc.

## Boundaries

Hard boundaries:

- no broad/fuzzy replacement execution
- no generated-content edit
- no unconfirmed target-set mutation
- no automatic rollback
- no atomic rollback claim
- no rollback across files unless explicit recovery apply path is invoked
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

- target-set transaction tests
- journal tests
- policy/preflight tests
- verification aggregation tests
- recovery workflow tests
- target-set route/result regression tests
- edit recovery apply regression tests
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
2. Current target-set transaction audit
3. Transaction model
4. Execution journal behavior
5. Preflight atomicity policy
6. Partial-failure policy
7. Verification aggregation
8. Recovery workflow handoff
9. Result Surface behavior
10. Session / Continue behavior
11. Verifier coverage
12. Validation
13. Remaining risks
14. Next route recommendation
