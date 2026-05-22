# Route 192: Task-driven context analysis

## Goal

Make the activated task lifecycle actually drive staged context acquisition and evidence-grounded analysis.

Routes 181-191 established:

- targeted context packet
- bounded context graph
- code intelligence graph trace
- Agent Plan facade
- plan quality gate
- harness trace / scorecard
- context-aware provider proposal
- command-driven verification repair loop
- task lifecycle spine
- task lifecycle runtime activation

The current gap is that lifecycle stages are reachable, but the read/analyze stages may still be shallow. Route 192 should make the lifecycle use task intent to decide what context is required, what has been read, what is missing, and whether analysis is strong enough to proceed.

This route owns:

- task-driven staged read plan
- context acquisition policy by task type
- code graph impact query selection
- context sufficiency checks
- analysis brief calibration
- analysis confidence / risk / missing-fact projection
- plan quality updates from analysis state
- provider / verification readiness gates from analysis evidence
- Session / Continue / verifier coverage

This is a read/analyze/plan route, not an edit execution route.

## Expected outcome

By the end of Route 192:

1. Task intent determines a staged read plan.
2. Different task types request different context categories.
3. Context acquisition can ask for source, tests, docs, call-sites, imports, config, verification evidence, or repair evidence as appropriate.
4. Context sufficiency is evaluated before provider proposal, verification planning, or edit apply readiness.
5. Analysis brief records observations, hypotheses, evidence ids, risks, missing facts, rejected alternatives, and recommended strategy.
6. Analysis confidence feeds Agent Plan and Plan Quality.
7. Provider proposal is blocked or review-only when analysis is missing or low confidence.
8. Verification planning is blocked or downgraded when analysis lacks test-impact evidence.
9. Session / Continue can explain what context was acquired, what analysis concluded, and what is still missing.
10. No mutation, provider call, command execution, or graph backend behavior is expanded.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/cross-capability-result-flow.md`

Read only if touched:

- `docs/architecture/tool-runtime-execution-flow.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/session-substrate-seams.md`
- provider boundary docs
- verifier module docs

Do not read browser docs, old route docs, or edit expansion history unless code directly requires them.
Do not read GitNexus by default unless code graph query behavior needs reference.
Do not read pi by default unless harness scorecard or failure taxonomy behavior changes.

## Reference scan

Use only references that help task-driven reading, analysis summaries, staged planning, and evidence handoff.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/mini-swe-agent`

Optional only if directly relevant:

- `/home/wang/projects/GitNexus` for graph query / impact query pattern
- `/home/wang/projects/pi` for harness scorecard / trace pattern

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- OpenHands: max 8 files
- Inspect AI + Gemini + mini-swe-agent: max 8 files total
- Optional GitNexus/pi: max 4 files each, only if needed

Focus:

- task intent to context gathering
- staged read / observation plan
- evidence-grounded analysis artifacts
- missing-context UX
- trajectory / event handoff
- task state and result surface
- evaluation/report shape for analysis quality

Do not copy:

- autonomous hidden planners
- hidden chain-of-thought persistence
- real-provider default behavior
- automatic edit execution
- LSP / embedding / full-repo search systems
- new CLI/TUI systems

## Owner modules

Primary owners:

- Agent Loop Planning
- Workspace / File Context
- Result Surface

Collaborating owners:

- Session / Continue
- Harness / Eval
- Provider / Model as proposal consumer only
- Runtime / Verification as verification consumer only
- Edit / Patch as execution consumer only

Likely new files:

- `packages/ts-shell/src/orchestration/taskContextNeed.ts`
- `packages/ts-shell/src/orchestration/taskContextAcquisition.ts`
- `packages/ts-shell/src/orchestration/taskContextSufficiency.ts`
- `packages/ts-shell/src/orchestration/analysisBriefCalibration.ts`
- `packages/ts-shell/src/orchestration/analysisQualityGate.ts`
- `packages/ts-shell/src/orchestration/taskContextResult.ts`
- `packages/ts-shell/src/orchestration/taskContextNeed.test.ts`
- `packages/ts-shell/src/orchestration/taskContextAcquisition.test.ts`
- `packages/ts-shell/src/orchestration/taskContextSufficiency.test.ts`
- `packages/ts-shell/src/orchestration/analysisBriefCalibration.test.ts`
- `packages/ts-shell/src/orchestration/analysisQualityGate.test.ts`
- `packages/ts-shell/src/orchestration/taskContextResult.test.ts`

Likely touched files:

- `taskIntent.ts`
- `taskLifecycle.ts`
- `taskStage.ts`
- `taskReadPlan.ts`
- `analysisBrief.ts`
- `taskExecutionPlan.ts`
- `taskLifecycleActivation.ts`
- `taskLifecycleRouter.ts`
- `taskLifecycleHandoff.ts`
- `agentPlan.ts`
- `agentPlanContext.ts`
- `agentPlanProjection.ts`
- `agentPlanResult.ts`
- `planQuality.ts`
- `planQualityScore.ts`
- `planQualityGate.ts`
- `planQualityResult.ts`
- `contextPacket.ts`
- `contextGraph.ts`
- `codeGraphTrace.ts`
- `codeGraphImpact.ts`
- `codeGraphQuery.ts`
- `testImpactPlan.ts`
- `contextAwareProviderEdit.ts`
- `contextAwareProviderPrompt.ts`
- `verificationCommandPlan.ts`
- `verificationRepairPlanner.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current task-driven read/analyze behavior

Before changing behavior, determine:

- how Route 191 task lifecycle currently creates read plan and analysis brief
- whether task type changes what context is requested
- whether context/code graph facts are actively selected by task intent
- how analysis confidence is currently assigned
- whether provider proposal checks analysis confidence
- whether verification command planning checks analysis/test-impact sufficiency
- what terminal / continue surfaces show when analysis is weak
- what verifier currently proves about read/analyze lifecycle behavior

Summarize this audit in the final report.

### 2. Task context need model

Add `taskContextNeed.ts`.

Context needs should be derived from task intent.

Task categories:

- read/explain
- bug investigation
- test failure investigation
- edit proposal
- refactor planning
- verification planning
- repair planning
- broad/ambiguous unsupported

Context need kinds:

- root target
- direct imports
- reverse call-sites
- sibling tests
- affected tests
- docs/readme
- config/package scripts
- verification output
- runtime receipt
- prior proposal/edit evidence
- repair evidence

Each need should include:

- need id
- task id
- required / optional
- reason
- source owner
- expected evidence kind
- budget class
- readiness
- omitted reason when unavailable
- redaction status

### 3. Task context acquisition

Add `taskContextAcquisition.ts`.

Given task context needs and available facts, choose staged acquisitions:

- use context packet if enough
- use context graph if target-related context is needed
- use code graph impact query when impact/test/call-site context is needed
- use verification evidence when task is test failure or repair
- use prior proposal/edit evidence when task is review or repair
- suggest next reads when facts are missing

This module should not perform broad scans. It only selects from existing context/query facades and safe bounded read paths.

No provider calls, no command execution, no mutation.

### 4. Context sufficiency

Add `taskContextSufficiency.ts`.

Determine whether acquired context is enough for:

- analysis brief
- provider proposal
- verification command planning
- edit apply readiness
- repair proposal

Sufficiency states:

- `sufficient`
- `needs-required-context`
- `needs-optional-context`
- `budget-limited`
- `low-confidence`
- `stale-context`
- `unsupported`

Output should include:

- missing required facts
- missing optional facts
- stale facts
- omitted reasons
- suggested reads
- suggested verification
- readiness downgrade

### 5. Analysis brief calibration

Add `analysisBriefCalibration.ts`.

Given analysis brief + evidence facts:

- verify every observation has evidence id when possible
- classify hypothesis strength
- classify missing facts
- classify risk level
- classify rejected alternatives quality
- classify recommended strategy readiness
- compute analysis confidence
- mark unsupported / under-evidenced claims

This is not hidden chain-of-thought. It is a safe quality projection over explicit analysis brief fields.

### 6. Analysis quality gate

Add `analysisQualityGate.ts`.

Gate decisions:

- `allow-plan`
- `allow-provider-proposal`
- `allow-verification-planning`
- `allow-review-only-proposal`
- `stop-missing-analysis`
- `stop-under-evidenced-analysis`
- `stop-missing-required-context`
- `stop-stale-context`
- `stop-budget-limited`
- `stop-unsupported`

Rules:

- non-trivial provider proposal requires analysis brief with sufficient confidence
- verification planning requires test/verification context or explicit command evidence
- edit apply readiness should not be upgraded by analysis alone
- analysis never grants mutation authority

### 7. Task context result surface

Add `taskContextResult.ts`.

Terminal outcomes:

- context needs identified
- context acquisition planned
- context sufficient
- context insufficient
- analysis calibrated
- analysis under-evidenced
- provider blocked by analysis quality
- verification blocked by context sufficiency
- suggested reads available

Output should show:

- task id
- required context categories
- acquired context summaries
- missing facts
- analysis confidence
- suggested reads
- suggested verification
- no-write status

No raw file content dumps.

### 8. Lifecycle integration

Update lifecycle activation/router/handoff so:

- lifecycle read stage produces context needs
- lifecycle analyze stage uses context sufficiency
- analysis brief is calibrated before plan readiness
- execution plan references analysis quality
- lifecycle stopped stage records missing context or weak analysis reason
- lifecycle current stage is updated accurately

No broad runMvp logic.

### 9. Agent Plan / Plan Quality integration

Agent Plan should consume:

- context need ids
- context sufficiency state
- analysis confidence
- analysis missing facts
- analysis risk level

Plan Quality should consume:

- context sufficiency state
- analysis quality gate result
- stale/budget-limited context
- verification evidence availability

Plan quality should downgrade provider/verification readiness when analysis is under-evidenced.

### 10. Provider proposal integration

Context-aware provider proposal should:

- require analysis quality for non-trivial tasks
- include analysis brief id and analysis quality id in proposal context
- stop before provider call when analysis is missing/under-evidenced
- allow review-only no-write proposal only if route policy explicitly allows it
- preserve fake-provider deterministic tests

No real-provider default call.

### 11. Verification / repair integration

Verification command planning should:

- consume task context sufficiency and analysis quality
- downgrade readiness if test-impact context is missing
- attach analysis quality id where present

Repair loop should:

- consume prior analysis quality if available
- identify whether failed verification requires more context before repair proposal
- stop before repair proposal when failure context is under-evidenced

No automatic repair.

### 12. Session / Continue integration

Session / Continue should preserve:

- context need ids
- acquired context summary
- context sufficiency
- analysis quality id
- analysis confidence
- missing facts
- suggested reads
- suggested verification
- stopped stage and reason

`/continue` should be able to explain:

- what context the task required
- what context was acquired
- why analysis is sufficient or insufficient
- what facts are missing
- what should be read next
- whether provider/verification/repair is ready

No raw file content, hidden reasoning, or provider diagnostics.

### 13. Harness / scorecard integration

Harness trace / scorecard should include:

- context sufficiency state
- analysis confidence
- under-evidenced claims count if available
- missing required context count
- stale/budget-limited context flags
- downstream readiness

Failure taxonomy should include:

- missing required context
- under-evidenced analysis
- stale analysis context
- analysis blocked provider proposal
- analysis blocked verification readiness

### 14. Verifier coverage

Strengthen `scripts/verify-context-planning.mjs`.

Required coverage:

- bug investigation task requires source + tests + call-site context
- test failure task requires verification output/runtime receipt or stopped missing evidence
- refactor planning task requires call-site/test impact context
- missing required context stops before provider proposal
- under-evidenced analysis stops provider proposal
- sufficient analysis allows provider proposal readiness
- missing test-impact blocks verification readiness
- analysis quality id appears in Agent Plan / Plan Quality / Session evidence
- `/continue` preserves missing facts and suggested reads
- harness scorecard records analysis confidence
- no mutation authority granted
- no provider call when analysis gate blocks
- raw content / hidden reasoning excluded
- result-contract compatibility

Run edit closeout only if edit/proposal/repair execution files are touched.

### 15. Coupling guard

Do not implement task-driven context acquisition inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- lifecycle activation
- task context need facade
- context acquisition facade
- context sufficiency facade
- analysis calibration facade
- analysis quality gate facade
- Agent Plan / Plan Quality consumers
- Result Surface / Session parity

No broad agent-loop rewrite.

### 16. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if read/analyze risk changes
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

- task context need tests
- context acquisition tests
- context sufficiency tests
- analysis calibration tests
- analysis quality gate tests
- task context result tests
- lifecycle activation/router regression tests
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
2. Current task-driven read/analyze audit
3. Context need behavior
4. Context acquisition behavior
5. Context sufficiency behavior
6. Analysis calibration behavior
7. Analysis quality gate behavior
8. Lifecycle integration
9. Agent Plan / Plan Quality integration
10. Provider / verification / repair integration
11. Result Surface behavior
12. Session / Continue behavior
13. Harness / scorecard integration
14. Verifier coverage
15. Coupling guard
16. Validation
17. Remaining risks
18. Next route recommendation
