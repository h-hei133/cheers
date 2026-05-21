# Route 180: Verification repair proposal

## Goal

Add verification-driven repair proposal generation after edit apply or verification failure, without automatic repair mutation.

Routes 167-179 established:

- exact fenced replacement
- runtime activation
- outcome taxonomy
- snapshot / explicit recovery
- discovery manifest and confirmed target-set execution
- target-set transaction journal and recovery workflow
- generated/provider proposal lifecycle
- proposal review / selection / confirmation / apply bridge
- per-target distinct exact hunk-set apply
- exact multi-hunk-per-file apply

Route 180 should close the next loop:

- collect safe failure context from edit apply / verification
- produce a repair proposal manifest
- optionally use fake/stub provider proposal path for deterministic tests
- classify repair readiness
- review / confirm repair proposal
- hand off exact repair hunks to existing hunk-set apply
- preserve transaction / recovery / verifier evidence
- no automatic repair apply

This route should make the system capable of proposing a next edit after verification failure, while keeping mutation explicit and review-gated.

## Expected outcome

By the end of Route 180:

1. Failed edit application or failed verification can produce a safe repair context.
2. Repair context excludes raw full files, secrets, provider credentials, and unsafe dumps.
3. A repair proposal manifest can be generated from failure context.
4. Deterministic fake-provider repair proposal tests prove the flow without real-provider calls.
5. Provider unavailable / opt-in / invalid repair states stop actionably.
6. Repair proposals are review-required and no-write by default.
7. Confirmed exact repair proposals can reuse Route 178/179 hunk-set apply.
8. Result Surface distinguishes repair-proposal-created, repair-review-required, repair-applied, repair-stopped, and repair-failed states.
9. Session / Continue can explain verification failure and available repair proposal.
10. Verifier coverage proves no automatic repair mutation and no raw-content leakage.

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

Then inspect Route 175-179 proposal / hunk-set / verification / recovery code.

Read provider docs only if touching provider readiness or auth behavior. Do not load browser history docs.

## Reference scan

Use references only for repair proposal, verification feedback, failure trajectory, and review-gated apply patterns.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/inspect_ai`

Secondary:

- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 12 files
- gemini-cli: max 10 files
- ClaudeCode: max 8 files
- Inspect AI: max 8 files
- mini-swe-agent: max 6 files

Focus:

- verification failure summarization
- repair proposal / retry loop shape
- failed edit trajectory
- patch proposal review
- scorer / report fields
- user-facing recovery wording

Do not copy autonomous repair loops, hidden model retries, direct mutation, broad patch engines, or provider credential handling.

## Owner modules

Primary owners:

- Edit / Patch
- Result Surface
- Harness / Eval

Collaborating owners:

- Provider / Model
- Workspace / File Context
- Runtime
- Session / Continue
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/editRepairContext.ts`
- `packages/ts-shell/src/orchestration/editRepairProposal.ts`
- `packages/ts-shell/src/orchestration/editRepairPlanner.ts`
- `packages/ts-shell/src/orchestration/editRepairResult.ts`
- `packages/ts-shell/src/orchestration/editRepairContext.test.ts`
- `packages/ts-shell/src/orchestration/editRepairProposal.test.ts`
- `packages/ts-shell/src/orchestration/editRepairPlanner.test.ts`
- `packages/ts-shell/src/orchestration/editRepairResult.test.ts`

Likely touched files:

- `targetSetEditVerification.ts`
- `targetSetEditTransaction.ts`
- `targetSetEditResult.ts`
- `targetSetEditRecoveryWorkflow.ts`
- `proposalHunkSetRoute.ts`
- `proposalHunkSetResult.ts`
- `exactHunkApply.ts`
- `exactHunkResult.ts`
- `providerEditContext.ts`
- `providerEditProposal.ts`
- `providerEditPlanner.ts`
- `providerEditResult.ts`
- `editProposalReview.ts`
- `editProposalApply.ts`
- `editProposalReviewResult.ts`
- `editPatchModule.ts`
- `resultSurfaceModule.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `sessionResumeContextBuilder.ts`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current verification failure handling

Before changing behavior, determine:

- how failed verification is represented after fenced / target-set / hunk-set apply
- what failure facts are safe and already available
- whether verification stdout/stderr is budgeted and redacted
- whether Session / Continue can explain verification failure today
- whether any repair proposal or retry path already exists
- what verifier currently proves about failed verification and no auto-repair

Summarize in the final report.

### 2. Safe repair context

Add `editRepairContext.ts`.

Repair context should include:

- repair context id
- source transaction id
- source proposal id if available
- failed verification summary
- failed file labels
- changed file labels
- failed hunk summaries
- runtime receipt markers if available
- verification command safe label
- budgeted failure excerpt or reason
- snapshot / rollback availability summary
- redaction status
- omitted content reasons

Must not include:

- raw full files
- raw secrets
- unbudgeted stdout/stderr
- provider credentials
- provider config paths
- hidden reasoning
- browser/page content

### 3. Repair proposal manifest

Add `editRepairProposal.ts`.

Proposal manifest should include:

- repair proposal id
- source repair context id
- proposed target scope
- per-target proposed hunks
- exact mapping readiness
- confidence / risk summary
- verification retry plan
- review requirement
- confirmation state
- mutation authority: `not-granted`
- handoff readiness
- redaction status

Repair proposal must be no-write by default.

### 4. Repair planner

Add `editRepairPlanner.ts`.

Planner states:

- `repair-context-created`
- `repair-provider-not-configured`
- `repair-provider-opt-in-required`
- `repair-context-over-budget`
- `repair-proposal-created`
- `repair-proposal-invalid`
- `repair-review-required`
- `repair-ready-for-hunk-set-handoff`
- `repair-unsupported`
- `repair-not-needed`

Rules:

- deterministic tests use fake/stub provider repair proposal
- real-provider calls remain opt-in and isolated
- no provider call during apply
- no automatic repair apply
- invalid / non-exact repair output stops actionably

### 5. Review / confirmation reuse

Reuse existing proposal review / selection / confirmation where possible.

Repair proposal should behave like a provider/generated proposal:

- review required
- explicit selection required
- exact hunk-set handoff only when confirmed
- non-exact repair hunks remain no-write
- broad/fuzzy/generated repair remains stopped/no-write

Do not create a parallel review system.

### 6. Hunk-set apply handoff

Confirmed exact repair proposals should hand off to existing Route 178/179 hunk-set apply.

Preconditions still apply:

- explicit confirmation
- exact hunks
- workspace authority
- final stale-read
- snapshot/recovery
- verification
- Result Surface truthfulness

Do not create a repair writer.

### 7. Result Surface integration

Add `editRepairResult.ts`.

Terminal outcomes:

- repair context created
- repair proposal created, no-write
- repair review required, no-write
- repair proposal invalid, no-write
- repair ready for handoff, no-write until confirmed
- repair applied through hunk-set
- repair apply stopped
- repair apply partial failure
- repair not needed
- repair unsupported

Output should clearly say:

- original verification failed
- what safe failure summary is available
- whether a repair proposal exists
- whether any write occurred
- what confirmation is needed
- what verification retry is planned

No raw full content or secrets.

### 8. Session / Continue integration

Session / Continue should preserve:

- repair context id
- repair proposal id
- source transaction id
- failed verification summary
- review / confirmation state
- handoff readiness
- repair apply result if executed
- do-next text

`/continue` should be able to:

- explain why verification failed
- summarize repair proposal
- ask for explicit confirmation
- continue after repair apply success/stopped/partial failure
- preserve recovery guidance

### 9. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- verification failure creates safe repair context
- repair context excludes raw full file/stdout/secrets
- fake-provider repair proposal created no-write
- provider unavailable / opt-in states stop actionably
- invalid repair proposal stops no-write
- repair review required no-write
- confirmed exact repair proposal hands off to hunk-set apply
- no automatic repair after verification failure
- repair apply retains transaction/recovery evidence
- result-contract compatibility

### 10. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: repair proposal status
- implementation manifest / recipes if new facades or gates are added
- foundation risk register if repair loop risk changes
- module backlog if route status is tracked

No large new architecture doc.

## Boundaries

Hard boundaries:

- no automatic repair mutation
- no mutation from repair proposal alone
- no provider/model call during apply
- no default real-provider call
- no manual private provider config reads
- no autonomous retry loop
- no fuzzy/broad/generated direct mutation
- no new writer
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

- repair context tests
- repair proposal tests
- repair planner tests
- repair result tests
- provider proposal regression tests
- proposal review/apply regression tests
- hunk-set apply regression tests
- verification failure regression tests
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
2. Current verification failure audit
3. Repair context behavior
4. Repair proposal behavior
5. Planner behavior
6. Review / confirmation reuse
7. Hunk-set handoff behavior
8. Result Surface behavior
9. Session / Continue behavior
10. Verifier coverage
11. Validation
12. Remaining risks
13. Next route recommendation
