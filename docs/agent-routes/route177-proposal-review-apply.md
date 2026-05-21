# Route 177: Proposal review and apply

## Goal

Turn generated/provider edit proposals into a reviewable, confirmable, and safely applicable workflow.

Routes 167-176 established:

- exact fenced replacement
- runtime activation
- outcome taxonomy
- snapshot / explicit recovery
- discovery manifest and target-set execution
- target-set transaction journal and recovery workflow
- generated edit proposal lifecycle
- provider-backed proposal generation with no-write default

Route 177 should now close the proposal workflow:

- proposal review surface
- hunk / target selection model
- confirmation state machine
- exact apply bridge into existing safe edit lanes
- CLI / print user-facing review output
- Result Surface / Session / Continue / verifier coverage
- no mutation from proposal alone

This route should make proposals operational without weakening mutation authority.

## Expected outcome

By the end of Route 177:

1. Generated/provider proposals can be rendered as compact, reviewable summaries.
2. Users can confirm, reject, or narrow a proposal target/hunk selection.
3. Confirmed exact single-target proposals apply through existing fenced replacement lane.
4. Confirmed exact target-set proposals apply through existing target-set transaction lane.
5. Unsupported or non-exact proposal hunks remain review-only/no-write.
6. CLI / print path can show proposal review and confirmation-needed output.
7. Result Surface distinguishes proposal-created, review-required, confirmed-applied, rejected, partial-applied, and unsupported proposal states.
8. Session / Continue can explain prior proposals and continue from review-required states.
9. Verifier proves no mutation occurs before explicit confirmation.
10. No provider call, proposal, or review state grants write authority by itself.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect Route 175/176 generated/provider proposal code and Route 167-174 edit apply paths.

Do not load browser/history docs unless touched code proves they are needed.

## Reference scan

Use references only for review, confirmation, patch preview, hunk selection, and apply UX.

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

- diff / patch preview
- review and confirmation state
- hunk / target selection
- apply permission metadata
- no-write preview surfaces
- terminal result wording
- verifier/eval report shape

Do not copy autonomous apply loops, fuzzy patch recovery, hidden provider mutation, or broad refactor agents.

## Owner modules

Primary owners:

- Edit / Patch
- CLI / UX for user-facing review path
- Result Surface

Collaborating owners:

- Provider / Model
- Workspace / File Context
- Permission / Policy
- Session / Continue
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/orchestration/editProposalReview.ts`
- `packages/ts-shell/src/orchestration/editProposalSelection.ts`
- `packages/ts-shell/src/orchestration/editProposalApply.ts`
- `packages/ts-shell/src/orchestration/editProposalReviewResult.ts`
- `packages/ts-shell/src/orchestration/editProposalReview.test.ts`
- `packages/ts-shell/src/orchestration/editProposalSelection.test.ts`
- `packages/ts-shell/src/orchestration/editProposalApply.test.ts`
- `packages/ts-shell/src/orchestration/editProposalReviewResult.test.ts`

Likely touched files:

- `generatedEditProposal.ts`
- `generatedEditConfirmation.ts`
- `generatedEditResult.ts`
- `providerEditProposal.ts`
- `providerEditConfirmation.ts`
- `providerEditResult.ts`
- `fencedEditRoute.ts`
- `targetSetEditRoute.ts`
- `targetSetEditTransaction.ts`
- `editPatchModule.ts`
- `resultSurfaceModule.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `sessionResumeContextBuilder.ts`
- `cliRuntimeInvocation.test.ts`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if proposal activation requires it.

## Implementation tasks

### 1. Audit current proposal reachability

Before changing behavior, determine:

- how generated/provider proposal manifests are currently surfaced
- whether CLI/print can show review-required output
- whether any confirmation path exists
- whether exact handoff-ready proposals can currently apply
- what verifier proves about no-write proposal states

Summarize this audit in the final report.

### 2. Proposal review model

Add `editProposalReview.ts`.

Review model should include:

- proposal id
- source: generated / provider
- target scope: single / target-set / unknown
- target labels
- proposed operation summaries
- hunk summaries
- exact mapping readiness
- unsupported hunk reasons
- risk notes
- verification expectation
- snapshot / recovery expectation
- redaction status
- review status

Review output must not include:

- full raw file dumps
- secrets
- provider credentials/config paths
- hidden reasoning
- unrelated workspace context

### 3. Selection model

Add `editProposalSelection.ts`.

Support:

- select all exact hunks
- select one target
- select subset of target-set hunks
- reject proposal
- request more information / keep review-only
- invalid selection

Rules:

- selection is not write authority
- non-exact hunk selection cannot apply
- target-set selection must satisfy max-file and exact mapping guards
- selection must preserve source proposal id and safe target labels

### 4. Confirmation state machine

Unify generated/provider confirmation behavior where possible.

States:

- `review-required`
- `selection-required`
- `rejected`
- `confirmed-review-only`
- `confirmed-exact-single-target`
- `confirmed-exact-target-set`
- `invalid-selection`
- `unsupported-for-apply`

Confirmation must be explicit. Prompt wording alone must not apply edits.

### 5. Apply bridge

Add `editProposalApply.ts`.

Allowed apply paths:

- confirmed exact single-target -> existing fenced replacement route
- confirmed exact target-set -> existing target-set transaction route

Preconditions:

- proposal id exists
- selected hunks are exact old/new mappings
- explicit confirmation exists
- workspace authority is rechecked by write route
- final stale-read is rechecked by write route
- snapshot/recovery is handled by write route
- verification is handled by write route

Do not create a new writer.

### 6. Result Surface integration

Add `editProposalReviewResult.ts`.

Terminal outcomes:

- proposal review created, no-write
- review required, no-write
- proposal rejected, no-write
- invalid selection, no-write
- unsupported for apply, no-write
- confirmed single-target applied
- confirmed target-set applied
- apply stopped by existing write route
- apply partial failure from target-set route

No proposal-only or review-only state may appear as write success.

### 7. CLI / print path

Add focused CLI/print coverage.

Required user-facing outputs:

- proposal created / review required
- rejected proposal no-write
- confirmed single-target apply success
- confirmed target-set apply success or partial failure
- unsupported hunk selection no-write
- raw content excluded

Do not redesign CLI. Use existing command/prompt routing where possible.

### 8. Session / Continue integration

Session / Continue should preserve:

- proposal id
- review status
- selected targets / hunks summary
- confirmation state
- apply result if executed
- do-next text
- verification and recovery summary if applied

`/continue` should be able to:

- summarize a proposal awaiting review
- explain what confirmation is needed
- continue after rejection
- continue after apply success/stopped/partial failure
- avoid raw diff/file content

### 9. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- proposal review no-write
- proposal reject no-write
- selection required no-write
- invalid selection no-write
- non-exact hunk no-write
- confirmed exact single-target apply reaches fenced route
- confirmed exact target-set apply reaches target-set transaction route
- apply stopped still preserves proposal evidence
- partial failure preserves proposal and transaction evidence
- raw proposal/full file content excluded
- result-contract compatibility

### 10. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: proposal review/apply bridge status
- implementation manifest / recipes if new facades or validation gates are added
- foundation risk register if proposal apply risk changes
- module backlog if route status is tracked

No large new architecture doc.

## Boundaries

Hard boundaries:

- no mutation from proposal alone
- no unconfirmed apply
- no new writer
- no fuzzy/broad/generated direct mutation
- no autonomous provider apply loop
- no provider/model call during apply
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

- proposal review tests
- selection tests
- confirmation tests
- apply bridge tests
- generated/provider proposal regression tests
- fenced/target-set apply regression tests
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
2. Current proposal reachability audit
3. Review model behavior
4. Selection and confirmation behavior
5. Apply bridge behavior
6. Result Surface behavior
7. CLI / print behavior
8. Session / Continue behavior
9. Verifier coverage
10. Validation
11. Remaining risks
12. Next route recommendation
