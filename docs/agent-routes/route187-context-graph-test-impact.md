# Route 187: Context graph and test impact

## Goal

Upgrade targeted context packets into a bounded deterministic context graph with test-impact planning.

Routes 181-186 established:

- targeted context packets
- context discovery / budget / redaction
- Agent Plan facade
- Session / Result parity
- context-aware provider proposal
- command-driven verification repair loop

The current bottleneck is now context quality:

- Route 181 discovery is still mostly one-hop
- test relevance is heuristic
- plan quality cannot strongly explain impact scope
- provider proposals can consume context, but context is still narrow
- verification commands exist, but test-impact suggestions are weak

Route 187 should improve Reading and Planning without expanding write authority.

This route owns:

- bounded context graph for explicit targets
- deterministic import/export/call-site/test/docs expansion
- test-impact candidate planning
- context quality / coverage scoring
- verification command candidate suggestions
- replay-safe graph summaries
- Session / Continue / Result Surface support
- focused verifier gate for context graph and test impact

This is a read/plan route, not an edit execution route.

## Expected outcome

By the end of Route 187:

1. Given an explicit target file, the system can build a bounded context graph.
2. The graph can include direct imports, selected reverse call-site candidates, nearby tests, docs/readme references, and second-hop files under strict limits.
3. The graph records why each candidate was included or omitted.
4. The graph produces a test-impact plan with likely tests and verification command candidates.
5. Agent Plan can consume graph coverage and test-impact facts.
6. Provider proposal context can use graph summaries without raw content leakage.
7. Verification command planning can use test-impact candidates.
8. Session / Continue can summarize graph state and omitted candidates.
9. A focused verifier proves deterministic discovery, budgets, redaction, no-write behavior, and test-impact output.
10. No full-repo semantic index, LSP, embedding, provider call, or mutation path is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/tool-runtime-execution-flow.md`

Read only if touched:

- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/runtime-receipt-contract.md`

Do not read browser docs, old route docs, or edit expansion docs unless code directly requires them.

## Reference scan

Use references only for context graph, call-site/test discovery, task planning, verification candidate selection, and replay-safe trajectory patterns.

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

- file context selection
- import/export/context graph construction
- test selection heuristics
- verification command suggestion
- trajectory/session summaries
- eval/report shapes for context discovery

Do not copy full LSP integrations, embedding retrieval, hidden model context injection, full-repo semantic indexing, or autonomous planning loops.

## Owner modules

Primary owners:

- Workspace / File Context
- Agent Loop Planning

Collaborating owners:

- Harness / Eval
- Runtime / Verification
- Result Surface
- Session / Continue
- Provider / Model only as context consumer, not caller

Likely new files:

- `packages/ts-shell/src/orchestration/contextGraph.ts`
- `packages/ts-shell/src/orchestration/contextGraphDiscovery.ts`
- `packages/ts-shell/src/orchestration/contextGraphBudget.ts`
- `packages/ts-shell/src/orchestration/contextGraphScore.ts`
- `packages/ts-shell/src/orchestration/testImpactPlan.ts`
- `packages/ts-shell/src/orchestration/contextGraphResult.ts`
- `packages/ts-shell/src/orchestration/contextGraph.test.ts`
- `packages/ts-shell/src/orchestration/contextGraphDiscovery.test.ts`
- `packages/ts-shell/src/orchestration/contextGraphBudget.test.ts`
- `packages/ts-shell/src/orchestration/contextGraphScore.test.ts`
- `packages/ts-shell/src/orchestration/testImpactPlan.test.ts`

Likely touched files:

- `contextPacket.ts`
- `contextDiscovery.ts`
- `contextBudget.ts`
- `contextPlan.ts`
- `contextPacketResult.ts`
- `agentPlan.ts`
- `agentPlanContext.ts`
- `agentPlanProjection.ts`
- `agentPlanResult.ts`
- `providerEditContext.ts`
- `contextAwareProviderEdit.ts`
- `contextAwareProviderPrompt.ts`
- `verificationCommandPlan.ts`
- `verificationCommandResult.ts`
- `readInspectModule.ts`
- `workspaceFileContract.ts`
- `workspaceTargetProjection.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current context discovery and test planning

Before changing behavior, determine:

- how Route 181 context packet discovers imports/tests/docs/call-sites
- where discovery is one-hop only
- whether any reverse call-site or symbol candidate logic already exists
- how Agent Plan consumes context facts
- how verification command candidates are currently suggested
- how provider proposal context consumes packet facts
- what verifier currently proves about context planning

Summarize this audit in the final report.

### 2. Context graph model

Add `contextGraph.ts`.

Graph should include:

- graph id
- root target
- root packet id if available
- nodes
- edges
- included candidates
- omitted candidates
- source kind
- depth
- reason
- budget status
- confidence
- redaction status
- mutationAuthority: `not-granted`

Node kinds:

- root target
- direct import
- direct export / symbol source
- sibling file
- nearby test
- docs/readme
- reverse call-site candidate
- second-hop candidate
- omitted candidate

Edge kinds:

- imports
- exports-symbol
- calls-or-references
- tests
- documents
- sibling
- heuristic-related

Graph must not include raw full file contents or secrets.

### 3. Bounded graph discovery

Add `contextGraphDiscovery.ts`.

Discovery should be deterministic and bounded:

- depth max 2
- max total graph nodes
- max files read
- max bytes per file
- max call-site candidates
- max test candidates
- max docs candidates

Discovery sources:

- explicit target file
- parsed import path hints for TS/JS
- exported symbol / function / class names by regex or existing safe parser
- reverse textual references by bounded search
- sibling test naming conventions
- docs/readme near target and repo root
- package/script hints only if already safely available

Do not add LSP, embeddings, full-repo semantic search, or provider calls.

### 4. Budget and omission reasons

Add `contextGraphBudget.ts`.

Omission reasons:

- over-depth
- over-node-budget
- over-file-budget
- over-byte-budget
- unsupported-file-type
- binary-or-unreadable
- out-of-workspace
- secret-risk
- ambiguous-symbol
- duplicate-candidate
- low-confidence

Every omitted candidate must have a safe reason.

### 5. Context graph scoring

Add `contextGraphScore.ts`.

Score:

- root target confidence
- import coverage
- test coverage
- docs coverage
- call-site coverage
- omitted-risk level
- planning readiness

Readiness values:

- `context-ready`
- `needs-more-context`
- `budget-limited`
- `low-confidence`
- `unsupported`

This score should feed Agent Plan, not execute anything.

### 6. Test-impact plan

Add `testImpactPlan.ts`.

Given a context graph, produce:

- likely test files
- likely verification command candidates
- confidence
- missing test context
- suggested reads
- command readiness
- no-write evidence

Verification candidates should not execute commands. They only suggest commands for Route 186 verification command planning.

Suggested commands must respect existing allowlist boundaries.

### 7. Agent Plan integration

Update Agent Plan facade to consume context graph facts.

Agent Plan should surface:

- graph id
- graph readiness
- context coverage score
- test-impact summary
- suggested reads
- suggested verification
- missing facts
- plan confidence

Planning must not grant mutation authority.

### 8. Provider proposal context integration

Update context-aware provider proposal input to optionally consume context graph summaries.

Provider prompt/context builder may include:

- graph id
- selected related context summaries
- test-impact plan summary
- omitted reasons
- context readiness

Do not include raw full files or unbounded graph data.

If graph readiness is low, provider proposal should stop before provider call or mark review-only with missing-context warning according to existing route policy.

### 9. Verification command planning integration

Update verification command plan to optionally consume test-impact candidates.

Behavior:

- if test-impact has allowlisted candidate, mark candidate ready
- if candidate is not allowlisted, mark not-allowlisted
- if no test candidate, suggest missing verification
- do not expand command allowlist in this route

### 10. Result Surface integration

Add `contextGraphResult.ts`.

Terminal outcomes:

- context graph created
- context graph partial / budget-limited
- no related context found
- test-impact plan created
- verification candidates suggested
- needs more context
- unsupported graph discovery

Output should show:

- root target
- included node counts
- omitted counts and reasons
- test-impact summary
- suggested reads
- no-write status

No raw file content dumps.

### 11. Session / Continue integration

Session / Continue should preserve:

- graph id
- root target
- node counts
- important included candidates
- omitted reasons
- graph score
- test-impact summary
- suggested reads
- suggested verification
- no-write status

`/continue` should be able to:

- explain what context was discovered
- continue reading omitted candidates
- use test-impact plan for verification planning
- avoid raw file dumps

### 12. Focused verifier gate

Strengthen `scripts/verify-context-planning.mjs`.

Required coverage:

- explicit target builds context graph
- direct import included
- sibling test included
- docs/readme included
- bounded reverse call-site included
- second-hop candidate included within budget
- over-budget candidate omitted with reason
- ambiguous symbol omitted or marked low-confidence
- test-impact plan suggests candidate tests
- non-allowlisted command is not marked ready
- no mutation authority is granted
- raw content/secrets excluded
- continuation-safe graph summary present

### 13. Coupling guard

Do not implement graph discovery inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- runMvp requests context packet / graph through readInspectModule facade
- context graph modules own discovery/scoring/test-impact
- Agent Plan consumes graph facts
- Result Surface / Session parity handle output

No broad agent-loop rewrite.

### 14. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if context/planning risk changes
- module backlog if route status is tracked
- tool-runtime flow docs only if verification candidate semantics change

No large architecture doc.

## Boundaries

Hard boundaries:

- no mutation behavior change
- no edit capability expansion
- no provider/model calls
- no default real-provider calls
- no command execution
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

- context graph tests
- graph discovery tests
- budget/scoring tests
- test-impact plan tests
- Route 181 context packet regression tests
- Route 182 agent plan regression tests
- Route 184 context-aware provider proposal regression tests if touched
- Route 186 verification command planning regression tests if touched
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
2. Current context/test-impact audit
3. Context graph model
4. Discovery behavior
5. Budget/scoring behavior
6. Test-impact planning behavior
7. Agent Plan integration
8. Provider context integration
9. Verification command planning integration
10. Result Surface behavior
11. Session / Continue behavior
12. Verifier coverage
13. Coupling guard
14. Validation
15. Remaining risks
16. Next route recommendation
