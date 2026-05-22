# Route 189: Code intelligence graph

## Goal

Turn the Route 187 bounded context graph into a reusable code intelligence graph trace with impact-query and staleness-aware planning support.

Routes 181-188 established:

- targeted context packets
- bounded context graph
- test-impact planning
- Agent Plan facade
- context-aware provider proposal
- command-driven verification repair loop
- plan quality gate
- harness trace / scorecard / failure taxonomy

The current gap is that context graph data is still mostly task-local. Route 189 should make code intelligence facts reusable, queryable, and staleness-aware without introducing a full Graph RAG backend.

This route owns:

- code intelligence graph trace
- bounded graph fact store
- impact query facade
- staleness / freshness checks
- symbol/import/test/docs/call-site relationship normalization
- context graph reuse
- plan quality integration
- provider proposal context integration
- verification command planning integration
- verifier coverage

This is a read/plan substrate route. It must not add mutation power.

## Expected outcome

By the end of Route 189:

1. Context graph facts can be normalized into a reusable code intelligence trace.
2. The trace can represent files, symbols, imports, call-sites, tests, docs, and verification candidates.
3. The trace can answer bounded impact queries for an explicit target.
4. Impact query results can feed Agent Plan and Plan Quality.
5. Provider proposal context can consume impact summaries.
6. Verification command planning can consume test-impact and verification candidate summaries.
7. Staleness/freshness checks prevent reuse of stale graph facts without warning.
8. Session / Continue can summarize graph trace and impact query evidence.
9. Verifier coverage proves deterministic graph trace, impact query, staleness handling, no-write behavior, and redaction.
10. No Graph DB, MCP backend, embeddings, full-repo semantic index, LSP integration, provider call, command execution, or mutation behavior is introduced.

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

Do not read browser docs, old route docs, or edit expansion docs unless code directly requires them.

## Reference scan

Use only references that are useful for this route.

Primary:

- `/home/wang/projects/GitNexus`

Secondary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/inspect_ai`

Do not read `/home/wang/projects/pi` unless harness scorecard/report behavior is directly touched.

Budget:

- GitNexus: max 16 files
- ClaudeCode: max 6 files
- opencode: max 6 files
- gemini-cli: max 6 files
- OpenHands + Inspect AI: max 6 files total

Focus:

- GitNexus: graph/index/query shape, file/symbol/call/test relationships, impact query, stale/refresh concepts, code intelligence summaries
- ClaudeCode/opencode/gemini-cli: context selection and task planning boundaries
- OpenHands/Inspect AI: event/report shape only if needed

Do not copy:

- GitNexus MCP server
- persistent graph database
- external dependencies
- embeddings/vector retrieval
- full repository semantic index
- package setup
- autonomous planning/edit loops

## Owner modules

Primary owners:

- Workspace / File Context
- Agent Loop Planning

Collaborating owners:

- Harness / Eval
- Result Surface
- Session / Continue
- Provider / Model as context consumer only
- Runtime / Verification as verification-candidate consumer only

Likely new files:

- `packages/ts-shell/src/orchestration/codeGraphTrace.ts`
- `packages/ts-shell/src/orchestration/codeGraphFacts.ts`
- `packages/ts-shell/src/orchestration/codeGraphQuery.ts`
- `packages/ts-shell/src/orchestration/codeGraphStaleness.ts`
- `packages/ts-shell/src/orchestration/codeGraphImpact.ts`
- `packages/ts-shell/src/orchestration/codeGraphResult.ts`
- `packages/ts-shell/src/orchestration/codeGraphTrace.test.ts`
- `packages/ts-shell/src/orchestration/codeGraphFacts.test.ts`
- `packages/ts-shell/src/orchestration/codeGraphQuery.test.ts`
- `packages/ts-shell/src/orchestration/codeGraphStaleness.test.ts`
- `packages/ts-shell/src/orchestration/codeGraphImpact.test.ts`

Likely touched files:

- `contextGraph.ts`
- `contextGraphDiscovery.ts`
- `contextGraphScore.ts`
- `contextGraphPlanning.ts`
- `testImpactPlan.ts`
- `contextGraphResult.ts`
- `contextPacket.ts`
- `agentPlan.ts`
- `agentPlanContext.ts`
- `agentPlanProjection.ts`
- `agentPlanResult.ts`
- `planQuality.ts`
- `planQualityScore.ts`
- `planQualityGate.ts`
- `planQualityResult.ts`
- `contextGraphReadiness.ts`
- `contextAwareProviderEdit.ts`
- `contextAwareProviderPrompt.ts`
- `verificationCommandPlan.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current graph reuse gap

Before changing behavior, determine:

- how Route 187 context graph facts are represented
- whether graph facts can currently be reused across planning/provider/verification surfaces
- whether staleness or freshness is tracked
- whether impact queries exist or are implicit
- how test-impact facts flow into verification command planning
- how plan quality consumes context graph facts
- what verifier currently proves about graph discovery and no-write behavior

Summarize this audit in the final report.

### 2. Code graph fact model

Add `codeGraphFacts.ts`.

Normalize safe graph facts:

- file node
- symbol node
- import edge
- export edge
- call/reference edge
- test edge
- docs edge
- verification candidate edge
- ownership/source edge
- omitted candidate fact
- staleness fact

Each fact should carry:

- fact id
- source context graph id
- safe label
- source kind
- confidence
- freshness / staleness where available
- redaction status
- omitted reason when applicable

No raw full file content.

### 3. Code graph trace

Add `codeGraphTrace.ts`.

Trace should include:

- trace id
- root target
- source context packet id
- source context graph id
- fact ids
- node counts
- edge counts
- included/omitted summaries
- staleness summary
- impact readiness
- redaction status
- mutationAuthority: `not-granted`

This is not a persistent global index.

### 4. Bounded graph query facade

Add `codeGraphQuery.ts`.

Query types:

- `impact-for-target`
- `tests-for-target`
- `call-sites-for-symbol`
- `imports-for-target`
- `docs-for-target`
- `verification-candidates-for-target`
- `omitted-context-for-target`

Constraints:

- all queries bounded by existing trace/context graph facts
- no full repository scan beyond Route 187 boundaries
- no provider/model call
- no graph DB
- no embeddings
- no mutation authority

### 5. Staleness / freshness

Add `codeGraphStaleness.ts`.

Staleness checks should classify:

- fresh
- stale-target-changed
- stale-related-file-changed
- unknown-freshness
- missing-file
- out-of-workspace
- unsupported

Use safe file facts already available or cheap filesystem metadata if existing patterns allow it.

Stale graph facts should not be used as high-confidence plan evidence.

### 6. Impact query

Add `codeGraphImpact.ts`.

Given an explicit target, produce:

- affected symbol summary
- likely call-sites
- likely tests
- docs references
- verification candidates
- omitted / stale context
- confidence
- suggested reads
- suggested verification
- plan-quality contribution

No mutation.

### 7. Result Surface

Add `codeGraphResult.ts`.

Terminal outcomes:

- code graph trace created
- impact query ready
- impact query partial / budget-limited
- stale graph facts detected
- no impact candidates found
- test-impact candidates available
- verification candidates available
- needs more context

Output should show:

- root target
- node/edge counts
- impact summary
- stale/omitted reasons
- suggested reads
- suggested verification
- no-write status

No raw file content dumps.

### 8. Agent Plan / Plan Quality integration

Update Agent Plan and Plan Quality to consume code graph trace / impact facts.

Agent Plan should surface:

- code graph trace id
- impact query id
- impact readiness
- likely affected files/tests
- suggested reads
- suggested verification

Plan Quality should use:

- graph trace freshness
- impact confidence
- test-impact confidence
- omitted risk
- stale risk

Plan quality must downgrade stale or budget-limited graph facts.

### 9. Provider proposal context integration

Update context-aware provider prompt/context builder to consume code graph impact summaries.

Allowed:

- trace id
- impact summary
- selected related file summaries
- likely tests
- docs references
- omitted reasons

Disallowed:

- raw graph dump
- raw full files
- secrets
- provider config paths
- hidden reasoning

Provider proposal should stop or mark review-only if graph trace is stale/low-confidence according to plan quality.

### 10. Verification command planning integration

Update verification command plan to consume impact query verification candidates.

Behavior:

- allowlisted candidate can become ready
- non-allowlisted candidate remains not-ready
- stale test-impact downgrades readiness
- missing test-impact suggests further context discovery
- no command execution in this route

### 11. Session / Continue integration

Session / Continue should preserve:

- code graph trace id
- impact query id
- root target
- graph freshness
- affected file/test summaries
- omitted/stale reasons
- suggested reads
- suggested verification
- no-write status

`/continue` should be able to explain:

- what graph facts were known
- what impact candidates exist
- which graph facts were stale or omitted
- what to read next
- what verification candidates are suggested

### 12. Verifier coverage

Strengthen `scripts/verify-context-planning.mjs`.

Required coverage:

- context graph facts normalize into code graph trace
- impact query returns likely tests for explicit target
- call-site query returns bounded candidates
- docs query returns bounded references
- stale target downgrades readiness
- stale related file produces safe warning
- non-allowlisted verification candidate remains not-ready
- provider context receives impact summary without raw content
- plan quality consumes impact/staleness facts
- Session / Continue preserves trace summary
- no mutation authority is granted
- raw content/secrets excluded
- result-contract compatibility

### 13. Coupling guard

Do not implement code graph query logic inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- Route 187 context graph produces facts
- code graph trace normalizes facts
- impact query consumes trace
- Agent Plan / Plan Quality / Provider / Verification consume impact summaries
- Result Surface / Session parity render evidence

No broad agent-loop rewrite.

### 14. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if code intelligence risk changes
- module backlog if route status is tracked
- tool-runtime flow docs only if verification candidate semantics change

No large architecture doc.

## Boundaries

Hard boundaries:

- no mutation behavior change
- no edit capability expansion
- no provider/model calls
- no command execution behavior change
- no command allowlist expansion
- no browser work
- no LSP integration
- no embedding/vector search
- no full-repo semantic index
- no persistent Graph DB
- no MCP backend
- no external dependencies
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

- code graph fact tests
- graph trace tests
- query tests
- staleness tests
- impact tests
- context graph regression tests
- test-impact plan regression tests
- Agent Plan regression tests
- Plan Quality regression tests
- provider context regression tests
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
2. Current graph reuse audit
3. Code graph fact model
4. Code graph trace behavior
5. Query facade behavior
6. Staleness behavior
7. Impact query behavior
8. Agent Plan / Plan Quality integration
9. Provider context integration
10. Verification planning integration
11. Result Surface behavior
12. Session / Continue behavior
13. Verifier coverage
14. Coupling guard
15. Reference scan findings from GitNexus
16. Validation
17. Remaining risks
18. Next route recommendation
