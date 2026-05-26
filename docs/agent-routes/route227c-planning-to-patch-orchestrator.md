# Route 227C: Planning-to-Patch Orchestrator

## Goal

Turn stronger planning output into validated patch/proposal handoff.

Route227A improves live provider exact proposal capability.
Route227B improves context, planning, code graph, memory, test adjacency, and edit target ranking.

Route227C must connect those upstream capabilities to patch generation and proposal selection.

Target chain:

planning result
-> edit targets
-> proposal source selection
-> deterministic exact proposal or live provider proposal or repair proposal
-> proposal normalization
-> output validation
-> anchor classification
-> review surface
-> authority-required handoff
-> existing apply backend readiness

Expected final status: COMPLETE.

This route must solve the old gap:

"We know what file and behavior to change, but cannot reliably produce a usable proposal."

Do not close this route with only planning text or review-only display. It must produce validated proposal handoff for multiple proposal sources.

## Current gap

The project currently has:

- Context Engine and Planning Runtime
- selected workspace apply backend
- deterministic exact proposal builder
- live provider proposal path
- repair proposal path
- exact hunk apply backend
- task-relevant verification dispatch
- anti-false-success gates

But planning-to-patch is still fragmented:

- planning output can stop at edit target or review text
- deterministic proposals work only for narrow oldText/newText cases
- live provider proposals can fail output contract or anchor
- repair proposals are separate from normal proposal handoff
- proposal source selection is not a first-class product decision
- review surface may not clearly explain proposal source, anchor quality, and authority requirements
- proposal readiness can be confused with mutation authority

Route227C must create a clear proposal orchestrator that can choose, normalize, validate, and hand off proposals without claiming apply.

## Capability to build

Build or strengthen a Planning-to-Patch Orchestrator.

Required capabilities:

1. Proposal source selection
   Choose among:
   - deterministic-from-product-read-evidence
   - live-provider exact proposal
   - repair-from-failure-evidence
   - review-only/manual proposal
   - unsupported / missing facts

2. Deterministic exact proposal expansion
   From planning target and read evidence:
   - locate unique oldText
   - generate newText where deterministic rule exists
   - reject multiple or missing matches
   - support at least one create-file proposal if Route227D can later apply it
   - emit unsupported for delete/move/broad if not ready

3. Live provider proposal handoff
   Consume Route227A output:
   - valid-exact-single-target
   - review-only
   - invalid-format
   - anchor failure
   - provider-output-insufficient
   Route227C should not re-call provider unless required by product path; it should orchestrate provider proposal results.

4. Repair proposal integration
   Treat repair proposal as a proposal source:
   - derived from failure evidence
   - no-write by default
   - requires separate repair confirmation
   - never counted as repair success

5. Proposal normalization
   Normalize proposal shapes into a common product structure:
   - target files
   - operation type
   - oldText/newText or create content
   - reason
   - verification intent
   - proposal source
   - redaction status
   - risk / unsupported operations

6. Anchor classification
   Classify:
   - exact-ready
   - review-only
   - stale-read
   - target-missing
   - old-text-not-found
   - old-text-multiple-matches
   - unsupported-operation
   - unsafe-operation

7. Review surface
   Product path should show:
   - proposal source
   - target files
   - operation type
   - anchor quality
   - why authority is required
   - verification intent
   - not-proven claims
   Do not print raw provider output, API keys, or private paths.
   Avoid printing oldText/newText from live provider unless current project redaction policy explicitly allows it.

8. Handoff readiness
   Output must tell downstream routes:
   - ready-for-review
   - ready-for-authority
   - ready-for-apply
   - blocked
   - unsupported
   But ready-for-apply still requires explicit authority before actual mutation.

## Required subagents

Use focused subagents.

Before implementation:

1. Proposal source subagent
   Inspect deterministic proposal, live provider proposal, repair proposal, and planning execution seams.
   Report the smallest unified product interface.

2. Anchor and normalization subagent
   Inspect provider anchoring, exact hunk proposal, proposal hunk-set route, and oldText/newText validation.
   Report normalization shape and failure classification.

3. Product path subagent
   Inspect CLI/product planning path and review surface.
   Report how proposal orchestration becomes user-visible without route-local-only success.

After implementation:

1. Anchor/authority audit subagent
   Check proposal readiness never implies mutation authority.

2. Source/provenance audit subagent
   Check deterministic/live/repair/manual proposal sources are labeled and cannot be confused.

3. Product path audit subagent
   Check real product path consumes the orchestrator and report evidence is not route-local-only.

Each subagent should return short findings, changed seams, risks, and audit result.

## Reference policy

No broad reference scan.

Reference pool under /home/wang/projects:

- mini-swe-agent
- OpenHands
- opencode
- gemini-cli
- inspect_ai

Suggested mapping:

- mini-swe-agent: minimal issue -> patch loop
- OpenHands: action/edit proposal trajectory
- opencode: tool permission and edit proposal flow
- gemini-cli: model-to-edit prompt and context usage
- inspect_ai: proposal/verdict evidence classification

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local Route227A/B and existing proposal seams were sufficient.

## Phases

### Phase 1: Proposal seam audit and baseline

Goal:

Identify all current proposal sources and where they diverge.

Do:

- inspect planningRuntimeProductExecution
- inspect planningRuntimeProductProposal
- inspect deterministic proposal builder
- inspect live provider proposal path from Route227A / Route226
- inspect repair proposal path from Route222B / Route227F-related seams
- inspect providerAnchoredProposal, proposalHunkSetRoute, editProposalApply, target-set route
- inspect real CLI/product review surface
- create baseline task pack for proposal handoff

Baseline tasks:

1. deterministic single-file update
2. live provider proposal task if Route227A succeeded
3. repair proposal from failure evidence
4. multi-file proposal shape
5. unsupported broad/delete/move task
6. stale-read or oldText missing negative case

Focused audit:

- no proposal source can claim apply
- exact-ready does not imply authority
- route-local proposal cannot be primary COMPLETE evidence

### Phase 2: Unified proposal structure and source selection

Goal:

Create a common product proposal structure.

Do:

- define or refine proposal source enum
- normalize deterministic, live, repair, and review-only proposals
- include operation type
- include target files
- include proposal provenance
- include verification intent
- include risk/unsupported flags
- choose proposal source based on planning confidence, read evidence, live provider output, and repair state
- emit missing-facts if no proposal is safe

Product evidence:

- at least 3 proposal sources produce normalized proposals
- unsupported source produces blocked/review-only outcome
- product path can display normalized proposal status

Focused audit:

- no hardcoded proposal counted as product-proven
- fake/focused proposal cannot become live-provider-proven
- proposal source remains visible in result/report

### Phase 3: Deterministic and live proposal readiness

Goal:

Make planning output reliably become exact proposal where possible.

Do:

- strengthen deterministic exact proposal from product read evidence
- support oldText uniqueness checks
- support target-missing and stale-read classification
- consume live provider exact proposal from Route227A if present
- recover or classify live provider proposal without raw output leakage
- ensure anchor classification is shared between deterministic/live sources
- support review-only fallback when proposal cannot be exact-ready

Product evidence:

- deterministic single-file task reaches exact-ready
- live provider task reaches exact-ready if Route227A has live exact proposal evidence; otherwise records live not-proven honestly
- oldText missing/multiple/stale-read cases do not become ready

Focused audit:

- no fuzzy apply
- no guessed oldText
- no raw provider output or secrets in report
- anchor classification is runtime-derived

### Phase 4: Repair and multi-file proposal handoff

Goal:

Unify repair and small multi-file proposal handoff.

Do:

- integrate repair proposal from failure evidence as a proposal source
- keep repair proposal no-write and confirmation-required
- integrate target-set or multi-file proposal shape
- preserve per-file proposal status
- emit unsupported for add/delete/move/broad until Route227D expands apply support
- pass verification intent downstream

Product evidence:

- repair proposal from failure evidence becomes normalized proposal
- small multi-file proposal produces per-file proposal evidence
- unsupported broad/delete/move proposal is blocked or preview-only

Focused audit:

- repair proposal is not repair success
- one file ready cannot hide another file blocked
- create/delete/move preview cannot imply apply support before Route227D

### Phase 5: Product review surface and handoff readiness

Goal:

Make proposal readiness user-visible and downstream-ready.

Do:

- wire orchestrator into real CLI/product planning path
- update review surface to show source, target files, anchor quality, authority status, verification intent, and blockers
- emit handoff readiness:
  - ready-for-review
  - ready-for-authority
  - ready-for-apply
  - blocked
  - unsupported
- keep not-proven claims explicit
- keep session/result truthful

Product evidence:

- real CLI/product path shows proposal review for deterministic case
- real CLI/product path shows live provider proposal status if available
- real CLI/product path shows repair proposal status if failure case is used
- unsupported task remains blocked

Focused audit:

- review-ready is not apply-ready
- authority-required is visible
- verification intent is not verification dispatched
- result/session does not turn partial into success

### Phase 6: Route227C report and handoff to Route227D

Create:

docs/implementation-context/route227c-planning-to-patch-orchestrator-report.json

Report must include:

- schemaVersion
- route=route227c
- routeType=proposal-orchestration-capability
- finalStatus
- primaryEvidence
- proposalSourcesAttempted
- productProposalTasksAttempted
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- proposalNormalizationEvidence
- anchorClassificationEvidence
- reviewSurfaceEvidence
- notProvenClaims
- referenceAdoption if references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227c-planning-to-patch-orchestrator-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route227c verifier only if useful. It must drive product proposal path or remain secondary.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-lower-bound-stable-selected-workspace-authority-case
- frozen-unsupported-broad-task-negative-control
- frozen-session-continuity-result-truth

Recommended if cheap:

- frozen-upper-bound-challenge-verification-failure-repair-case
- frozen-command-only-bypass-negative-control

These protect lower-bound truth while proposal capability expands.

## Completion criteria

Route227C is COMPLETE only if:

- product path consumes the Planning-to-Patch Orchestrator
- at least 4 product proposal tasks are attempted
- at least 3 proposal sources are represented among deterministic, live, repair, multi-file, review-only, unsupported
- at least 2 proposal tasks reach exact-ready
- at least 1 proposal task reaches live-provider exact-ready if Route227A completed live exact proposal; if not, live not-proven is explicit
- repair proposal is normalized without being counted as repair success
- multi-file proposal preserves per-file status
- unsupported broad/delete/move task is blocked or preview-only
- review surface shows source, anchor quality, authority requirement, verification intent, and blockers
- no proposal source implies apply authority
- route-local demos are not primary evidence
- Route221 report gate passes
- final report justifies COMPLETE from product proposal evidence

If these cannot be met, final status must be PARTIAL or BLOCKED with exact reason.

## Scope

Allowed:

- planning-to-patch orchestrator
- product proposal structure
- proposal source selection
- deterministic proposal builder improvements
- live provider proposal consumption
- repair proposal integration
- multi-file proposal normalization
- anchor classification
- review surface
- planning product path wiring
- report artifact
- focused tests for proposal normalization, anchor, review, source classification

Avoid unless necessary:

- live provider prompt work already owned by Route227A
- edit engine apply expansion owned by Route227D
- verification dispatch expansion owned by Route227E
- large CLI refactor
- large SessionManager refactor
- broad Claim Ledger rewrite
- browser/MCP work

Not allowed:

- proposal as mutation authority
- review-ready as apply-ready
- fuzzy apply as success
- guessed anchors
- raw provider output logging
- raw oldText/newText logging unless policy explicitly allows redacted local deterministic evidence
- production workspace default write
- new writer
- new dependencies unless already approved by project policy
- route-local proposal as primary COMPLETE evidence

## Phase commit policy

Codex may commit a green phase to keep worktree readable.

Commit rules:

- commit message starts with route227c:
- do not push
- do not commit failing states
- do not commit audit residue
- final report lists phase commits

Commits are optional, not mandatory.

## Final report

Do not paste full stdout.

Do not print secrets, raw provider output, or unsafe patch contents.

Include:

1. Final status
2. Phase commits
3. Proposal sources audited
4. Unified proposal structure
5. Source selection behavior
6. Deterministic proposal behavior
7. Live proposal behavior
8. Repair proposal behavior
9. Multi-file proposal behavior
10. Anchor classification behavior
11. Review surface and handoff readiness
12. Product path evidence
13. Frozen tasks attempted
14. Negative controls
15. Route221 gate result
16. Reference adoption table or not-inspected statement
17. Validation commands with pass/fail
18. Files changed
19. Remaining not-proven claims
20. What capability increased
21. What lower-bound safety was preserved
22. Next route: docs/agent-routes/route227d-edit-engine-capability-expansion.md

## Next route

After Route227C is complete, continue with:

docs/agent-routes/route227d-edit-engine-capability-expansion.md

Route227D will expand the edit engine from exact update into controlled create-file, safe delete/move preview, small multi-file exact apply, snapshot/recovery evidence, and preview-first broad refactor decomposition while preserving no new unrestricted writer and no fuzzy success.
