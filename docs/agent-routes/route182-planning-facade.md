# Route 182: Planning facade

## Goal

Extract a real Agent Loop planning facade from `runMvpIntegratedFlow.ts` and connect Route 181 targeted context packets into planning decisions.

Route 181 added deterministic context packets, context discovery, planning summaries, continuation-safe evidence, and a focused context verifier. That improved Reading / Context Gathering, but it also risks making `runMvpIntegratedFlow.ts` heavier if future planning logic keeps landing there.

Route 182 should now reduce that coupling:

- move intent-to-plan and context-aware planning projection into an Agent Loop planning facade
- keep `runMvpIntegratedFlow.ts` as a thin composition root
- make `WorkflowTaskPlan` actually useful as a planning boundary
- connect context packet summaries to plan confidence / missing-context / suggested-read surfaces
- preserve existing edit/provider/browser/session behavior
- add focused plan-quality tests and verifier coverage

This route improves Analysis / Planning without expanding edit execution.

## Expected outcome

By the end of Route 182:

1. `runMvpIntegratedFlow.ts` delegates context-aware planning decisions to a facade instead of embedding new logic.
2. `WorkflowTaskPlan` or an adjacent planning facade owns plan confidence, missing context, suggested reads, verification intent, and capability readiness.
3. Context packets from Route 181 can be consumed as planning input.
4. Complex requests can produce structured `needs-more-context` or `plan-ready` surfaces.
5. Result Surface can render planning stops without generic unsupported wording.
6. Session / Continue can preserve plan evidence without raw file content.
7. Focused tests prove planning decisions without requiring broad execution routes.
8. Existing edit execution behavior remains unchanged.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`

Read only if touched:

- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/resultmapper-module-extraction.md`

Do not load browser/provider/edit-history docs unless code points there.

## Reference scan

Use references only for planning boundary, task plan, context-to-plan, trajectory, and result-surface patterns.

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
- opencode: max 10 files
- gemini-cli: max 8 files
- OpenHands: max 8 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- query/turn planning boundaries
- task/plan object shape
- context-to-action decision surfaces
- tool/read/edit planning separation
- missing-context / need-more-info UX
- trajectory/report evidence for plans

Do not copy autonomous planning loops, hidden chain-of-thought storage, broad model planners, or provider-driven execution.

## Owner modules

Primary owner:

- Agent Loop

Collaborating owners:

- Workspace / File Context
- Result Surface
- Session / Continue
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/orchestration/agentPlan.ts`
- `packages/ts-shell/src/orchestration/agentPlanProjection.ts`
- `packages/ts-shell/src/orchestration/agentPlanResult.ts`
- `packages/ts-shell/src/orchestration/agentPlanContext.ts`
- `packages/ts-shell/src/orchestration/agentPlan.test.ts`
- `packages/ts-shell/src/orchestration/agentPlanProjection.test.ts`
- `packages/ts-shell/src/orchestration/agentPlanResult.test.ts`
- `packages/ts-shell/src/orchestration/agentPlanContext.test.ts`

Likely touched files:

- `workflowTaskPlanner.ts`
- `runMvpIntegratedFlow.ts`
- `readInspectModule.ts`
- `contextPacket.ts`
- `contextPlan.ts`
- `contextPacketResult.ts`
- `resultSurfaceModule.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`

Touch edit/provider/browser modules only if regression tests expose a direct integration need.

## Implementation tasks

### 1. Audit current planning responsibility

Before changing behavior, determine:

- where intent classification currently happens
- where `WorkflowTaskPlan` is built or populated
- where context packet output is consumed
- where missing-context / unsupported decisions are made
- where edit/provider/browser/read branches make planning decisions
- which decisions are safe to extract as pure projections

Summarize in the final report.

### 2. Define Agent Plan boundary

Add `agentPlan.ts`.

Plan object should include:

- plan id
- owner capability
- requested action kind
- target summary
- context packet ids
- context completeness
- plan confidence: high / medium / low
- execution readiness: ready / needs-more-context / stopped / unsupported
- missing facts
- suggested reads
- suggested verification
- safe evidence markers
- mutation authority: not-granted unless delegated execution route grants it
- redaction status

This is a planning projection, not execution authority.

### 3. Context-to-plan projection

Add `agentPlanContext.ts`.

Given a context packet / context plan:

- summarize known context
- identify missing context
- classify whether task can proceed
- suggest next reads
- suggest verification candidates
- preserve replay-safe evidence

Do not read new files directly from this helper. It consumes context facts.

### 4. Plan projection and classification

Add `agentPlanProjection.ts`.

Classify current common cases:

- explicit read / explain ready
- explicit target context packet ready
- broad edit needs more context
- edit exact mapping ready for existing edit lane
- generated/provider proposal needs review
- verification planning available
- unsupported broad/fuzzy request
- missing target
- ambiguous target

Keep this deterministic and testable.

### 5. Result Surface integration

Add `agentPlanResult.ts`.

Terminal planning outcomes:

- plan ready
- needs more context
- missing target
- ambiguous target
- unsupported planning request
- context packet budget-limited
- suggested reads available
- verification needed

No planning-only state may appear as execution success.

### 6. Thin runMvp composition

Update `runMvpIntegratedFlow.ts` only to call the planning facade.

Allowed changes:

- replace inline planning/context decision logic with facade calls
- keep current branch order unless tests prove it needs a small correction
- preserve current behavior for edit/provider/browser execution
- do not move writer/provider/browser internals into the plan facade

Goal: reduce or cap runMvp planning complexity, not rewrite the loop.

### 7. Session / Continue integration

Session / Continue should preserve:

- plan id
- owner capability
- context packet ids
- missing facts
- suggested reads
- readiness
- confidence
- do-next text

Do not persist raw file content, raw provider output, raw DOM, secrets, or hidden reasoning.

`/continue` should be able to explain:

- why planning stopped
- what context was inspected
- what should be read next
- whether execution was ready or blocked

### 8. Context planning verifier

Strengthen `scripts/verify-context-planning.mjs`.

Required coverage:

- context packet feeds plan summary
- broad edit with explicit target produces needs-more-context instead of generic unsupported
- suggested reads are present when deterministic candidates exist
- no mutation authority is granted by planning
- plan evidence is continuation-safe
- raw content excluded
- runMvp path stays thin / behavior compatible through focused output markers

Do not create a broad verifier framework.

### 9. Coupling guard

Add a simple source-level or test-level guard if clean:

- ensure new context/planning helpers are not implemented inline in `runMvpIntegratedFlow.ts`
- ensure planning tests target `agentPlan*` modules directly
- optionally record a comment or docs note that runMvp is composition root for planning facade only

Do not add brittle line-count gates.

### 10. Docs update

Update long-lived docs only where ownership changes:

- implementation manifest / recipes if new facades or flows are added
- foundation risk register if planning risk changes
- module backlog if route status is tracked

No large architecture doc.

## Boundaries

Hard boundaries:

- no edit execution expansion
- no provider/model calls
- no browser work
- no autonomous planner
- no hidden chain-of-thought persistence
- no LSP integration
- no embedding/vector search
- no full-repo semantic index
- no workspace authority weakening
- no mutation authority from planning
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- agent plan tests
- plan projection tests
- context-to-plan tests
- plan result tests
- Route 181 context packet/discovery/budget regression tests
- read/inspect regression tests if touched
- Session / Continue tests if touched
- Result Surface tests if touched
- context planning verifier
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Run edit closeout only if edit execution files are touched.

## Final report

Include:

1. What changed
2. Current planning responsibility audit
3. Agent plan boundary
4. Context-to-plan behavior
5. Result Surface behavior
6. runMvp coupling reduction
7. Session / Continue behavior
8. Verifier coverage
9. Validation
10. Remaining risks
11. Next route recommendation
