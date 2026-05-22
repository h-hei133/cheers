# Route 191: Task lifecycle activation

## Goal

Activate the Route 190 task lifecycle spine through the real prompt / agent-loop path.

Route 190 added the lifecycle substrate:

- task intent
- lifecycle / stage model
- task-driven read plan
- evidence-grounded analysis brief
- task execution plan
- lifecycle result
- lifecycle trace
- Agent Plan / Plan Quality / Provider / Verification / Repair integration

But Route 190 intentionally avoided changing `runMvpIntegratedFlow.ts`.

Route 191 should now make task lifecycle reachable and useful in real user-facing flows:

- normal prompts can produce lifecycle-aware read/analyze/plan surfaces
- lifecycle stages can drive missing-context stops
- analysis brief can be required before non-trivial provider proposal
- execution plan can guide proposal / verification / repair readiness
- terminal output can explain current task stage
- `/continue` can resume from lifecycle stage evidence
- verifier proves the lifecycle is not a dead sidecar

This route activates the task spine without expanding mutation, provider, or command authority.

## Expected outcome

By the end of Route 191:

1. A normal read/analyze/plan prompt can create a task lifecycle.
2. A non-trivial edit/proposal prompt can create lifecycle stages before provider proposal.
3. Missing context stops at read/analyze stage with suggested reads.
4. Analysis brief is emitted for lifecycle-ready tasks and references evidence ids.
5. Execution plan explains proposal / edit / verification / repair readiness.
6. Provider proposal path can require lifecycle + analysis brief when task is non-trivial.
7. Verification command planning can reference lifecycle verification intent.
8. Repair loop can reference lifecycle failure state.
9. Terminal / compact / continue can explain current lifecycle stage and next action.
10. `runMvpIntegratedFlow.ts` remains a thin composition root.
11. No new edit behavior, provider call, command execution, or allowlist expansion is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/workspace-file-context-contract.md`

Read only if touched:

- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/tool-runtime-execution-flow.md`
- `docs/architecture/runtime-receipt-contract.md`
- provider boundary docs
- verifier module docs

Do not read GitNexus by default. Route 189 already absorbed graph/query patterns.
Do not read browser docs or old route docs unless code directly requires them.

## Reference scan

Use references only for task lifecycle, query loop, event/trajectory, staged planning, and user-facing task state.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/pi`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- OpenHands: max 10 files
- pi: max 8 files
- Inspect AI + Gemini + mini-swe-agent: max 8 files total

Focus:

- query/task loop activation
- tool/read/plan stage boundaries
- event / trajectory stage evidence
- task state terminal summaries
- continuation/replay-safe summaries
- harness task trace / scorecard shape
- stop-before-action UX

Do not copy:

- autonomous hidden planners
- hidden chain-of-thought persistence
- external session publishing
- new CLI/TUI systems
- automatic edit execution
- default real-provider behavior

## Owner modules

Primary owners:

- Agent Loop
- Agent Loop Planning
- Result Surface
- Session / Continue

Collaborating owners:

- Workspace / File Context
- Provider / Model as proposal consumer only
- Runtime / Verification as verification consumer only
- Edit / Patch as execution consumer only
- Harness / Eval
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/taskLifecycleActivation.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleRuntime.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleRouter.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleHandoff.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleActivation.test.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleRuntime.test.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleRouter.test.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleHandoff.test.ts`

Likely touched files:

- `runMvpIntegratedFlow.ts`
- `taskIntent.ts`
- `taskLifecycle.ts`
- `taskStage.ts`
- `taskReadPlan.ts`
- `analysisBrief.ts`
- `taskExecutionPlan.ts`
- `taskLifecycleResult.ts`
- `taskLifecycleTrace.ts`
- `agentPlan.ts`
- `agentPlanProjection.ts`
- `agentPlanResult.ts`
- `planQuality.ts`
- `planQualityGate.ts`
- `planQualityResult.ts`
- `contextPacket.ts`
- `contextGraph.ts`
- `codeGraphTrace.ts`
- `codeGraphImpact.ts`
- `contextAwareProviderEdit.ts`
- `contextAwareProviderPrompt.ts`
- `contextAwareProviderProposal.ts`
- `verificationCommandPlan.ts`
- `verificationRepairContext.ts`
- `verificationRepairPlanner.ts`
- `resultSurfaceModule.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs` only if edit/proposal/repair integration changes

`runMvpIntegratedFlow.ts` may be touched, but only as a thin composition point.

## Implementation tasks

### 1. Audit current lifecycle reachability

Before changing behavior, determine:

- whether any normal prompt currently creates a task lifecycle
- whether lifecycle facts affect runtime branch selection
- whether read/analyze/plan prompts surface lifecycle stages
- whether provider proposal path requires analysis brief for non-trivial tasks
- whether verification command plan receives lifecycle verification intent
- whether repair loop receives lifecycle failure state
- how terminal / compact / continue expose lifecycle state today
- what verifier proves about lifecycle reachability

Summarize this audit in the final report.

### 2. Lifecycle activation facade

Add `taskLifecycleActivation.ts`.

Given user prompt + available context facts, produce:

- task intent
- lifecycle
- current stage
- read plan
- analysis brief if evidence is sufficient
- execution plan if analysis is sufficient
- plan quality id
- lifecycle result
- no-write evidence

Activation must not execute provider, command, or edit mutation.

### 3. Runtime lifecycle router

Add `taskLifecycleRouter.ts`.

Route common prompt classes:

- read/explain -> lifecycle read/analyze surface
- analyze -> lifecycle analysis brief
- plan-only -> lifecycle execution plan
- edit proposal -> lifecycle proposal readiness
- verification -> lifecycle verification readiness
- repair -> lifecycle repair readiness
- broad/ambiguous -> lifecycle stopped with missing facts

Router must not grant mutation authority.

### 4. Lifecycle handoff

Add `taskLifecycleHandoff.ts`.

Handoff should prepare downstream consumers:

- provider proposal handoff requires lifecycle id + analysis brief id for non-trivial tasks
- verification command plan handoff includes lifecycle verification intent
- repair loop handoff includes lifecycle failure state
- edit apply handoff only references lifecycle evidence; existing write routes still own authority

No new writer.

### 5. Thin runMvp activation

Update `runMvpIntegratedFlow.ts` only to call the activation/router facade.

Allowed changes:

- create lifecycle for relevant prompt classes
- hand lifecycle result to Result Surface
- hand lifecycle evidence to Session / Continue
- pass lifecycle ids into provider / verification / repair consumers where existing paths already support it
- preserve existing branch behavior for explicit edit/verification/browser/provider cases unless lifecycle surface is explicitly safer

Disallowed changes:

- inline lifecycle building
- new edit execution branches
- new provider call branches
- new command execution branches
- broad route selection rewrite

### 6. Analysis brief activation

Ensure non-trivial read/analyze/plan prompts can emit analysis brief.

Analysis brief should include:

- observations
- hypotheses
- supporting evidence ids
- risks
- rejected alternatives if deterministic
- recommended strategy
- missing facts
- verification expectation
- confidence

No hidden chain-of-thought and no raw file dumps.

### 7. Execution plan activation

Ensure plan-only and proposal-intent prompts can produce task execution plan.

Execution plan should show:

- proposal readiness
- edit readiness
- verification readiness
- repair readiness
- required confirmation
- stop conditions
- fallback path
- recovery expectation
- plan quality id

It must not execute anything.

### 8. Provider proposal integration

Provider proposal path should consume lifecycle evidence:

- lifecycle id
- analysis brief id
- execution plan id
- plan quality id
- context/code graph ids

Rules:

- for non-trivial tasks, provider proposal stops before provider call when analysis brief is missing or low confidence
- fake-provider deterministic tests should prove lifecycle ids are carried
- provider proposal remains no-write by default

No default real-provider call.

### 9. Verification / repair integration

Verification command plan should consume:

- lifecycle id
- execution plan id
- verification intent
- plan quality id

Repair loop should consume:

- lifecycle id
- failed stage
- verification failure state
- analysis brief id if available
- execution plan id if available

No automatic repair.

### 10. Result Surface integration

Lifecycle terminal outcomes:

- lifecycle created
- read stage ready
- analysis brief created
- analysis missing context
- execution plan ready
- proposal blocked by missing analysis
- verification readiness blocked
- repair readiness blocked
- lifecycle stopped
- lifecycle complete if all relevant stages finish

Output should show:

- task id
- current stage
- readiness
- missing facts
- suggested reads
- suggested verification
- next action
- no-write status unless downstream execution actually ran

No raw content dumps.

### 11. Session / Continue integration

Session / Continue should preserve:

- task id
- lifecycle id
- current stage
- read plan id
- analysis brief id
- execution plan id
- plan quality id
- lifecycle trace id
- missing facts
- suggested reads
- suggested verification
- provider/verification/repair readiness
- no-write status

`/continue` should explain:

- where the task stopped
- what evidence has been gathered
- what analysis was produced
- what plan exists
- what next read / confirmation / verification is needed
- whether any mutation occurred

### 12. Harness / scorecard integration

Harness trace / scorecard should include:

- task lifecycle id
- stage progress
- blocked stage
- failure taxonomy
- plan quality
- context/code graph ids
- proposal / verification / repair ids when present

No external session publishing.

### 13. Verifier coverage

Strengthen `scripts/verify-context-planning.mjs`.

Required coverage:

- read/analyze prompt creates lifecycle and analysis brief
- plan-only prompt creates lifecycle execution plan
- non-trivial edit proposal prompt stops before provider call when analysis brief missing
- sufficient lifecycle evidence allows provider proposal readiness
- lifecycle evidence reaches verification command plan
- lifecycle evidence reaches repair context after failure facts
- Session / Continue preserves lifecycle current stage
- terminal output shows stage and next action
- harness trace / scorecard include lifecycle facts
- lifecycle never grants mutation authority
- raw content / hidden reasoning excluded
- runMvp coupling guard proves lifecycle logic is not inline
- result-contract compatibility

Run edit closeout only if edit/proposal/repair execution files are touched.

### 14. Coupling guard

Add focused guard that protects against lifecycle logic accumulating in `runMvpIntegratedFlow.ts`.

Acceptable:

- import facade
- call facade
- pass result to existing surfaces

Not acceptable:

- stage construction inline
- analysis brief building inline
- execution plan assembly inline
- lifecycle result formatting inline

Avoid brittle line-count gates.

### 15. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if lifecycle activation risk changes
- module backlog if route status is tracked
- capability lifecycle docs only if necessary

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
- no persistent Graph DB
- no MCP backend
- no hidden chain-of-thought persistence
- no session publishing / external dataset
- no workspace authority weakening
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- lifecycle activation tests
- lifecycle router tests
- lifecycle handoff tests
- task intent/lifecycle/stage regression tests
- analysis brief regression tests
- execution plan regression tests
- Agent Plan regression tests
- Plan Quality regression tests
- context/code graph regression tests
- provider proposal regression tests if touched
- verification/repair regression tests if touched
- Session / Continue tests if touched
- Result Surface tests if touched
- context-planning verifier
- edit closeout verifier only if edit/proposal/repair files are touched
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run real-provider gates unless explicitly added as opt-in dry-run.

## Final report

Include:

1. What changed
2. Current lifecycle reachability audit
3. Lifecycle activation behavior
4. Runtime router behavior
5. Analysis brief activation
6. Execution plan activation
7. Provider / verification / repair handoff behavior
8. runMvp coupling guard
9. Result Surface behavior
10. Session / Continue behavior
11. Harness / scorecard integration
12. Verifier coverage
13. Validation
14. Remaining risks
15. Next route recommendation
