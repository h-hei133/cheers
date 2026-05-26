# Route 227B: Context Planning Elite Upgrade

## Goal

Upgrade the front half of the agent so Route227A live proposal capability has better task context, target selection, and verification planning.

Route227A focuses on live provider exact proposal contract.

Route227B focuses on:

vague task
-> repo intelligence
-> staged context acquisition
-> code graph / impact query
-> context memory reuse
-> enough-context decision
-> grounded plan
-> edit target ranking
-> verification intent
-> proposal handoff readiness

Expected final status: COMPLETE.

Do not close this route after only adding a new map, report, or demo. This route must improve real product planning behavior and make the next patch/proposal routes stronger.

## Current gap

The project has Context Engine and Planning Runtime, and Route225 wired product path visibility.

But the front half is still not elite:

- vague tasks can still under-discover context
- context memory is not strong enough for long-session reuse
- code graph and impact query remain heuristic
- test adjacency is weak
- enough-context decisions can be too conservative or too optimistic
- edit target ranking is not consistently connected to proposal and verification
- broad tasks are blocked, but smaller decomposable tasks are not always split well

Route227B must improve these without turning into a docs-only architecture route.

## Capability to build

Build a stronger product Context and Planning layer.

Required capabilities:

1. Repo intelligence upgrade
   Produce a stronger runtime snapshot:
   - package/module map
   - entrypoint map
   - test map
   - config/script map
   - module ownership hints
   - recently relevant files
   - candidate files by task type
   - stale/missing index detection

2. Staged context acquisition upgrade
   The planner should read in stages:
   - task classification
   - candidate discovery
   - high-confidence reads
   - second-hop related files
   - enough-context decision
   - missing-facts decision
   It must avoid broad repo reading and explain why each file was read.

3. Code graph / impact query upgrade
   Build useful semantic-ish facts:
   - import/export links
   - nearby symbols
   - test adjacency
   - package/script ownership
   - changed-file impact candidates
   - related file ranking
   Full LSP is not required.

4. Context memory and continuation upgrade
   Preserve useful context evidence:
   - read receipts
   - file relevance summaries
   - edit target rationale
   - verification intent
   - cache/index default disabled
   - invalidation when files change
   - no hidden chain-of-thought persistence

5. Planning owner upgrade
   Planning Runtime should own:
   - task understanding
   - context sufficiency
   - grounded analysis
   - task decomposition
   - edit target selection
   - verification intent
   - proposal handoff readiness
   - unsupported or blocked claims

6. Test adjacency and verification intent
   Planning should identify likely verification:
   - focused test files
   - package build
   - package test
   - typecheck if available
   - command risk / approval requirement
   This output must feed Route227E verification upgrade later.

7. Product path integration
   Improvements must be visible in real CLI/product planning path, not only route-local demo.

## Required subagents

Use focused subagents. Do not broad-read the whole repository or reference pool.

Before implementation:

1. Context/reference subagent
   Study local Context Engine / Planning Runtime seams and targeted references if useful.
   Report patterns for repo intelligence, context acquisition, memory, and task decomposition.

2. Code graph / test adjacency subagent
   Inspect local code graph, context graph, test impact, and verification planning seams.
   Report the smallest path to improve related-file ranking and test adjacency.

3. Product path subagent
   Inspect real CLI/product planning path from Route225.
   Report how context/planning improvements should become user-visible without route-local-only success.

After implementation:

1. Memory and stale-context audit subagent
   Check no hidden chain-of-thought persistence, stale cache misuse, forged/out-of-workspace memory, or unbounded reread loop.

2. Planning evidence audit subagent
   Check candidate files, read reasons, enough-context, missing facts, edit targets, verification intent, and not-proven claims.

3. Product path audit subagent
   Check changes are consumed by real product path and not just a new script.

Each subagent should return short findings, changed seams, risks, and audit result.

## Reference policy

No broad reference scan.

Reference pool under /home/wang/projects:

- gemini-cli
- GitNexus
- graphiti
- mem0
- mempalace
- OpenHands
- opencode
- mini-swe-agent
- inspect_ai

Suggested mapping:

- gemini-cli: repo context, memory files, CLI planning entry
- GitNexus: repo intelligence and code graph
- graphiti: graph-shaped memory and temporal relation ideas
- mem0 / mempalace: durable memory organization
- OpenHands: controller/task trajectory and context gathering
- opencode: workspace/session abstraction
- mini-swe-agent: minimal issue -> search -> edit -> test loop
- inspect_ai: task/scorer/report separation

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local Route207-226 substrate was sufficient.

## Phases

### Phase 1: Reality audit and planning baseline

Goal:

Identify current product planning weaknesses without broad reading.

Do:

- inspect current Context Engine, repo intelligence, context memory, Planning Runtime, code graph, test impact, and Route225 product path
- identify where vague tasks lose relevant files
- identify where memory reuse is partial
- identify where edit target ranking is weak
- identify how planning output feeds proposal and verification
- establish current baseline with a small product planning task pack

Task pack should include:

1. vague bugfix
2. vague feature or output improvement
3. test-related task
4. multi-file impact task
5. unsupported broad task
6. continuation memory task

Focused audit:

- no route-local demo-only success
- product path baseline recorded honestly
- unsupported broad task remains blocked

### Phase 2: Repo intelligence and staged context acquisition

Goal:

Improve the agent's ability to find relevant files before planning.

Do:

- improve package/module/entrypoint/test/config discovery
- improve candidate ranking for vague tasks
- add staged read decisions with reasons
- add second-hop related file candidates
- keep context budget visible
- avoid broad repo scan
- expose missing facts and next-read suggestions

Product evidence:

- real product planning path shows better candidates and read reasons
- at least 4 of 5 non-broad task cases find plausible candidate files
- unsupported broad task stays blocked or split into supported subclaims

Focused audit:

- no unbounded repo reading
- no stale or forged context evidence
- no broad unsupported task COMPLETE

### Phase 3: Code graph, impact query, and test adjacency

Goal:

Make planning more useful for edit and verification.

Do:

- improve import/export facts
- improve related file ranking
- improve changed-file impact candidates
- add or strengthen test adjacency
- connect likely tests to verification intent
- include confidence and incompleteness warnings

Product evidence:

- at least 3 task cases include useful related files
- at least 2 task cases include likely verification commands or test files
- command-only bypass remains rejected as verification proof

Focused audit:

- graph is heuristic and labeled as such
- related-file ranking cannot become mutation authority
- likely test selection is not counted as dispatched verification

### Phase 4: Context memory and continuation

Goal:

Stop the reread/compression death spiral.

Do:

- preserve read receipts
- preserve file relevance summaries
- preserve edit target rationale
- preserve verification intent
- support default-disabled cache/index if useful
- invalidate memory when file snapshot changes
- reject out-of-workspace or forged memory
- keep summaries explicit and audit-safe
- do not store hidden chain-of-thought

Product evidence:

- second pass on continuation task reuses relevant context receipts
- stale memory is rejected
- forged/out-of-workspace memory is rejected
- missing facts remain visible

Focused audit:

- memory reuse does not hide stale file content
- continuation does not promote partial to success
- summaries do not contain secrets or hidden reasoning

### Phase 5: Planning owner and handoff readiness

Goal:

Make Planning Runtime the real owner of analysis, plan, edit target selection, and verification intent.

Do:

- strengthen task decomposition
- strengthen enough-context decision
- strengthen grounded analysis
- rank edit targets
- emit proposal handoff readiness
- emit unsupported/broad capability blockers
- emit verification intent tied to target files
- integrate output into real CLI/product path

Product evidence:

- vague bugfix reaches edit target and proposal handoff readiness
- vague feature reaches plan and supported edit target or honest missing facts
- test-related task reaches verification intent
- multi-file impact task produces related targets and per-file planning evidence
- unsupported broad task is blocked or split without false COMPLETE

Focused audit:

- planning does not imply apply authority
- edit target does not imply proposal exact-ready
- verification intent does not imply verification dispatched
- not-proven claims remain explicit

### Phase 6: Route227B report and handoff to Route227C

Create:

docs/implementation-context/route227b-context-planning-elite-upgrade-report.json

Report must include:

- schemaVersion
- route=route227b
- routeType=context-planning-capability
- finalStatus
- primaryEvidence
- productPlanningTasksAttempted
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- contextMemoryEvidence
- codeGraphEvidence
- testAdjacencyEvidence
- notProvenClaims
- referenceAdoption if references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227b-context-planning-elite-upgrade-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route227b verifier only if useful. It must drive product planning path or remain secondary.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-unsupported-broad-task-negative-control
- frozen-command-only-bypass-negative-control
- frozen-session-continuity-result-truth

Recommended if cheap:

- frozen-lower-bound-stable-selected-workspace-authority-case

These protect lower-bound truth while planning improves upper-bound capability.

## Completion criteria

Route227B is COMPLETE only if:

- improvements are consumed by real product planning path
- at least 5 product planning tasks are attempted
- at least 4 non-broad tasks produce plausible candidate files and staged context evidence
- at least 3 tasks produce grounded plan and ranked edit targets
- at least 2 tasks produce useful verification intent with likely tests or commands
- one continuation task proves context receipt reuse without rereading everything
- stale/forged/out-of-workspace memory is rejected
- unsupported broad task remains blocked or split honestly
- planning output does not imply apply authority
- route-local demos are not primary evidence
- Route221 report gate passes
- final report justifies COMPLETE from product/context evidence

If these cannot be met, final status must be PARTIAL or BLOCKED with exact reason.

## Scope

Allowed:

- repo intelligence
- context engine
- context memory
- code graph / context graph
- test impact / test adjacency
- planning runtime
- planning runtime product projection
- planning product path wiring
- default-disabled cache/index
- focused tests for context/planning/memory/graph
- report artifact
- narrow Route221 gate update if needed for context-planning-capability report type

Avoid unless necessary:

- live provider work
- broad edit engine work
- large CLI refactor
- large SessionManager refactor
- broad Claim Ledger rewrite
- browser/MCP work

Not allowed:

- hidden chain-of-thought persistence
- unbounded repo scan
- stale memory reuse as truth
- planning as mutation authority
- verification intent as dispatched verification
- route-local demo as primary COMPLETE evidence
- production workspace default write
- new dependencies unless already approved by project policy

## Phase commit policy

Codex may commit a green phase to keep worktree readable.

Commit rules:

- commit message starts with route227b:
- do not push
- do not commit failing states
- do not commit audit residue
- final report lists phase commits

Commits are optional, not mandatory.

## Final report

Do not paste full stdout.

Include:

1. Final status
2. Phase commits
3. Baseline weaknesses found
4. Repo intelligence improvements
5. Staged context acquisition improvements
6. Code graph / impact query improvements
7. Test adjacency improvements
8. Context memory / continuation behavior
9. Planning Runtime ownership improvements
10. Product path evidence
11. Frozen tasks attempted
12. Negative controls
13. Route221 gate result
14. Reference adoption table or not-inspected statement
15. Validation commands with pass/fail
16. Files changed
17. Remaining not-proven claims
18. What capability increased
19. What lower-bound safety was preserved
20. Next route: docs/agent-routes/route227c-planning-to-patch-orchestrator.md

## Next route

After Route227B is complete, continue with:

docs/agent-routes/route227c-planning-to-patch-orchestrator.md

Route227C will turn the stronger Route227B planning output into validated proposal sources, exact patch handoff, anchor classification, review surface, and proposal selection across deterministic, live provider, and repair proposal paths.
