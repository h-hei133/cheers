# Route 184: Context-aware provider proposal

## Goal

Use targeted context packets and Agent Plan evidence to improve provider-backed edit proposals without granting mutation authority.

Routes 181-183 established:

- deterministic targeted context packets
- context discovery and budget/redaction
- Agent Plan facade with confidence, missing facts, suggested reads, and readiness
- Result Surface / Session / Continue parity for context and plan evidence

Route 176 established provider-backed edit proposals, but those proposals are still not fully context-aware.

Route 184 should connect these systems:

- context packet -> agent plan -> provider edit context
- safer, richer provider proposal input
- missing-context stop before provider call
- proposal confidence and readiness tied to context completeness
- fake-provider deterministic tests
- no-write proposal result surface
- continuation-safe proposal and context evidence
- verifier coverage proving provider proposal uses context facts safely

This route improves model-assisted planning quality, not edit execution power.

## Expected outcome

By the end of Route 184:

1. Provider edit proposal generation can consume a targeted context packet.
2. Provider edit proposal generation can consume Agent Plan readiness, confidence, missing facts, suggested reads, and verification candidates.
3. Provider proposal calls stop before provider invocation when context is missing or over budget.
4. Provider edit context packets include only budgeted, redacted, explicit context.
5. Provider proposal manifests record context packet ids and plan ids.
6. Result Surface distinguishes context-ready proposal, context-missing stopped proposal, provider unavailable, invalid provider output, and review-required proposal.
7. Session / Continue can explain which context and plan facts were used to create the proposal.
8. Deterministic fake-provider tests cover context-aware proposal generation.
9. No real-provider call is made by default.
10. No mutation is performed from provider proposal alone.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/cross-capability-result-flow.md`

Read only if touched:

- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- provider readiness / provider boundary docs

Do not read browser history docs or old route docs unless code points there.

## Reference scan

Use references only for context-aware proposal, model edit planning, context budgeting, and review-gated proposal patterns.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 12 files
- gemini-cli: max 10 files
- OpenHands: max 8 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- file/context packets for model calls
- provider prompt/context construction boundaries
- diff / patch proposal shape
- missing-context stop behavior
- review-required proposal UX
- fake-provider deterministic tests
- no-write proposal evidence

Do not copy autonomous edit loops, hidden chain-of-thought persistence, broad agent repair loops, or automatic apply behavior.

## Owner modules

Primary owners:

- Provider / Model
- Workspace / File Context
- Agent Loop Planning
- Edit / Patch proposal layer

Collaborating owners:

- Result Surface
- Session / Continue
- Harness / Eval
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/contextAwareProviderEdit.ts`
- `packages/ts-shell/src/orchestration/contextAwareProviderPrompt.ts`
- `packages/ts-shell/src/orchestration/contextAwareProviderProposal.ts`
- `packages/ts-shell/src/orchestration/contextAwareProviderResult.ts`
- `packages/ts-shell/src/orchestration/contextAwareProviderEdit.test.ts`
- `packages/ts-shell/src/orchestration/contextAwareProviderPrompt.test.ts`
- `packages/ts-shell/src/orchestration/contextAwareProviderProposal.test.ts`
- `packages/ts-shell/src/orchestration/contextAwareProviderResult.test.ts`

Likely touched files:

- `providerEditContext.ts`
- `providerEditPlanner.ts`
- `providerEditProposal.ts`
- `providerEditResult.ts`
- `providerEditConfirmation.ts`
- `contextPacket.ts`
- `contextPlan.ts`
- `agentPlan.ts`
- `agentPlanContext.ts`
- `agentPlanProjection.ts`
- `generatedEditProposal.ts`
- `editProposalReview.ts`
- `editProposalApply.ts`
- `editPatchModule.ts`
- `providerModule.ts`
- `providerReadiness.ts`
- `providerOutcomeProjection.ts`
- `resultSurfaceModule.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `verify-context-planning.mjs`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current provider proposal context

Before changing behavior, determine:

- what provider edit proposal currently consumes
- whether context packet ids are available to provider proposal code
- whether Agent Plan ids/readiness are available
- where provider unavailable / opt-in / not-configured states are handled
- how fake-provider proposal tests work today
- how proposal context is redacted and budgeted today
- how Session / Continue currently summarizes provider proposal states

Summarize in the final report.

### 2. Context-aware provider edit input

Add `contextAwareProviderEdit.ts`.

Input should include:

- request id
- target summary
- context packet id
- agent plan id
- context completeness
- plan confidence
- missing facts
- suggested reads
- suggested verification
- target labels
- proposal mode
- provider readiness state
- redaction status

Rules:

- if context is missing and required, stop before provider call
- if context packet is budget-limited, include omitted reasons
- if Agent Plan says needs-more-context, stop unless route explicitly allows review-only proposal with missing-context warning
- no mutation authority is granted

### 3. Provider prompt/context builder

Add `contextAwareProviderPrompt.ts`.

Build a safe provider-facing context packet:

- budgeted target summaries
- budgeted related context summaries
- selected import/test/docs/call-site summaries
- user request
- constraints and non-goals
- verification expectation
- exact mapping facts when present
- omitted-content reasons

Must not include:

- full unbounded file dumps
- secrets
- provider credentials
- raw provider config paths
- hidden reasoning
- browser/page content
- unrelated workspace files

### 4. Context-aware proposal generation

Add `contextAwareProviderProposal.ts`.

Normalize fake/provider output into existing proposal manifest shape.

Proposal should record:

- proposal id
- provider safe label
- context packet id
- agent plan id
- target scope
- proposed hunks / summaries
- exact readiness
- context confidence
- risk notes
- verification plan
- review requirement
- mutation authority: `not-granted`
- handoff readiness
- redaction status

Invalid outputs should stop actionably.

### 5. Missing-context stop behavior

When context is insufficient:

- do not call provider
- emit stopped result with missing facts
- show suggested reads
- preserve context packet / agent plan evidence
- do not mutate
- do not fall back to vague generated proposal

### 6. Provider availability and opt-in

Preserve existing provider readiness boundaries:

- provider not configured -> stopped/actionable
- provider opt-in required -> stopped/actionable
- provider unsupported -> stopped/actionable
- fake-provider path for deterministic tests
- real-provider gate only if explicitly opt-in and isolated

Do not read private provider config manually.

### 7. Result Surface integration

Add `contextAwareProviderResult.ts`.

Terminal outcomes:

- context-ready provider proposal created, no-write
- context-missing stopped, no provider call
- context-over-budget stopped
- provider not configured / opt-in required
- provider invalid proposal
- review-required proposal
- handoff-ready exact proposal
- unsupported broad/fuzzy provider output

No proposal-only result may appear as write success.

### 8. Session / Continue integration

Session / Continue should preserve:

- context packet id
- agent plan id
- provider proposal id
- context readiness
- missing facts
- suggested reads
- review requirement
- handoff readiness
- do-next text

Do not preserve raw full file content, provider credentials, hidden reasoning, or unredacted diagnostics.

`/continue` should be able to explain:

- why provider was not called
- what context is missing
- what suggested reads are needed
- what proposal was created
- whether proposal is review-required or handoff-ready

### 9. Verifier coverage

Strengthen context-planning and edit closeout verifier coverage.

Required coverage:

- context packet feeds provider proposal input
- Agent Plan feeds provider proposal input
- missing context stops before fake/provider call
- over-budget context stops or records omitted reasons
- fake provider creates context-aware proposal no-write
- provider unavailable / opt-in states remain stopped
- invalid provider output stops no-write
- proposal evidence contains context packet id and agent plan id
- Session / Continue preserves context-aware provider proposal summary
- raw content/provider secrets excluded
- result-contract compatibility

Do not run real-provider gates by default.

### 10. Coupling guard

Ensure context-aware provider proposal is not implemented inline in `runMvpIntegratedFlow.ts`.

The desired flow is:

- runMvp composition
- agentPlan/context packet facts
- context-aware provider proposal facade
- Result Surface / Session parity

No large branch-specific provider planning code in runMvp.

### 11. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if provider proposal context risk changes
- module backlog if route status is tracked
- future edit contract only if provider proposal status changes materially

No large architecture doc.

## Boundaries

Hard boundaries:

- no default real-provider calls
- no manual private provider config reads
- no mutation from provider proposal
- no unconfirmed apply
- no provider call during apply
- no autonomous repair loop
- no fuzzy/broad/generated direct mutation
- no workspace authority weakening
- no stale-read bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no browser work
- no LSP / embedding / full-repo semantic index
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- context-aware provider input tests
- provider prompt/context builder tests
- provider proposal tests
- provider result tests
- Route 181 context packet regression tests
- Route 182 agent plan regression tests
- provider edit proposal regression tests
- generated/proposal review regression tests if touched
- Session / Continue tests if touched
- Result Surface tests if touched
- context-planning verifier
- edit closeout verifier if edit proposal files are touched
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
2. Current provider proposal context audit
3. Context-aware provider input behavior
4. Provider prompt/context builder behavior
5. Proposal normalization behavior
6. Missing-context stop behavior
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Coupling guard
11. Validation
12. Remaining risks
13. Next route recommendation
