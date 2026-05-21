# Route 179: Multi-hunk exact apply

## Goal

Enable exact multi-hunk-per-file apply for confirmed generated/provider proposal hunk-sets.

Route 178 closed the per-target distinct mapping gap:

- confirmed generated/provider proposal target sets can apply distinct exact mappings per target
- execution coordinates existing safe fenced lanes
- transaction/journal/recovery evidence is preserved
- non-exact, unconfirmed, over-max, duplicate/conflicting, and multi-hunk-per-file selections remain no-write

Route 179 should now close the next deterministic apply gap:

- multiple exact hunks in one file
- all-hunk preflight before mutation
- overlap/conflict detection
- deterministic replacement ordering
- one pre-write snapshot per file
- one file write per target when multiple hunks are applied
- verification aggregation
- transaction/journal/recovery integration
- Result Surface / Session / Continue / CLI / verifier coverage

This is still exact edit only. It is not fuzzy, generated direct mutation, broad refactor, provider apply, or a new writer.

## Expected outcome

By the end of Route 179:

1. A confirmed proposal can apply multiple exact hunks in the same file.
2. Every hunk must have explicit old/new mapping and exactly one match.
3. Overlapping, conflicting, duplicate, fuzzy, generated-only, or ambiguous hunks stop before mutation.
4. All hunks across all selected files are preflighted before the first write.
5. A file with multiple hunks captures one pre-write snapshot and writes once.
6. Multi-file hunk-set transaction evidence remains intact.
7. Partial failure separates changed, failed, and unattempted files/hunks.
8. Result Surface and CLI output summarize files/hunks without raw content.
9. Session / Continue can explain multi-hunk apply and recovery options.
10. Verifier proves exact multi-hunk success and no-write unsupported cases.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect Route 175-178 proposal/hunk-set code and Route 170-174 snapshot/target-set transaction code.

Do not load browser/provider history docs unless touched code proves they are needed.

## Reference scan

Use references only for exact multi-hunk patch application, hunk conflict detection, diff review, and result reporting.

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

- multi-hunk apply ordering
- exact match / stale-file protection
- hunk conflict and overlap handling
- patch preview and result summary
- transaction / trajectory reporting
- verifier/eval report shape

Do not copy broad patch engines, fuzzy recovery, generated apply loops, autonomous repair, or hidden provider mutation.

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

- `packages/ts-shell/src/orchestration/exactHunkSet.ts`
- `packages/ts-shell/src/orchestration/exactHunkApply.ts`
- `packages/ts-shell/src/orchestration/exactHunkConflict.ts`
- `packages/ts-shell/src/orchestration/exactHunkResult.ts`
- `packages/ts-shell/src/orchestration/exactHunkSet.test.ts`
- `packages/ts-shell/src/orchestration/exactHunkApply.test.ts`
- `packages/ts-shell/src/orchestration/exactHunkConflict.test.ts`
- `packages/ts-shell/src/orchestration/exactHunkResult.test.ts`

Likely touched files:

- `proposalHunkSet.ts`
- `proposalHunkSetPlan.ts`
- `proposalHunkSetRoute.ts`
- `proposalHunkSetResult.ts`
- `proposalHunkSetRecovery.ts`
- `targetSetEditTransaction.ts`
- `targetSetEditJournal.ts`
- `targetSetEditPolicy.ts`
- `targetSetEditVerification.ts`
- `targetSetEditRecoveryWorkflow.ts`
- `fencedEditRoute.ts`
- `fencedEditResult.ts`
- `editSnapshot.ts`
- `editRecoveryResult.ts`
- `editProposalApply.ts`
- `editProposalReviewResult.ts`
- `cliProposalReviewSurface.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `sessionResumeContextBuilder.ts`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current multi-hunk behavior

Before changing behavior, determine:

- how Route 178 currently detects multi-hunk-per-file
- which result marker/stopped reason it emits
- how proposal review and CLI show multi-hunk no-write states
- whether target-set transaction can represent hunk-level results
- what verifier currently proves about multi-hunk no-write behavior

Summarize in the final report.

### 2. Define exact hunk set model

Add `exactHunkSet.ts`.

Each hunk must include:

- hunk id
- source proposal id
- target path label
- exact old text hash / summary
- exact new text hash / summary
- match count
- target binding
- order key
- redaction status
- unsupported reason when not exact

No raw full file dumps. Avoid raw hunk content in terminal/session/report unless an existing safe review surface already permits a compact preview.

### 3. Conflict and overlap detection

Add `exactHunkConflict.ts`.

Detect before mutation:

- duplicate hunks
- overlapping old ranges
- conflicting replacements
- ambiguous match counts
- order-dependent conflicts
- multiple identical old snippets when not uniquely anchored
- hunks that become invalid after earlier hunks

If any selected hunk conflicts, stop before mutation.

### 4. Multi-hunk preflight

Update `proposalHunkSetPlan.ts` or add a helper to preflight all selected hunks.

Preflight must validate:

- explicit confirmation
- max-file guard
- max-hunk guard
- max-hunks-per-file guard
- every target in workspace
- every hunk exact old/new
- every hunk exactly one match in current file
- no conflicts / overlaps
- verification plan present
- snapshot requirement present

If any preflight fails, no file is mutated.

Suggested initial guard:

- max 3 files
- max 6 hunks total
- max 3 hunks per file

### 5. Per-file multi-hunk apply

Add `exactHunkApply.ts`.

For each file:

- run workspace authority through existing path
- run final stale-read before write
- capture one pre-write snapshot
- apply all exact hunks in deterministic order
- write once
- run verification projection
- emit per-file hunk result and recovery state

Important:

- do not create a broad patch writer
- do not apply fuzzy hunks
- do not call provider during apply
- do not bypass existing authority / stale-read / snapshot semantics

### 6. Route coordinator integration

Update `proposalHunkSetRoute.ts`.

Behavior:

- if one hunk per file, existing Route 178 behavior remains valid
- if multiple exact hunks in one file, use multi-hunk exact apply helper
- if any hunk is non-exact/conflicting, stop before mutation
- preserve transaction id, journal, verification aggregate, and recovery workflow
- separate changed, failed, and unattempted files/hunks

### 7. Result Surface integration

Add or update `exactHunkResult.ts` and `proposalHunkSetResult.ts`.

Terminal outcomes:

- multi-hunk full success
- multi-hunk preflight stopped/no-write
- multi-hunk conflict stopped/no-write
- multi-hunk partial failure
- multi-hunk verification failed
- multi-hunk recovery available
- unsupported fuzzy/generated hunk no-write

Output should show:

- changed file count
- changed hunk count
- failed hunk count
- unattempted hunk count
- verification aggregate
- recovery recommendation
- safe transaction id

No raw full file content, secrets, or provider config.

### 8. Session / Continue integration

Session / Continue should preserve:

- proposal id
- hunk-set id
- transaction id
- per-file hunk counts
- changed/failed/unattempted summary
- conflict reason when stopped
- verification aggregate
- recovery availability
- do-next text

`/continue` should explain:

- why a multi-hunk selection stopped
- what was applied
- which hunks/files failed
- what recovery is available
- what exact confirmation or conflict resolution is needed

### 9. CLI / review surface integration

Update CLI proposal review/apply surfaces only as needed.

CLI / print should show:

- multi-hunk review summary
- confirmation-required no-write
- conflict/overlap no-write
- full success summary
- partial failure summary
- recovery recommendation
- raw content excluded

Do not redesign CLI.

### 10. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- two exact hunks in one file apply successfully
- multi-file hunk-set with one file having multiple hunks succeeds
- duplicate hunk stopped/no-write
- overlapping hunk stopped/no-write
- ambiguous match count stopped/no-write
- non-exact hunk stopped/no-write
- over max hunks stopped/no-write
- partial failure separates file/hunk counts and recovery readiness
- no provider call during apply
- raw content excluded from result/session/report
- result-contract compatibility

### 11. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: exact multi-hunk apply status
- implementation manifest / recipes if new facades or gates are added
- foundation risk register if multi-hunk risk changes
- module backlog if route status is tracked

No large new architecture doc.

## Boundaries

Hard boundaries:

- no mutation from proposal alone
- no unconfirmed apply
- no new broad writer
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

- exact hunk set tests
- exact hunk conflict tests
- exact hunk apply tests
- hunk-set route/result regression tests
- proposal review/selection/apply regression tests
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
2. Current multi-hunk behavior audit
3. Exact hunk set model
4. Conflict / overlap detection
5. Preflight behavior
6. Apply behavior
7. Route coordinator behavior
8. Result Surface behavior
9. CLI / review surface behavior
10. Session / Continue behavior
11. Verifier coverage
12. Validation
13. Remaining risks
14. Next route recommendation
