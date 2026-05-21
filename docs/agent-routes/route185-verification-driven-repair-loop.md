# Route 185: Verification-driven repair loop

## Goal

Build a review-gated verification-driven repair loop that connects edit apply results, verification/runtime receipts, safe failure context, context-aware provider repair proposals, and the existing proposal review/apply bridge.

Routes 180-184 established:

- edit repair proposal context
- generated/provider proposal lifecycle
- proposal review / selection / confirmation / apply bridge
- exact hunk-set apply
- targeted context packets
- Agent Plan facade
- context-aware provider edit proposal
- Session / Result parity for context, plan, proposal, repair evidence

Route 185 should connect these into a real repair loop:

- apply or verification failure produces safe repair context
- verification command result / runtime receipt feeds repair context
- context packet + agent plan + verification failure feed provider repair proposal
- repair proposal is review-required and no-write by default
- confirmed exact repair proposal reuses existing hunk-set apply
- session / continue can explain the failure and proposed repair
- verifier proves no automatic repair mutation

This route improves the agent's ability to learn from failed verification without expanding autonomous write authority.

## Expected outcome

By the end of Route 185:

1. Edit apply or verification failure can produce a structured repair-loop context.
2. Repair-loop context includes safe verification evidence and runtime receipt markers where available.
3. Repair-loop context can attach Route 181 context packet ids and Route 182 agent plan ids.
4. Context-aware provider repair proposals can be generated through fake/stub provider tests.
5. Provider repair calls stop before invocation when context, provider readiness, or verification evidence is missing.
6. Repair proposals are review-required and mutationAuthority:not-granted by default.
7. Confirmed exact repair proposals can hand off to existing proposal hunk-set apply.
8. Result Surface distinguishes verification failed, repair context created, repair proposal created, review required, repair applied, repair stopped, and repair failed.
9. Session / Continue can summarize the failed verification, repair proposal, and next safe action.
10. No automatic repair, retry loop, or provider-generated mutation is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/tool-runtime-execution-flow.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/workspace-file-context-contract.md`

Read only if touched:

- provider readiness / provider boundary docs
- session substrate seams
- result mapper extraction docs

Do not load browser docs or old route docs unless code directly points there.

## Reference scan

Use references only for verification feedback, repair loop, trajectory, runtime receipt, and review-gated patch proposal patterns.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 12 files
- gemini-cli: max 10 files
- ClaudeCode: max 8 files
- OpenHands: max 8 files
- Inspect AI: max 8 files
- mini-swe-agent: max 6 files

Focus:

- verification failure summarization
- test/run command evidence
- runtime receipt / trajectory shape
- repair proposal loop
- review-required patch proposal
- result and continuation wording
- deterministic fake-provider repair tests

Do not copy autonomous self-repair loops, hidden model retries, direct mutation, broad patch engines, or provider credential handling.

## Owner modules

Primary owners:

- Edit / Patch
- Harness / Eval
- Runtime
- Provider / Model

Collaborating owners:

- Workspace / File Context
- Agent Loop Planning
- Result Surface
- Session / Continue
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/verificationRepairLoop.ts`
- `packages/ts-shell/src/orchestration/verificationRepairContext.ts`
- `packages/ts-shell/src/orchestration/verificationRepairPlanner.ts`
- `packages/ts-shell/src/orchestration/verificationRepairResult.ts`
- `packages/ts-shell/src/orchestration/verificationRepairLoop.test.ts`
- `packages/ts-shell/src/orchestration/verificationRepairContext.test.ts`
- `packages/ts-shell/src/orchestration/verificationRepairPlanner.test.ts`
- `packages/ts-shell/src/orchestration/verificationRepairResult.test.ts`

Likely touched files:

- `editRepairContext.ts`
- `editRepairProposal.ts`
- `editRepairPlanner.ts`
- `editRepairResult.ts`
- `contextAwareProviderEdit.ts`
- `contextAwareProviderPrompt.ts`
- `contextAwareProviderProposal.ts`
- `contextAwareProviderResult.ts`
- `providerEditContext.ts`
- `providerEditPlanner.ts`
- `providerEditProposal.ts`
- `providerEditResult.ts`
- `proposalHunkSetRoute.ts`
- `proposalHunkSetResult.ts`
- `targetSetEditVerification.ts`
- `runtimeReceiptProjection.ts`
- `verificationPlanner.ts`
- `verificationResultProjection.ts`
- `resultSurfaceModule.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `verify-edit-capability-closeout.mjs`
- `verify-context-planning.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current repair-loop reachability

Before changing behavior, determine:

- how verification failures are represented after fenced / target-set / hunk-set apply
- where runtime receipts are available after verification commands
- whether repair context already includes verification/runtime evidence
- how context-aware provider proposal can be reused for repair
- whether Session / Continue can explain verification failure and repair proposal today
- what verifier currently proves about no automatic repair

Summarize in the final report.

### 2. Verification repair context

Add `verificationRepairContext.ts`.

Context should include:

- repair loop id
- source edit transaction id
- source proposal id if available
- source context packet id if available
- source agent plan id if available
- verification command safe label
- verification outcome
- runtime receipt markers
- failed file labels
- failed hunk summaries
- changed file summaries
- recovery availability summary
- budgeted stderr/stdout excerpt if already sanitized
- omitted evidence reasons
- redaction status

Must not include:

- raw full files
- unbudgeted stdout/stderr
- secrets
- provider credentials
- provider config paths
- hidden reasoning
- browser/page content

### 3. Repair-loop planner

Add `verificationRepairPlanner.ts`.

Planner states:

- `repair-loop-context-created`
- `repair-loop-missing-verification`
- `repair-loop-missing-context`
- `repair-loop-provider-not-configured`
- `repair-loop-provider-opt-in-required`
- `repair-loop-context-over-budget`
- `repair-loop-proposal-created`
- `repair-loop-proposal-invalid`
- `repair-loop-review-required`
- `repair-loop-ready-for-hunk-set-handoff`
- `repair-loop-not-needed`
- `repair-loop-unsupported`

Rules:

- no provider call unless provider availability/opt-in permits it
- fake/stub provider path for deterministic tests
- no provider call during apply
- no automatic repair apply
- invalid/non-exact repair output stops actionably

### 4. Context-aware repair provider prompt

Reuse Route 184 context-aware provider prompt builder where possible.

Repair prompt input should include:

- context packet summary
- agent plan summary
- verification failure summary
- runtime receipt markers
- changed / failed file labels
- constraints and non-goals
- verification retry expectation
- snapshot / recovery availability

Do not create a parallel provider prompt path if existing facades can be extended cleanly.

### 5. Repair proposal manifest

Reuse `editRepairProposal` / provider proposal manifest shapes where possible.

Repair proposal should include:

- repair proposal id
- source repair loop id
- source transaction id
- target scope
- per-target proposed hunks
- exact readiness
- verification retry plan
- review requirement
- confirmation state
- mutationAuthority:not-granted
- handoff readiness
- redaction status

### 6. Review and hunk-set handoff

Repair proposal must flow through existing review / selection / confirmation / hunk-set apply surfaces.

Allowed handoff:

- explicit confirmation
- exact hunks only
- existing proposal hunk-set apply
- workspace authority rechecked by write route
- final stale-read rechecked by write route
- snapshot/recovery handled by write route
- verification handled by write route

Disallowed:

- automatic repair apply
- provider-generated direct mutation
- fuzzy/broad repair apply
- hidden retry loop

### 7. Result Surface integration

Add `verificationRepairResult.ts`.

Terminal outcomes:

- verification failed, no repair context
- repair context created
- repair proposal created, no-write
- repair review required, no-write
- repair provider unavailable / opt-in required
- repair context missing / over budget
- repair proposal invalid
- repair handoff-ready
- repair applied through hunk-set
- repair apply stopped
- repair apply partial failure
- repair not needed

Output should clearly say:

- what verification failed
- what safe evidence is available
- whether provider was called
- whether proposal exists
- whether any mutation occurred
- what explicit confirmation is needed
- what verification retry is suggested

### 8. Session / Continue integration

Session / Continue should preserve:

- repair loop id
- repair context id
- repair proposal id
- source transaction id
- source context packet id
- source agent plan id
- failed verification summary
- runtime receipt marker summary
- review / confirmation state
- handoff readiness
- repair apply result if executed
- do-next text

`/continue` should be able to:

- explain why verification failed
- explain what repair context exists
- explain whether provider was called or blocked
- summarize repair proposal
- ask for explicit confirmation
- continue after repair apply success/stopped/partial failure

### 9. Verifier coverage

Strengthen edit closeout and/or context planning verifier coverage.

Required coverage:

- verification failure creates repair-loop context
- repair context includes runtime receipt markers when available
- repair context includes context packet id and agent plan id when available
- missing verification evidence stops actionably
- missing context stops before provider call
- fake provider repair proposal created no-write
- provider unavailable / opt-in states stopped
- invalid repair proposal stopped no-write
- repair review required no-write
- confirmed exact repair proposal hands off to hunk-set apply
- no automatic repair after verification failure
- repair result/session/report excludes raw content and secrets
- result-contract compatibility

### 10. Coupling guard

Do not put repair-loop logic inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- edit/verification result facts
- verification repair loop facade
- context-aware provider proposal facade
- existing review/apply bridge
- Result Surface / Session parity

No broad agent-loop rewrite.

### 11. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if repair-loop risk changes
- module backlog if route status is tracked
- future edit contract only if repair loop status materially changes

No large architecture doc.

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

- verification repair context tests
- repair loop planner tests
- repair result tests
- context-aware provider regression tests
- edit repair regression tests
- hunk-set apply regression tests
- verification failure regression tests
- runtime receipt projection tests if touched
- Result Surface tests if touched
- Session / Continue tests if touched
- edit closeout verifier if touched
- context planning verifier if touched
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run real-provider gates unless this route explicitly adds an opt-in dry-run path.

## Final report

Include:

1. What changed
2. Current repair-loop reachability audit
3. Verification repair context behavior
4. Repair-loop planner behavior
5. Context-aware repair prompt behavior
6. Repair proposal / review / handoff behavior
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Coupling guard
11. Validation
12. Remaining risks
13. Next route recommendation
