# Route 178: Proposal hunk-set apply

## Goal

Enable confirmed proposal hunk-set execution for provider/generated edit proposals, limited to per-target exact mappings.

Routes 167-177 established:

- exact fenced replacement lane
- runtime activation
- outcome taxonomy
- snapshot / explicit recovery
- discovery manifest and confirmed target-set edit
- target-set transaction journal and recovery workflow
- generated/provider proposal lifecycle
- proposal review / selection / confirmation / apply bridge

Route 177 intentionally left one major limitation:

- target-set proposal apply can use the current target-set route shape
- per-target distinct mappings remain stopped/no-write

Route 178 should close that gap.

This route owns:

- proposal hunk-set manifest
- per-target distinct exact mapping support
- all-hunk preflight before mutation
- coordinator over existing single-file fenced lane
- transaction / journal integration
- partial failure and recovery workflow
- Result Surface / Session / Continue / verifier coverage
- no broad/fuzzy/generated direct mutation

This is not a new writer. It is a proposal-aware coordinator over existing safe edit lanes.

## Expected outcome

By the end of Route 178:

1. A confirmed proposal can contain multiple targets with distinct exact old/new mappings.
2. Every selected hunk is explicit, exact, target-bound, and preflighted before mutation.
3. Non-exact, fuzzy, generated-only, or ambiguous hunks remain no-write.
4. The hunk-set route reuses existing single-file fenced replacement execution.
5. Multi-file proposal application uses target-set transaction / journal / recovery concepts.
6. Partial failure separates changed, failed, and unattempted files.
7. Every changed file has snapshot and rollback readiness.
8. Result Surface distinguishes full success, stopped preflight, partial failure, verification failure, and recovery-ready states.
9. Session / Continue can summarize hunk-set proposal apply without raw file content.
10. Verifier proves per-target distinct exact mappings work and unsupported proposal hunks do not mutate.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect Route 175-177 proposal code and Route 172-174 target-set transaction code.

Do not load browser/provider history docs unless touched code proves they are needed.

## Reference scan

Use references only for patch proposal hunk selection, per-file apply metadata, partial failure, and review/apply UX.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/source-claudecode`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 12 files
- gemini-cli: max 10 files
- ClaudeCode: max 8 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- patch / hunk proposal structure
- hunk selection and confirmation
- per-file edit permission metadata
- multi-file apply summaries
- partial failure / recovery reporting
- verifier/eval report shape

Do not copy broad patch engines, fuzzy recovery, autonomous repair loops, generated apply behavior, or hidden provider mutation.

## Owner modules

Primary owners:

- Edit / Patch
- Result Surface

Collaborating owners:

- Workspace / File Context
- Permission / Policy
- Session / Continue
- Harness / Eval
- Provider / Model only as proposal source metadata, not during apply

Likely new files:

- `packages/ts-shell/src/orchestration/proposalHunkSet.ts`
- `packages/ts-shell/src/orchestration/proposalHunkSetPlan.ts`
- `packages/ts-shell/src/orchestration/proposalHunkSetRoute.ts`
- `packages/ts-shell/src/orchestration/proposalHunkSetResult.ts`
- `packages/ts-shell/src/orchestration/proposalHunkSetRecovery.ts`
- `packages/ts-shell/src/orchestration/proposalHunkSet.test.ts`
- `packages/ts-shell/src/orchestration/proposalHunkSetPlan.test.ts`
- `packages/ts-shell/src/orchestration/proposalHunkSetRoute.test.ts`
- `packages/ts-shell/src/orchestration/proposalHunkSetResult.test.ts`

Likely touched files:

- `editProposalReview.ts`
- `editProposalSelection.ts`
- `editProposalApply.ts`
- `editProposalReviewResult.ts`
- `generatedEditProposal.ts`
- `providerEditProposal.ts`
- `targetSetEditTransaction.ts`
- `targetSetEditJournal.ts`
- `targetSetEditPolicy.ts`
- `targetSetEditVerification.ts`
- `targetSetEditRecoveryWorkflow.ts`
- `targetSetEditResult.ts`
- `fencedEditRoute.ts`
- `fencedEditResult.ts`
- `editPatchModule.ts`
- `resultSurfaceModule.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `sessionResumeContextBuilder.ts`
- `cliProposalReviewSurface.ts`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current proposal apply limitation

Before changing behavior, determine:

- how Route 177 currently represents proposal hunks
- why per-target distinct mappings stop today
- whether target-set transaction can be reused or needs a proposal-aware coordinator
- what verifier currently proves about per-target distinct mappings being no-write
- what continuation evidence exists for proposal apply and partial failure

Summarize in the final report.

### 2. Define proposal hunk-set manifest

Add `proposalHunkSet.ts`.

A hunk-set should include:

- hunk-set id
- source proposal id
- source kind: generated / provider
- selected target list
- per-target hunk list
- per-hunk exact old/new mapping status
- per-hunk target binding
- per-hunk risk / unsupported reason
- redaction status
- mutation authority: not granted until confirmed apply route preflight passes

Do not include raw full file dumps or secrets.

### 3. Hunk-set plan and guards

Add `proposalHunkSetPlan.ts`.

Plan requirements:

- explicit selected hunks
- explicit confirmed target set
- max-file guard
- max-hunk guard
- no duplicate conflicting hunks
- every hunk has exact old/new mapping
- every hunk binds to exactly one target
- every target is in workspace
- every target can be preflighted before mutation
- generated/fuzzy/non-exact hunks remain no-write

Suggested initial guards:

- max 3 files
- max 5 hunks total
- max 2 hunks per file

If current single-file lane supports only one exact replacement per file, Route 178 may either:
- apply only one exact hunk per file and stop multi-hunk-per-file as unsupported, or
- add a bounded per-file multi-hunk exact preflight/apply helper if safe.

Do not implement fuzzy multi-hunk replacement.

### 4. All-hunk preflight before mutation

Before any mutation:

- validate selected proposal id
- validate confirmation state
- validate max guards
- validate every target in workspace
- validate every hunk exact mapping
- validate every hunk match count
- validate no overlapping/conflicting hunks
- validate verification plan
- classify unsupported hunks

If any preflight fails, stop with mutation:not-run.

### 5. Execution coordinator

Add `proposalHunkSetRoute.ts`.

Execution should:

- reuse `runFencedEditReplacementRoute` where possible
- or reuse a new bounded per-file exact hunk helper if needed
- not create a second writer
- capture per-file snapshot through existing lane/substrate
- run final stale-read through existing lane/substrate
- project verification through existing lane/substrate
- collect transaction/journal facts
- separate changed/failed/unattempted files
- collect recovery readiness

No provider/model call during apply.

### 6. Multi-hunk per-file policy

Explicitly decide and implement one of these:

Option A, preferred if safer:
- one hunk per file supported in Route 178
- multiple hunks in one file stop no-write with do-next

Option B, allowed if clean:
- multiple exact non-overlapping hunks in one file supported
- all matches are preflighted before write
- replacement order is deterministic
- stale-read and snapshot still run once before file write
- verification projected after file write

Whichever option is chosen, tests and final report must be explicit.

### 7. Result Surface integration

Add `proposalHunkSetResult.ts`.

Terminal outcomes:

- hunk-set review/no-write
- hunk-set preflight stopped/no-write
- hunk-set unsupported hunks/no-write
- hunk-set full success
- hunk-set partial failure
- hunk-set verification failed
- hunk-set recovery available
- hunk-set apply failed

Output should include:

- proposal id
- hunk-set id
- changed file count
- changed hunk count
- failed file/hunk count
- unattempted file/hunk count
- verification aggregate
- recovery recommendation
- safe transaction id

No raw hunk content, full file content, or secrets.

### 8. Session / Continue integration

Session / Continue should preserve:

- proposal id
- hunk-set id
- selected targets summary
- selected hunks summary
- confirmation state
- changed/failed/unattempted summaries
- verification aggregate
- recovery availability
- do-next text

`/continue` should be able to explain:

- proposal hunk-set awaiting confirmation
- preflight stopped and why
- full success
- partial failure and recovery recommendation
- unsupported hunk reason

### 9. CLI / review surface integration

Update review surface only as needed.

CLI/print should show:

- hunk-set review summary
- confirmation-needed no-write
- unsupported hunk no-write
- applied success / partial failure summary
- raw content excluded

Do not redesign CLI.

### 10. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- provider/generated proposal with two targets and distinct exact mappings applies successfully
- per-target distinct mappings no longer stop when exact and confirmed
- unconfirmed hunk-set remains no-write
- non-exact hunk remains no-write
- conflicting/duplicate hunk remains no-write
- over max files/hunks remains no-write
- multiple hunks per file behavior is tested according to selected policy
- partial failure separates changed/failed/unattempted and recovery-ready
- no provider call during apply
- raw content excluded from result/session/report
- result-contract compatibility

### 11. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: proposal hunk-set apply status
- implementation manifest / recipes if new facades or gates are added
- foundation risk register if proposal apply risk changes
- module backlog if route status is tracked

No large new architecture doc.

## Boundaries

Hard boundaries:

- no mutation from proposal alone
- no unconfirmed apply
- no new writer
- no provider/model call during apply
- no fuzzy/broad/generated direct mutation
- no autonomous repair loop
- no workspace authority weakening
- no stale-read bypass
- no snapshot/recovery bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no browser work
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- hunk-set manifest tests
- hunk-set plan tests
- hunk-set route tests
- hunk-set result tests
- proposal review/selection/apply regression tests
- generated/provider proposal regression tests
- target-set transaction regression tests
- fenced edit regression tests
- Result Surface tests if touched
- Session / Continue tests if touched
- CLI/print focused tests if touched
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
2. Current proposal apply limitation audit
3. Hunk-set manifest behavior
4. Planning and guard behavior
5. Multi-hunk per-file policy
6. Execution coordinator behavior
7. Result Surface behavior
8. CLI / review surface behavior
9. Session / Continue behavior
10. Verifier coverage
11. Validation
12. Remaining risks
13. Next route recommendation
