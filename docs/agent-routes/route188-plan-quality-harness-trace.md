# Route 188: Plan quality and harness trace

## Goal

Add a deterministic plan quality gate and harness trace layer across context graph, Agent Plan, provider proposal, verification, and repair-loop readiness.

Routes 181-187 established:

- targeted context packets
- bounded context graph
- test-impact planning
- Agent Plan facade
- context-aware provider proposal
- command-driven verification repair loop
- Result / Session / Continue parity

The next gap is not more edit execution. The gap is deciding whether the agent has enough context, plan evidence, verification readiness, and harness evidence to proceed.

Route 188 should combine:

- plan quality scoring
- context graph readiness
- provider proposal readiness
- verification command readiness
- repair-loop readiness
- harness trace / scorecard
- failure taxonomy
- verifier gate

This route should make the project more capable of learning from runs without adding mutation power.

## Expected outcome

By the end of Route 188:

1. Agent Plan carries a deterministic plan quality score.
2. Context packet / context graph / test-impact facts feed that score.
3. Provider proposal generation can be blocked by low plan quality before provider call.
4. Verification command planning can be blocked by missing test-impact or allowlist facts.
5. Repair-loop planning can be blocked by missing verification/runtime evidence.
6. A safe harness trace records read/plan/proposal/verification/repair lifecycle facts.
7. A route scorecard can summarize context quality, plan readiness, verification readiness, proposal readiness, and failure reasons.
8. Session / Continue can summarize plan quality and harness trace without raw content.
9. Verifier coverage proves quality-gated no-write decisions and stable trace/report output.
10. No mutation, provider call, command execution, or graph backend behavior is expanded.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/tool-runtime-execution-flow.md`

Read only if touched:

- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/session-substrate-seams.md`
- provider boundary docs
- verifier module docs

Do not load browser docs or old route docs unless code directly requires them.

## Reference scan

Use references only for plan quality, harness traces, failure taxonomy, code graph readiness, and score/report shape.

Primary:

- `/home/wang/projects/pi`
- `/home/wang/projects/GitNexus`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/OpenHands`
- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- pi: max 12 files
- GitNexus: max 12 files
- ClaudeCode: max 8 files
- opencode: max 8 files
- gemini-cli: max 8 files
- OpenHands + Inspect AI + mini-swe-agent: max 10 files total

Focus:

- pi: harness trace, session/task trajectory, failure taxonomy, scorecard/report, real task learning loop
- GitNexus: graph/index/query shape, impact query, code relationship representation, stale/refresh concepts
- ClaudeCode/opencode/gemini-cli: planning/result/verification boundary
- Inspect AI: scoring/report shape
- OpenHands: event/trajectory persistence

Do not copy:

- pi CLI/TUI or release infrastructure wholesale
- GitNexus MCP server
- GitNexus persistent graph DB
- embeddings / vector retrieval
- external package/dependency setup
- autonomous planner loops
- automatic edit execution

## Owner modules

Primary owners:

- Agent Loop Planning
- Workspace / File Context
- Harness / Eval
- Result Surface

Collaborating owners:

- Provider / Model
- Runtime / Verification
- Session / Continue
- Edit / Patch as consumer only

Likely new files:

- `packages/ts-shell/src/orchestration/planQuality.ts`
- `packages/ts-shell/src/orchestration/planQualityScore.ts`
- `packages/ts-shell/src/orchestration/planQualityGate.ts`
- `packages/ts-shell/src/orchestration/planQualityResult.ts`
- `packages/ts-shell/src/orchestration/harnessTrace.ts`
- `packages/ts-shell/src/orchestration/harnessScorecard.ts`
- `packages/ts-shell/src/orchestration/harnessFailureTaxonomy.ts`
- `packages/ts-shell/src/orchestration/contextGraphReadiness.ts`
- `packages/ts-shell/src/orchestration/planQuality.test.ts`
- `packages/ts-shell/src/orchestration/planQualityGate.test.ts`
- `packages/ts-shell/src/orchestration/harnessTrace.test.ts`
- `packages/ts-shell/src/orchestration/harnessScorecard.test.ts`
- `packages/ts-shell/src/orchestration/harnessFailureTaxonomy.test.ts`
- `packages/ts-shell/src/orchestration/contextGraphReadiness.test.ts`

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
- `verificationCommandResult.ts`
- `verificationRepairPlanner.ts`
- `verificationRepairResult.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs` only if needed

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current quality / trace behavior

Before changing behavior, determine:

- where plan confidence is assigned today
- how context graph readiness is represented
- how test-impact confidence is represented
- how provider proposal readiness is decided
- how verification command readiness is decided
- how repair-loop readiness is decided
- what trace/report facts verifier scripts already emit
- what failure taxonomy already exists across result, edit, provider, verification, and repair paths

Summarize this audit in the final report.

### 2. Plan quality model

Add `planQuality.ts`.

Model should include:

- quality id
- source agent plan id
- context packet id
- context graph id
- test-impact plan id
- target confidence
- context completeness
- graph coverage
- test coverage
- verification readiness
- provider proposal readiness
- repair-loop readiness
- edit/apply readiness
- missing facts
- suggested reads
- suggested verification
- suggested next action
- redaction status
- mutationAuthority: `not-granted`

No raw file content.

### 3. Deterministic scoring

Add `planQualityScore.ts`.

Score dimensions:

- target confidence
- context packet completeness
- context graph coverage
- import/call-site coverage
- test-impact coverage
- docs coverage
- omitted-risk level
- provider readiness
- verification readiness
- repair-loop readiness
- apply readiness

Score levels:

- `ready`
- `needs-more-context`
- `budget-limited`
- `low-confidence`
- `blocked`
- `unsupported`

No provider/model judgment.

### 4. Quality gate

Add `planQualityGate.ts`.

Gate decisions:

- `allow-provider-proposal`
- `allow-verification-command-plan`
- `allow-review-only-proposal`
- `allow-repair-loop`
- `stop-needs-more-context`
- `stop-budget-limited`
- `stop-low-confidence`
- `stop-missing-target`
- `stop-missing-verification`
- `stop-missing-runtime-receipt`
- `stop-unsupported`

Rules:

- low context quality blocks provider proposal before provider call
- missing test-impact blocks verification command readiness
- missing runtime receipt blocks repair-loop readiness
- missing target blocks apply readiness
- quality gate never grants mutation authority
- write routes still re-check their own preconditions

### 5. Context graph readiness

Add `contextGraphReadiness.ts`.

This should convert context graph / test-impact facts into readiness facts:

- graph ready / partial / low-confidence / budget-limited
- test-impact ready / missing / not-allowlisted / low-confidence
- reverse call-site confidence
- docs/import/test coverage
- omitted-risk summary
- stale/refresh need if available

This is inspired by Graph RAG / code intelligence, but remains local, bounded, deterministic, and non-persistent.

No Graph DB, MCP, embeddings, or full-repo index.

### 6. Harness trace

Add `harnessTrace.ts`.

Trace should record safe lifecycle facts:

- route / task id if available
- context packet id
- context graph id
- agent plan id
- plan quality id
- provider proposal id
- verification command plan id
- runtime receipt markers
- repair context / repair proposal id
- result status
- failure taxonomy
- redaction status

Trace must not include:

- raw full files
- secrets
- provider credentials
- private config paths
- hidden chain-of-thought
- raw unbudgeted stdout/stderr
- browser/page content

### 7. Failure taxonomy

Add `harnessFailureTaxonomy.ts`.

Normalize failure classes across current capability flows:

- missing target
- missing context
- low plan quality
- context budget limited
- provider unavailable
- provider invalid output
- verification not allowlisted
- verification failed
- runtime timeout
- runtime blocked
- edit preflight stopped
- edit partial failure
- repair proposal invalid
- session/result parity risk
- unknown

Map each to:

- capability area
- lifecycle stage
- safe reason
- suggested next action
- verifier marker

### 8. Harness scorecard

Add `harnessScorecard.ts`.

Scorecard should summarize:

- context quality
- plan readiness
- provider proposal readiness
- verification readiness
- repair readiness
- result truthfulness
- continuation readiness
- failure class
- next suggested route/action

Use deterministic pass/warn/fail/skip, not model judgment.

This is inspired by pi-style harness learning, but does not publish sessions or create an external dataset.

### 9. Result Surface integration

Add or update `planQualityResult.ts`.

Terminal outcomes:

- plan quality ready
- needs more context
- budget limited
- low confidence
- provider proposal blocked by quality
- verification blocked by quality
- repair blocked by missing evidence
- scorecard generated
- harness trace captured

Output should show:

- readiness
- missing facts
- suggested reads
- suggested verification
- failure class if any
- no-write status
- evidence ids

No raw content dumps.

### 10. Provider / verification / repair integration

Update consumers to optionally use plan quality:

- context-aware provider proposal checks plan quality before provider call
- verification command plan checks plan quality/test-impact readiness
- verification repair loop checks runtime receipt / verification evidence readiness
- proposal/apply surfaces can carry quality id, but do not gain mutation authority

No behavior should expand to real-provider call, command execution, or edit mutation by default.

### 11. Session / Continue integration

Session / Continue should preserve:

- plan quality id
- scorecard id
- trace id
- readiness
- failure class
- missing facts
- suggested reads
- suggested verification
- blocked downstream action
- no-write status

`/continue` should be able to explain:

- why planning stopped
- what context is missing
- why provider/verification/repair was blocked
- what next read or verification step is suggested
- what scorecard says

No raw file content, provider diagnostics, or hidden reasoning.

### 12. Verifier coverage

Strengthen `scripts/verify-context-planning.mjs`.

Required coverage:

- high-quality context produces ready quality score
- missing context produces needs-more-context
- budget-limited graph blocks provider proposal
- low test-impact blocks verification command readiness
- missing runtime receipt blocks repair-loop readiness
- scorecard records pass/warn/fail/skip
- failure taxonomy maps missing target / provider unavailable / verification failed / edit partial failure
- trace includes context/plan/verification/repair ids when present
- Session / Continue preserves quality and trace summaries
- quality gate never grants mutation authority
- provider proposal path stops before fake/provider call when blocked
- command verification plan respects quality gate
- raw content excluded
- result-contract compatibility

### 13. Coupling guard

Do not implement quality / trace logic inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- context packet / graph / test-impact produce facts
- Agent Plan consumes facts
- plan quality facade scores and gates
- harness trace records lifecycle facts
- provider / verification / repair consume quality
- Result Surface / Session parity renders output

No broad agent-loop rewrite.

### 14. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if planning/harness risk changes
- module backlog if route status is tracked
- tool-runtime flow docs only if verification/trace semantics change

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

- plan quality tests
- quality scoring/gate tests
- context graph readiness tests
- harness trace tests
- failure taxonomy tests
- scorecard tests
- context graph / test-impact regression tests
- Agent Plan regression tests
- context-aware provider proposal regression tests
- verification command plan regression tests
- repair-loop regression tests
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
2. Current quality / trace audit
3. Plan quality model
4. Scoring and gate behavior
5. Context graph readiness behavior
6. Harness trace behavior
7. Failure taxonomy behavior
8. Scorecard behavior
9. Provider / verification / repair integration
10. Result Surface behavior
11. Session / Continue behavior
12. Verifier coverage
13. Coupling guard
14. Reference scan findings from pi and GitNexus
15. Validation
16. Remaining risks
17. Next route recommendation
