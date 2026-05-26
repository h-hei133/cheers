# Route 227G: Tool Ecosystem and External Capabilities

## Goal

Upgrade the agent's external tool ecosystem without weakening the proof-carrying runtime.

Route227F completes repair iteration product loop.

Route227G must upgrade MCP, browser/tool observations, and external tool receipts so the agent can use tools beyond code editing while still preserving evidence truthfulness.

Target chain:

tool intent
-> permission / policy check
-> tool call or blocked decision
-> runtime receipt
-> local vs external evidence classification
-> tool result relevance
-> context / planning / verification / result integration
-> session continuation evidence
-> final verdict with not-proven claims

Expected final status: COMPLETE.

This route must not turn local fixtures or deterministic mocks into external capability claims. It must build a controlled tool evidence layer that can be used by the rest of the agent.

## Current gap

The core coding loop has improved across Route227A-F:

- live provider exact proposal contract
- context/planning
- planning-to-patch proposal orchestration
- edit engine expansion
- verification intelligence
- repair iteration

But external capabilities remain weak or under-proven:

- MCP support may be local/focused rather than product/external proven
- browser support may be scaffold or observation-only
- tool results may not have unified receipts
- local deterministic fixtures can be confused with external readiness
- tool failures may not map into result/session truthfulness
- tool output may be treated as fact without provenance
- tool results may not feed planning, context, verification, or repair in a structured way

Route227G must make external tool use evidence-aware and product-visible.

## Capability to build

Build a controlled external tool capability layer.

Required capabilities:

1. Tool intent and policy classification
   Classify tool requests:
   - code/workspace tool
   - command/runtime tool
   - MCP local tool
   - MCP external tool
   - browser observation
   - browser action
   - unsupported external action
   - blocked unsafe action

2. Local vs external evidence separation
   Every tool result must record:
   - evidence source
   - local deterministic / fixture / focused / external-live
   - tool name
   - provider/server identity if applicable
   - permission state
   - execution state
   - receipt id
   - failure class
   - not-proven claims

3. MCP capability layer
   Improve MCP handling:
   - discover or represent available MCP tools
   - classify local vs external MCP
   - execute at least one safe local MCP/tool case if available
   - classify unavailable external MCP honestly
   - preserve receipt and result relevance
   - no fake external readiness

4. Browser capability layer
   Improve browser/tool observation:
   - controlled observation task
   - browser action policy
   - page/result receipt
   - failure classification
   - no browser side effect without explicit policy
   - local/mock browser evidence cannot be external-live

5. Tool receipt unification
   Tool calls should produce runtime receipts:
   - input summary
   - policy decision
   - execution state
   - output summary
   - error/failure class
   - relevance to task
   - redaction status
   - session continuity fields

6. Integration into context/planning
   Tool outputs can become:
   - context evidence
   - planning facts
   - missing-facts resolver
   - verification evidence
   But only if provenance and relevance are recorded.

7. Integration into verification/result/session
   Tool outcomes must affect verdict truthfully:
   - tool success can support a claim only if relevant
   - tool unavailable becomes blocked/partial
   - local fixture success cannot become external-live success
   - unsafe or unsupported tool action remains blocked
   - session summary preserves tool evidence

8. Product path visibility
   Real CLI/product path should show:
   - requested tool
   - permission/policy decision
   - receipt status
   - source classification
   - result relevance
   - final effect on planning/verification/verdict

## Required subagents

Use focused subagents.

Before implementation:

1. Tool runtime subagent
   Inspect current tool runtime, runtime receipts, command/tool execution, policy result boundaries, and result/session projection.
   Report the smallest unified tool receipt shape.

2. MCP subagent
   Inspect current MCP capability, local/external distinction, tool discovery/execution, and failure taxonomy.
   Report product-safe MCP upgrade path.

3. Browser subagent
   Inspect browser module, browser transaction/observation scaffolds, and policy boundaries.
   Report safe browser observation/action capability path.

After implementation:

1. Tool receipt audit subagent
   Check receipt provenance, redaction, relevance, and session persistence.

2. External/local evidence audit subagent
   Check local fixture/focused/default evidence cannot be labeled external-live.

3. Policy/result audit subagent
   Check unsupported/blocked tool actions remain truthful and do not become success.

Each subagent should return short findings, changed seams, risks, and audit result.

## Reference policy

No broad reference scan.

Reference pool under /home/wang/projects:

- playwright-mcp
- stagehand
- OpenHands
- opencode
- inspect_ai
- gemini-cli

Suggested mapping:

- playwright-mcp: browser/MCP tool patterns
- stagehand: browser task abstraction
- OpenHands: action/observation tool trajectory
- opencode: MCP/tool permission and tool execution flow
- inspect_ai: tool transcript/evidence reporting
- gemini-cli: CLI tool invocation and redaction patterns

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local tool/runtime substrate was sufficient.

## Phases

### Phase 1: Tool ecosystem audit and capability matrix

Goal:

Map current MCP/browser/tool support and prevent overclaim.

Do:

- inspect tool runtime execution flow
- inspect runtime receipt contract
- inspect policy/tool result boundary
- inspect MCP modules
- inspect browser modules
- inspect result/session projection
- inspect CLI/product tool visibility
- build capability matrix

Capability matrix:

1. local deterministic tool
2. external MCP available
3. external MCP unavailable
4. browser observation
5. browser action requiring policy
6. unsupported tool action
7. tool failure
8. tool output used as context
9. tool output used as verification

Focused audit:

- local fixture is not external-live
- tool result is not automatically task truth
- unsupported external action remains blocked

### Phase 2: Unified tool receipt model

Goal:

Create or strengthen tool receipt projection.

Do:

- define a shared tool receipt shape
- record source classification
- record policy/permission state
- record execution state
- record output summary
- record failure class
- record relevance
- record redaction status
- preserve receipt in result/session surface

Required receipt fields:

- receiptId
- toolKind
- toolName
- evidenceSource
- policyDecision
- executionStatus
- failureClass
- outputSummary
- relevance
- redactionStatus
- sessionCarryForward
- notProvenClaims

Product evidence:

- at least one tool receipt appears in product result/session surface
- blocked tool receipt appears as blocked, not success
- failure class is visible

Focused audit:

- no sensitive output leakage
- receipt is runtime-derived, not marker-only
- session summary preserves receipt truth

### Phase 3: MCP local/external capability

Goal:

Improve MCP evidence classification and safe execution.

Do:

- classify MCP tool source as local deterministic, focused, or external-live
- expose available MCP tool metadata if current substrate supports it
- run or simulate only policy-safe local MCP/tool case if available
- classify external MCP unavailable honestly if not configured
- preserve server/tool identity where safe
- record receipt and relevance
- do not claim external readiness from local fixtures

Product evidence:

- one MCP/local tool task produces a receipt
- one external unavailable/blocked case is reported honestly
- local evidence remains local/focused, not external-live

Focused audit:

- MCP unavailable does not become success
- local tool success does not become external capability
- server/tool identifiers do not leak secrets

### Phase 4: Browser observation and action policy

Goal:

Improve browser capability without unsafe side effects.

Do:

- support controlled browser observation if current substrate allows
- classify browser action vs observation
- require explicit policy for side-effect actions
- record page/result receipt
- classify browser unavailable/network/tool errors
- keep local/mock browser evidence separate
- integrate observation as context evidence only with provenance

Product evidence:

- one browser observation task produces a product receipt or honest blocked status
- one browser action requiring side effect is blocked or requires explicit policy
- local/mock evidence does not become external-live

Focused audit:

- browser side effects not performed without policy
- observation does not become verification unless task-relevant
- local browser scaffold is not product external proof

### Phase 5: Tool output integration into planning and verification

Goal:

Make tool output useful but not overtrusted.

Do:

- feed relevant tool observations into context/planning facts
- feed task-relevant tool evidence into verification when appropriate
- record relevance and confidence
- keep tool output as claim unless verified
- preserve missing-facts when tool evidence is insufficient
- update result/session projection

Product evidence:

- one task uses tool receipt as planning/context evidence
- one task uses tool receipt as verification support or rejects it as insufficient
- unsupported/unavailable tool produces actionable missing facts

Focused audit:

- tool output is not automatically ground truth
- irrelevant tool success cannot support task success
- not-proven claims remain visible

### Phase 6: Product CLI/session surface

Goal:

Make tool evidence user-visible.

Do:

- update product surface if needed to show tool request, policy, receipt, relevance, and verdict effect
- preserve tool receipts in session continuation
- summarize without leaking sensitive tool output
- keep local/external labels visible

Product evidence:

- CLI/product path shows at least one tool receipt
- session continuation carries tool evidence truthfully
- blocked tool action remains blocked on continuation

Focused audit:

- UX does not hide local/focused evidence level
- continuation does not upgrade blocked tool result
- redaction remains intact

### Phase 7: Route227G report and handoff to Route227H

Create:

docs/implementation-context/route227g-tool-ecosystem-and-external-capabilities-report.json

Report must include:

- schemaVersion
- route=route227g
- routeType=tool-ecosystem-capability
- finalStatus
- primaryEvidence
- toolTasksAttempted
- mcpEvidence
- browserEvidence
- toolReceiptEvidence
- planningIntegrationEvidence
- verificationIntegrationEvidence
- sessionContinuationEvidence
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims
- referenceAdoption if references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227g-tool-ecosystem-and-external-capabilities-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route227g verifier only if useful. It must drive product tool path or remain secondary.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-command-only-bypass-negative-control
- frozen-session-continuity-result-truth
- frozen-unsupported-broad-task-negative-control

Recommended if cheap:

- frozen-lower-bound-stable-selected-workspace-authority-case

These protect result truth while external tool capability expands.

## Completion criteria

Route227G is COMPLETE only if:

- product path consumes unified tool receipts
- at least 4 tool tasks are attempted
- at least 1 MCP/local tool task produces a receipt or honest unavailable classification
- at least 1 browser observation/action-policy task produces a receipt or honest blocked classification
- at least 1 tool receipt is used as context/planning evidence with provenance
- at least 1 tool receipt is used or rejected as verification evidence with relevance recorded
- local/focused/default evidence is never labeled external-live
- unsupported/unsafe tool actions remain blocked
- tool failures have clear failure classes
- session/result surface preserves tool evidence and not-proven claims
- route-local demos are not primary evidence
- Route221 report gate passes
- final report justifies COMPLETE from product tool evidence

If MCP/browser product capability cannot be safely executed or represented, final status must be PARTIAL or BLOCKED with exact reason.

## Scope

Allowed:

- MCP capability classification
- browser observation/action policy
- unified tool receipt projection
- tool runtime receipt updates
- tool result integration into context/planning
- tool result integration into verification/result/session
- product CLI/session surface for tool evidence
- report artifact
- focused tests for tool receipts/MCP/browser/local-vs-external/result projection

Avoid unless necessary:

- live provider work
- edit engine work
- verification command expansion already owned by Route227E
- large CLI refactor
- large SessionManager refactor
- broad Claim Ledger rewrite

Not allowed:

- external tool fixture as external-live proof
- browser side effect without policy
- MCP local fixture as external readiness
- tool output as unchecked truth
- irrelevant tool success as verification proof
- arbitrary shell expansion
- production workspace default write
- new dependencies unless already approved by project policy
- leaking secrets or sensitive tool output
- route-local helper success as primary COMPLETE evidence

## Phase commit policy

Codex may commit a green phase to keep worktree readable.

Commit rules:

- commit message starts with route227g:
- do not push
- do not commit failing states
- do not commit audit residue
- final report lists phase commits

Commits are optional, not mandatory.

## Final report

Do not paste full stdout.

Do not print secrets or excessive tool output.

Include:

1. Final status
2. Phase commits
3. Tool capability matrix
4. Unified tool receipt behavior
5. MCP behavior
6. Browser behavior
7. Tool context/planning integration
8. Tool verification integration
9. Product/session surface behavior
10. Local vs external evidence classification
11. Frozen tasks attempted
12. Negative controls
13. Route221 gate result
14. Reference adoption table or not-inspected statement
15. Validation commands with pass/fail
16. Files changed
17. Remaining not-proven claims
18. What capability increased
19. What lower-bound safety was preserved
20. Next route: docs/agent-routes/route227h-cli-session-product-experience.md

## Next route

After Route227G is complete, continue with:

docs/agent-routes/route227h-cli-session-product-experience.md

Route227H will turn the accumulated capabilities into a strong user-facing CLI/session experience: clear plan, proposal, apply, verification, repair, tool receipts, final verdict, approval UX, continuation, and human-readable not-proven claims.
