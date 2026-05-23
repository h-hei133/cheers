# Route 208: Product-path Agentic Read-Analyze-Plan-Edit Loop

## Goal

Push the project toward top-tier agent capability by upgrading the real product path for:

read -> context -> analyze -> plan -> edit target selection -> proof-carrying mutation handoff

Route207A created Context Engine and Planning Runtime as demo/focused surfaces.
Route207B wired them into the real no-write/review-only product path.
Route208 must now make that path substantially more capable, closer to top agent projects.

The target is:

vague user task
-> repo-aware task understanding
-> staged context acquisition
-> semantic-ish related file discovery
-> grounded analysis
-> executable plan
-> edit target selection
-> verification intent
-> review-only or proof-carrying mutation handoff readiness
-> product result/session evidence

This route is allowed to be large and run for hours.

The route is not complete if new capability only exists in tests, demos, exports, or isolated modules. Real product path consumption is required.

## Hard completion rule

Codex may not mark COMPLETE unless real product path evidence exists.

Complete requires:

- real CLI/read-inspect/runMvpIntegratedFlow product path consumes the new capability
- vague task behavior improves in product path, not only demo
- product output shows context acquisition, analysis, plan, edit targets, and handoff status
- result/session surface preserves the relevant evidence
- explicit-target behavior still works
- no-write/review-only semantics remain unless existing proof-carrying mutation handoff is explicitly used

If the work is useful but only module/demo/focused-test proven, final status must be PARTIAL.

If a safe product seam cannot be found, final status must be BLOCKED.

## Phase and commit policy

Execute this route in phases.

For each phase:

1. Assign feature-specific subagents to inspect local seams and relevant reference repos.
2. Main thread synthesizes the findings.
3. Implement the phase.
4. Run focused validation.
5. Run an audit subagent for that phase.
6. If green, Codex may create a git commit before continuing.

Commits are allowed and encouraged after audited green phases.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Commit messages must start with route208:
- Final report must list phase commits and current git status.
- If commit is blocked by policy, report it and continue with clear phase diffs.

## Reference repository pool

All reference repos are under /home/wang/projects.

Use subagents by capability. The main thread must not broad-read all repos.

Reference pool:

- GitNexus
- OpenHands
- gemini-cli
- graphiti
- inspect_ai
- mem0
- mempalace
- mini-swe-agent
- opencode
- pi
- playwright-mcp
- stagehand

Recommended mapping:

- repo intelligence and code graph: GitNexus, graphiti, pi, gemini-cli
- task loop and context acquisition: OpenHands, mini-swe-agent, opencode, gemini-cli
- planning and controller design: OpenHands, mini-swe-agent, opencode, inspect_ai
- memory and continuation ideas: mem0, mempalace, graphiti, opencode, gemini-cli
- product/session/result surfaces: opencode, OpenHands, inspect_ai
- browser/tool patterns only if directly relevant: playwright-mcp, stagehand

Subagent reports must be short:

- best pattern found
- reference repo source
- local seam to modify
- implementation recommendation
- audit risk

## Scope

Allowed:

- packages/ts-shell broadly
- orchestration modules
- core shell modules
- session/result surfaces where needed
- entrypoint light wiring where needed
- runMvpIntegratedFlow small and careful integration
- Context Engine and Planning Runtime changes
- default-disabled repo cache/index
- existing TypeScript parsing capability, no new dependency

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large SessionManager refactor
- large cli.tsx refactor

Not allowed:

- new dependency
- new standalone demo-only surface as completion
- broad Claim Ledger expansion
- browser/MCP product work
- provider call by default
- production workspace write enablement by default
- fuzzy direct mutation
- new writer

## Phase 0: Reality baseline and route contract

Purpose:

Establish current Route207B product path and define the exact acceptance gates for this route.

Subagents:

- product path baseline subagent
- reference planning baseline subagent

Must answer:

- where vague task enters Planning Runtime today
- what product paths still bypass it
- what output is currently shown
- what is still demo-only
- what real task types currently fail or stop too early

Deliverable:

- baseline table
- phase acceptance checklist
- no implementation unless a tiny diagnostic test is needed

Audit:

- ensure Codex does not redefine completion downward

Optional commit:

- route208: baseline product path contract

## Phase 1: Broaden product-path coverage

Purpose:

Make more real vague task paths enter Context Engine and Planning Runtime, not only the narrow blocked vague edit seam.

Target paths may include:

- vague bugfix
- vague feature
- test-related task
- read/inspect task without explicit file
- multi-file impact question
- unsupported task with useful missing facts

Reference focus:

- OpenHands controller flow
- mini-swe-agent issue loop
- opencode task/session routing
- gemini-cli repo-aware context entry

Implementation target:

- product path routes these task classes into Planning Runtime when safe
- command-only tasks still do not create mutation targets
- explicit-target read path remains unchanged
- output clearly says planning/runtime path used

Acceptance:

- integrated tests or CLI-equivalent invocations prove at least three vague task classes enter product path Planning Runtime
- unsupported cases stop with useful missing facts, not generic read-stage-required drift

Audit:

- check new coverage is product-path, not demo-only

Optional commit:

- route208: broaden planning product path coverage

## Phase 2: Agentic context acquisition loop

Purpose:

Upgrade context acquisition from one-shot candidate selection to staged task-driven reading.

Reference focus:

- OpenHands observe-act loop
- mini-swe-agent search-read-edit simplicity
- gemini-cli context gathering
- opencode tool orchestration

Implementation target:

- stage candidate discovery
- read high-value files first
- decide enough-context versus missing-context
- request next reads only when needed
- preserve why each file was read
- keep context budget visible
- avoid over-reading

Acceptance:

- product path evidence shows staged reads and why-read reasons
- insufficient-context task stops with missing facts
- enough-context task proceeds to grounded analysis and plan

Audit:

- check route does not read huge repo slices by default
- check why-read evidence is runtime-derived

Optional commit:

- route208: add staged agentic context acquisition

## Phase 3: Repo intelligence and semantic-ish code graph upgrade

Purpose:

Improve candidate discovery and impact reasoning beyond explicit targets and simple heuristics.

Reference focus:

- GitNexus for repo intelligence
- graphiti for graph-shaped memory
- pi for impact/project graph ideas
- gemini-cli for repo context discovery

Implementation target:

- entrypoint/test/config/module hints
- import/export or dependency facts where cheap
- related file ranking
- impact query for candidate changes
- confidence and incompleteness warnings
- default-disabled cache/index if useful

Acceptance:

- vague task discovers better related candidates than old explicit-target flow
- product output can show why a file was ranked
- stale or invalid cache is rejected if cache is implemented
- default path remains safe without cache

Audit:

- check graph confidence is not overclaimed
- check cache/index is not required by default

Optional commit:

- route208: improve repo intelligence and impact ranking

## Phase 4: Analysis and planning upgrade

Purpose:

Make Planning Runtime produce higher-quality, grounded, executable plans.

Reference focus:

- OpenHands planner/controller separation
- mini-swe-agent minimal plan-act loop
- opencode session/tool orchestration
- inspect_ai solver/scorer separation

Implementation target:

- grounded analysis based on gathered context
- explicit missing facts
- risk and confidence
- executable plan steps
- alternatives when context is weak
- verification intent
- unsupported classification
- no hidden chain-of-thought persistence

Acceptance:

- product output shows analysis grounded in read evidence
- plan is actionable and tied to candidate/edit targets
- missing facts block only required gaps
- optional gaps appear as warnings, not blockers

Audit:

- check plan is not generic boilerplate
- check unsupported cases remain honest

Optional commit:

- route208: upgrade grounded planning runtime

## Phase 5: Edit target selection and proof backend handoff

Purpose:

Connect planning to the existing Route203-206 proof-carrying mutation backend without enabling unsafe mutation.

Reference focus:

- mini-swe-agent patch loop
- OpenHands edit/runtime feedback
- opencode permission/tool workflow
- local Route203-206 mutation substrate

Implementation target:

- choose edit targets with rationale
- classify target readiness
- map selected targets to existing exact/proof-carrying mutation inputs where possible
- produce review-only handoff by default
- support mutation handoff readiness without applying by default
- preserve Claim Ledger as terminal judge when mutation path is used

Acceptance:

- product path can produce edit targets ready for existing proof backend handoff
- unsupported broad/fuzzy cases stop clearly
- no new writer
- no fuzzy direct mutation
- no provider/apply by default

Audit:

- check handoff is not a fake marker
- check no mutation authority is granted by planning alone

Optional commit:

- route208: connect edit targets to proof backend handoff

## Phase 6: Real task benchmark pack

Purpose:

Prove the upgraded path on realistic tasks, not only narrow tests.

Reference focus:

- inspect_ai evaluation/report shape
- mini-swe-agent issue task simplicity
- OpenHands trajectory reporting

Implementation target:

Create a small product-path benchmark or integration pack with tasks such as:

- vague bugfix
- vague feature planning
- test-related task
- multi-file impact task
- insufficient-context task
- command-only task
- unsupported broad refactor

Each case should report:

- product path used or not
- candidates
- staged reads
- analysis
- plan
- edit targets
- verification intent
- handoff status
- missing facts
- no-write safety markers

Acceptance:

- benchmark proves real product path improvement over Route207B baseline
- demo success alone is not counted
- focused tests remain useful but not sufficient

Audit:

- final benchmark audit separates module, demo, focused, product-path, and mutation evidence

Optional commit:

- route208: add product path agentic benchmark pack

## Phase 7: Continuation memory and cache, if still needed

Purpose:

Only after the product path and task loop are meaningfully improved, add continuation/cache work if it directly improves product-path behavior.

Reference focus:

- mem0, mempalace, graphiti
- opencode session state
- gemini-cli context memory

Implementation target:

- persist useful ContextWorkingMemory if safe
- restore memory on continuation if safe
- avoid rereading unchanged files
- invalidate changed/stale files
- keep cache/index default disabled
- report memory scope honestly

Acceptance:

- product-path continuation behavior is proven
- memory reuse is not demo-only
- stale memory is rejected
- if not completed, mark as not-proven and do not block Route208 if earlier phases are complete

Audit:

- check no hidden chain-of-thought persistence
- check no false session-continuation claim

Optional commit:

- route208: add product continuation memory

## Phase 8: Final product-path audit

Purpose:

Prevent another demo/focused false completion.

Final audit subagent must answer:

- Which capabilities are consumed by real product path?
- Which are module-only?
- Which are demo-only?
- Which are focused-test-only?
- Which product paths still bypass Planning Runtime?
- Which top-tier reference patterns were actually implemented?
- Which claims remain not-proven?

Final status must be:

- COMPLETE only if core product-path read/analyze/plan/edit-targeting upgrade is proven
- PARTIAL if significant capability exists but major product paths still bypass it
- BLOCKED if safe integration failed

Optional commit:

- route208: final product path audit adjustments

## Required final validation

Run appropriate targeted checks during phases.

Final validation should include:

- Context Engine focused tests
- Planning Runtime focused tests
- product-path integration tests
- explicit-target regression tests
- real CLI or equivalent integrated vague task invocation
- Route207 demo
- Route208 benchmark pack
- result/session surface tests if touched
- build for packages/ts-shell
- git diff --check
- git status --short --branch

If a real CLI invocation is impossible, explain why and use the closest integrated runner. Do not claim product-path evidence from demo alone.

## Final report

Do not paste full stdout.

Final report must include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase summary
3. Phase commits
4. Reference repos studied by phase
5. Product paths now covered
6. Product paths still bypassing Planning Runtime
7. Context acquisition improvements
8. Repo intelligence and graph improvements
9. Planning quality improvements
10. Edit target and proof backend handoff behavior
11. Benchmark results
12. Continuation/cache status
13. Commands run with pass/fail and key fields
14. Files changed
15. Remaining not-proven claims
16. Next route recommendation
