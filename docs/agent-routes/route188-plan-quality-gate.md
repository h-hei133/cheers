# Route 188: Plan quality gate

## Goal

Add a deterministic plan quality gate that decides whether the agent has enough context and planning evidence to proceed to provider proposal, verification, or edit apply.

Routes 181-187 established:

- targeted context packets
- bounded context graph
- test-impact planning
- Agent Plan facade
- context-aware provider proposal
- command-driven verification repair loop
- Result Surface / Session / Continue parity

The current gap is no longer "can we gather context?" but "can we judge whether the gathered context is enough?"

Route 188 should introduce a plan quality gate that scores and explains:

- context completeness
- target confidence
- graph coverage
- test-impact confidence
- verification readiness
- provider proposal readiness
- edit/apply readiness
- missing facts
- suggested next reads
- stop-before-provider / stop-before-mutation decisions

This route improves planning precision and prevents low-quality proposals or unsafe execution from context-poor states.

## Expected outcome

By the end of Route 188:

1. Agent Plan can carry deterministic quality scores.
2. Context packet and context graph facts feed plan quality.
3. Test-impact and verification candidates influence readiness.
4. Provider proposal generation can be blocked by low plan quality before provider call.
5. Edit/proposal apply can be blocked by missing plan facts before mutation.
6. Result Surface explains plan quality stops with missing facts and suggested next reads.
7. Session / Continue can preserve plan quality evidence.
8. Verifier coverage proves quality-gated decisions, no-write stops, and no raw content leakage.
9. No new mutation behavior, provider call behavior, or command execution behavior is introduced.

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
- `docs/architecture/session-substrate-seams.md`

Do not read browser docs, old route docs, or edit expansion docs unless code directly requires them.

## Reference scan

Use references only for planning quality, task readiness, scoring, context sufficiency, and evaluation/reporting patterns.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/inspect_ai`

Secondary:

- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- gemini-cli: max 8 files
- OpenHands: max 8 files
- Inspect AI: max 8 files
- mini-swe-agent: max 4 files

Focus:

- task readiness / plan quality
- context sufficiency checks
- scorer / evaluator result shape
- missing-context UX
- verification readiness
- trajectory/report evidence
- stop-before-action boundaries

Do not copy autonomous planners, hidden chain-of-thought storage, model-based scoring, broad agent loops, or automatic execution behavior.

## Owner modules

Primary owners:

- Agent Loop Planning
- Workspace / File Context
- Result Surface

Collaborating owners:

- Provider / Model
- Runtime / Verification
- Session / Continue
- Harness / Eval
- Edit / Patch as consumer only

Likely new files:

- `packages/ts-shell/src/orchestration/planQuality.ts`
- `packages/ts-shell/src/orchestration/planQualityScore.ts`
- `packages/ts-shell/src/orchestration/planQualityGate.ts`
- `packages/ts-shell/src/orchestration/planQualityResult.ts`
- `packages/ts-shell/src/orchestration/planQuality.test.ts`
- `packages/ts-shell/src/orchestration/planQualityScore.test.ts`
- `packages/ts-shell/src/orchestration/planQualityGate.test.ts`
- `packages/ts-shell/src/orchestration/planQualityResult.test.ts`

Likely touched files:

- `agentPlan.ts`
- `agentPlanContext.ts`
- `agentPlanProjection.ts`
- `agentPlanResult.ts`
- `contextPacket.ts`
- `contextPlan.ts`
- `contextGraph.ts`
- `contextGraphScore.ts`
- `contextGraphPlanning.ts`
- `testImpactPlan.ts`
- `contextAwareProviderEdit.ts`
- `contextAwareProviderResult.ts`
- `verificationCommandPlan.ts`
- `verificationRepairPlanner.ts`
- `resultSurfaceModule.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current plan quality behavior

Before changing behavior, determine:

- where plan confidence is currently assigned
- how context packet readiness is represented
- how context graph score is represented
- how test-impact confidence is represented
- how provider proposal decides context is enough
- how verification command planning decides readiness
- how missing-context stops appear in terminal / continue
- what verifier already covers

Summarize this audit in the final report.

### 2. Define plan quality model

Add `planQuality.ts`.

The model should include:

- quality id
- source agent plan id
- context packet id if available
- context graph id if available
- test-impact plan id if available
- target confidence
- context completeness
- graph coverage
- test coverage
- verification readiness
- provider proposal readiness
- edit/apply readiness
- missing facts
- suggested reads
- suggested verification
- redaction status
- mutationAuthority: `not-granted`

No raw file content.

### 3. Quality scoring

Add `planQualityScore.ts`.

Use deterministic scoring only.

Score dimensions:

- target confidence
- context completeness
- import/call-site coverage
- test-impact coverage
- docs coverage
- omitted-risk
- verification readiness
- provider readiness
- apply readiness

Score levels:

- `ready`
- `needs-more-context`
- `budget-limited`
- `low-confidence`
- `blocked`
- `unsupported`

Do not use provider/model judgment to score.

### 4. Quality gate

Add `planQualityGate.ts`.

Gate decisions:

- `allow-read`
- `allow-provider-proposal`
- `allow-verification-command-plan`
- `allow-review-only-proposal`
- `stop-needs-more-context`
- `stop-budget-limited`
- `stop-low-confidence`
- `stop-missing-target`
- `stop-missing-verification`
- `stop-unsupported`

Rules:

- low context quality blocks provider proposal unless explicitly review-only and no-write
- missing verification blocks command execution readiness
- missing target blocks edit/proposal apply readiness
- quality gate never grants mutation authority
- write routes must still re-check their own preconditions

### 5. Result Surface integration

Add `planQualityResult.ts`.

Terminal outcomes:

- plan quality ready
- plan needs more context
- plan budget limited
- plan low confidence
- provider proposal blocked by plan quality
- verification command blocked by plan quality
- apply blocked by missing plan facts
- suggested reads available
- suggested verification available

Output should show:

- readiness level
- missing facts
- suggested reads
- suggested verification
- no-write status
- evidence ids

No raw content dumps.

### 6. Agent Plan integration

Agent Plan should consume plan quality.

Update Agent Plan projection so it can expose:

- quality id
- readiness
- score summary
- missing facts
- suggested reads
- suggested verification
- next recommended action

Do not move broad planning into runMvp.

### 7. Provider proposal integration

Update context-aware provider proposal path:

- use plan quality before provider call
- stop before provider when quality is low / missing context
- allow review-only no-write proposal only when explicitly safe
- attach quality id to proposal manifest
- preserve fake-provider deterministic tests

No real-provider default call.

### 8. Verification command integration

Update verification command planning:

- use plan quality and test-impact readiness
- mark command not-ready when plan lacks verification facts
- keep allowlist boundary unchanged
- attach quality id to command plan / result

No command execution behavior changes.

### 9. Edit/proposal apply integration

Do not expand edit apply behavior.

Only add quality evidence where appropriate:

- review/apply surfaces can reference quality id
- apply route may stop earlier if required plan facts are missing
- existing write preconditions remain authoritative

No new writer or mutation authority.

### 10. Session / Continue integration

Session / Continue should preserve:

- quality id
- readiness
- missing facts
- suggested reads
- suggested verification
- blocked downstream action
- no-write status

`/continue` should be able to explain:

- why planning stopped
- what context is missing
- which reads are recommended
- whether provider proposal / verification / apply is ready
- what to do next

### 11. Verifier coverage

Strengthen `scripts/verify-context-planning.mjs`.

Required coverage:

- high-quality context allows provider proposal readiness
- missing target stops with missing facts
- budget-limited graph blocks provider call
- low test-impact confidence blocks verification command readiness
- suggested reads survive Session / Continue
- plan quality id appears in result/session evidence
- quality gate never grants mutation authority
- provider proposal path stops before fake/provider call when quality blocks it
- command verification plan respects quality gate
- raw content excluded
- result-contract compatibility

### 12. Coupling guard

Do not implement plan quality inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- context packet / context graph / test-impact produce facts
- agent plan consumes facts
- plan quality facade scores and gates
- provider / verification / apply surfaces consume quality
- Result Surface / Session parity render output

No broad agent-loop rewrite.

### 13. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if planning-quality risk changes
- module backlog if route status is tracked

No large architecture doc.

## Boundaries

Hard boundaries:

- no mutation behavior change
- no edit capability expansion
- no provider/model calls by default
- no command execution behavior change
- no command allowlist expansion
- no browser work
- no LSP integration
- no embedding/vector search
- no full-repo semantic index
- no hidden chain-of-thought persistence
- no workspace authority weakening
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- plan quality tests
- quality scoring tests
- quality gate tests
- quality result tests
- context packet / graph regression tests
- Agent Plan regression tests
- context-aware provider proposal regression tests
- verification command plan regression tests
- Session / Continue tests if touched
- Result Surface tests if touched
- context-planning verifier
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Run edit closeout only if edit execution or edit verifier files are touched.

## Final report

Include:

1. What changed
2. Current plan-quality audit
3. Plan quality model
4. Scoring behavior
5. Gate behavior
6. Agent Plan integration
7. Provider proposal integration
8. Verification command integration
9. Result Surface behavior
10. Session / Continue behavior
11. Verifier coverage
12. Coupling guard
13. Validation
14. Remaining risks
15. Next route recommendation
