# Route 190: Task lifecycle loop

## Goal

Add a task lifecycle loop that connects read, analyze, plan, proposal, edit, verification, and repair into one reviewable agent workflow.

Routes 181-189 established strong individual substrates:

- targeted context packets
- bounded context graph
- code intelligence graph trace
- Agent Plan facade
- plan quality gate
- harness trace / scorecard / failure taxonomy
- context-aware provider proposal
- command-driven verification repair loop
- edit proposal review/apply bridge
- exact hunk-set apply
- Result Surface / Session / Continue parity

The current gap is that these are still mostly capability lanes. The project needs a task-level spine:

- understand task intent
- plan reads
- analyze evidence
- decide readiness
- produce proposal plan
- hand off to existing proposal/edit lanes
- plan verification
- route verification failure into repair
- preserve lifecycle evidence for continue and harness

This route should make read -> analyze -> plan -> edit a coherent workflow without adding new write power.

## Expected outcome

By the end of Route 190:

1. User tasks can be represented as a lifecycle with explicit stages.
2. The lifecycle can include Read, Analyze, Plan, Proposal, Edit, Verification, and Repair stages.
3. Each stage records input evidence ids, output evidence ids, readiness, missing facts, and stop conditions.
4. Analysis is represented as a safe evidence-grounded brief, not hidden chain-of-thought.
5. Agent Plan and Plan Quality can consume the lifecycle state.
6. Provider proposals can require a lifecycle analysis brief before proposal generation.
7. Edit/apply lanes remain unchanged and are invoked only through existing review/confirmation paths.
8. Verification command planning can consume lifecycle verification intent.
9. Repair loop can consume lifecycle failure state.
10. Result Surface and Session / Continue can explain where the task stopped and what comes next.
11. Harness trace / scorecard can summarize lifecycle progress and failure class.
12. No mutation, provider call, command execution, or graph backend behavior is expanded.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/tool-runtime-execution-flow.md`

Read only if touched:

- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/session-substrate-seams.md`
- provider boundary docs
- verifier module docs

Do not read browser docs, old route docs, or edit expansion history unless code directly requires them.

## Reference scan

Use only references that help task lifecycle, analysis artifacts, trajectories, planning, and result/report shape.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/pi`
- `/home/wang/projects/inspect_ai`

Secondary:

- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/mini-swe-agent`

Do not read GitNexus by default. Route 189 already absorbed graph/query/staleness patterns. Only read GitNexus if a task lifecycle integration unexpectedly needs graph trace reference.

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- OpenHands: max 10 files
- pi: max 10 files
- Inspect AI: max 8 files
- Gemini + mini-swe-agent: max 8 files total

Focus:

- task lifecycle / turn lifecycle
- session trajectory
- evidence handoff
- planning and tool routing boundary
- analysis summary / observation summary
- scoring/report shape
- failure taxonomy
- stop-before-action UX

Do not copy:

- autonomous planner loops
- hidden chain-of-thought persistence
- external session publishing
- broad agent orchestration frameworks
- automatic edit execution
- real-provider live behavior
- new CLI/TUI systems

## Owner modules

Primary owners:

- Agent Loop Planning
- Workspace / File Context
- Result Surface
- Harness / Eval

Collaborating owners:

- Provider / Model as proposal consumer only
- Runtime / Verification as verification consumer only
- Edit / Patch as execution consumer only
- Session / Continue
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/taskIntent.ts`
- `packages/ts-shell/src/orchestration/taskLifecycle.ts`
- `packages/ts-shell/src/orchestration/taskStage.ts`
- `packages/ts-shell/src/orchestration/taskReadPlan.ts`
- `packages/ts-shell/src/orchestration/analysisBrief.ts`
- `packages/ts-shell/src/orchestration/taskExecutionPlan.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleResult.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleTrace.ts`
- `packages/ts-shell/src/orchestration/taskIntent.test.ts`
- `packages/ts-shell/src/orchestration/taskLifecycle.test.ts`
- `packages/ts-shell/src/orchestration/taskStage.test.ts`
- `packages/ts-shell/src/orchestration/taskReadPlan.test.ts`
- `packages/ts-shell/src/orchestration/analysisBrief.test.ts`
- `packages/ts-shell/src/orchestration/taskExecutionPlan.test.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleResult.test.ts`

Likely touched files:

- `agentPlan.ts`
- `agentPlanContext.ts`
- `agentPlanProjection.ts`
- `agentPlanResult.ts`
- `planQuality.ts`
- `planQualityScore.ts`
- `planQualityGate.ts`
- `planQualityResult.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `harnessFailureTaxonomy.ts`
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
- `editProposalReview.ts`
- `editProposalApply.ts`
- `resultSurfaceModule.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs` only if edit/proposal/repair evidence is touched

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current lifecycle gap

Before changing behavior, determine:

- how user task intent is represented today
- how read/context facts connect to Agent Plan
- how Agent Plan connects to provider proposal
- how proposal connects to edit apply
- how verification connects to repair loop
- where lifecycle evidence is lost or only implicit
- where Result Surface / Session / Harness currently summarize partial task progress
- what verifier coverage exists for full read -> plan -> proposal -> verification -> repair evidence

Summarize this audit in the final report.

### 2. Task intent model

Add `taskIntent.ts`.

Model should classify safe task intent:

- read/explain
- analyze
- plan-only
- edit-proposal
- edit-apply-request
- verification
- repair
- broad/unsupported
- ambiguous

Include:

- task id
- user request safe summary
- explicit targets
- requested outcome
- required stages
- missing target facts
- redaction status

Task intent does not grant mutation authority.

### 3. Task lifecycle model

Add `taskLifecycle.ts`.

Lifecycle should include:

- lifecycle id
- task id
- stage list
- current stage
- stage readiness
- stage evidence ids
- blocked stage if any
- next recommended stage
- overall status
- redaction status
- mutationAuthority: `not-granted` by default

Stages:

- `read`
- `analyze`
- `plan`
- `proposal`
- `review`
- `edit`
- `verify`
- `repair`
- `complete`
- `stopped`

### 4. Stage boundary model

Add `taskStage.ts`.

Each stage should record:

- stage id
- stage kind
- owner module
- input evidence ids
- output evidence ids
- preconditions
- readiness
- missing facts
- stop reason
- do-next
- verifier marker
- redaction status

No raw file content or hidden reasoning.

### 5. Task-driven read plan

Add `taskReadPlan.ts`.

Given task intent and existing context/code graph facts, produce:

- required reads
- optional reads
- suggested next reads
- context sufficiency target
- likely test/docs/call-site reads
- omitted reasons
- no-write evidence

This consumes Route 181/187/189 context facts but does not perform broad repo search.

No LSP, embeddings, full-repo semantic index, provider calls, or mutation.

### 6. Evidence-grounded analysis brief

Add `analysisBrief.ts`.

This is a safe, reviewable artifact, not hidden chain-of-thought.

Analysis brief should include:

- brief id
- task id
- observations
- hypotheses
- supporting evidence ids
- rejected alternatives
- risks
- missing facts
- recommended strategy
- verification expectation
- confidence
- redaction status

Rules:

- no hidden CoT
- no raw full file dumps
- no secrets
- no provider credentials
- no fabricated evidence
- every claim should reference evidence ids when possible

### 7. Task execution plan

Add `taskExecutionPlan.ts`.

Execution plan should connect analysis to proposal/edit/verification:

- proposed strategy
- proposal readiness
- edit readiness
- verification readiness
- repair readiness
- required confirmation
- stop conditions
- fallback path
- recovery expectation
- quality gate id
- scorecard id if available

It must not execute anything.

### 8. Lifecycle result surface

Add `taskLifecycleResult.ts`.

Terminal outcomes:

- task lifecycle created
- read stage required
- analysis brief created
- plan ready
- plan stopped missing context
- proposal ready
- review required
- edit not ready
- verification ready
- repair ready
- task complete
- task stopped

Output should show:

- current stage
- why it stopped
- missing facts
- suggested reads
- suggested verification
- proposal/review/apply readiness
- no-write status unless an existing execution route actually ran

No raw content dumps.

### 9. Lifecycle trace

Add `taskLifecycleTrace.ts`.

Trace should integrate with `harnessTrace` / `harnessScorecard`:

- task id
- lifecycle id
- stage ids
- evidence ids
- plan quality id
- code graph trace id
- proposal id
- verification id
- repair id
- failure class
- stage duration if available
- redaction status

No external session publishing.

### 10. Agent Plan integration

Update Agent Plan to consume lifecycle facts:

- task lifecycle id
- current stage
- analysis brief id
- execution plan id
- lifecycle readiness
- missing facts
- suggested next stage

Agent Plan should no longer need to infer task stage ad hoc when lifecycle facts are present.

### 11. Plan Quality integration

Update plan quality gate:

- analysis brief required for provider proposal when task is non-trivial
- low analysis confidence blocks provider proposal or keeps it review-only
- missing read evidence blocks plan readiness
- missing verification expectation blocks verification readiness
- lifecycle stopped stage feeds failure taxonomy

No provider/model judgment in quality scoring.

### 12. Provider proposal integration

Update context-aware provider proposal:

- can consume lifecycle id
- can consume analysis brief summary
- can consume execution plan constraints
- should stop before provider call if analysis brief is missing for non-trivial tasks
- should include lifecycle/brief ids in proposal manifest

No default real-provider call.

### 13. Verification / repair integration

Update verification command plan and repair planner:

- consume lifecycle stage and execution plan
- attach lifecycle id to verification result
- attach lifecycle id to repair context/proposal
- repair loop can refer back to analysis brief and failed verification evidence

No automatic repair.

### 14. Result Surface / Session / Continue integration

Session / Continue should preserve:

- task id
- lifecycle id
- current stage
- analysis brief id
- execution plan id
- missing facts
- suggested reads
- suggested verification
- proposal/review/apply readiness
- verification/repair readiness
- failure class
- no-write status

`/continue` should be able to explain:

- which stage the task stopped at
- what evidence was already gathered
- what analysis concluded
- what plan exists
- what needs confirmation
- what should happen next

No raw file content, hidden reasoning, or provider diagnostics.

### 15. Verifier coverage

Strengthen `scripts/verify-context-planning.mjs`.

Required coverage:

- read/analyze/plan lifecycle created for explicit target task
- read plan uses context packet / code graph facts
- analysis brief references evidence ids
- missing analysis blocks provider proposal for non-trivial task
- plan quality consumes lifecycle / brief
- provider proposal receives lifecycle / brief ids when allowed
- verification command plan receives lifecycle id
- repair context receives lifecycle id after failure
- Session / Continue preserves lifecycle current stage
- harness trace / scorecard includes lifecycle facts
- no mutation authority granted by lifecycle
- no raw content / hidden reasoning persisted
- result-contract compatibility

Add edit closeout coverage only if edit/proposal/repair files are touched.

### 16. Coupling guard

Do not implement lifecycle logic inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- task intent facade
- lifecycle facade
- context/code graph facts
- analysis brief
- execution plan
- Agent Plan / Plan Quality
- provider / verification / repair consumers
- Result Surface / Session parity

No broad agent-loop rewrite.

### 17. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if task lifecycle risk changes
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

- task intent tests
- lifecycle tests
- stage tests
- read plan tests
- analysis brief tests
- execution plan tests
- lifecycle result tests
- lifecycle trace tests
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
2. Current lifecycle gap audit
3. Task intent behavior
4. Lifecycle/stage model
5. Task-driven read plan
6. Analysis brief behavior
7. Execution plan behavior
8. Agent Plan / Plan Quality integration
9. Provider / verification / repair integration
10. Result Surface behavior
11. Session / Continue behavior
12. Harness trace / scorecard integration
13. Verifier coverage
14. Coupling guard
15. Validation
16. Remaining risks
17. Next route recommendation
