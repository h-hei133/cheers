# Route 207: Agentic Context Engine Upgrade

## Goal

Upgrade the weak front half of the agent:

read -> context -> analyze -> plan -> edit target selection

The project already has a strong proof-carrying mutation backend from Route203-206:

- live provider called
- exact-ready proposal
- trusted controlled apply
- readback verification
- Claim Ledger terminal verdict
- repair proof chain
- controlled multi-file proof chain

Route207 must now build the missing top-tier context and planning runtime in front of that backend.

This route is a long-running engineering route. It should be aggressive and broad. It is allowed to run for hours.

The route should move the system from explicit-target-only behavior toward agentic context engineering:

vague user task
-> task understanding
-> repository intelligence
-> context acquisition
-> context compression or persistence
-> grounded analysis
-> executable plan
-> edit target selection
-> handoff to existing proof-carrying mutation runtime

The goal is not another verifier layer. The goal is capability.

## Scope

Allowed:

- packages/ts-shell broadly
- orchestration modules
- core shell modules when needed
- session and entrypoint light wiring when needed
- new Context Engine facade
- new Planning Runtime facade
- persistent context index or cache, default disabled
- TypeScript parsing or existing dependency-based parsing
- demo-first validation
- focused tests where useful

Allowed with care:

- small changes to runMvpIntegratedFlow.ts
- small changes to SessionManager.ts
- small changes to cli.tsx

Not the focus:

- more Claim Ledger schema work unless absolutely required
- more proof harness expansion
- more named verifiers by default
- browser automation
- MCP product work
- new dependencies
- production workspace default write enablement

## Reference repository pool

All repositories are under /home/wang/projects.

Use subagents to study these repositories by capability. Do not make the main thread read all reference repos.

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

## Required working style

Codex must allocate subagents by feature area.

For each major feature:

1. Send one or more subagents to study the relevant reference repos.
2. Main thread synthesizes the pattern.
3. Implement the feature.
4. Send an audit subagent to review that feature.
5. Continue to the next feature.

The main thread must avoid broad repo reading. It should coordinate, synthesize, and implement.

Subagent reports should be short:

- what pattern was found
- which repo showed it best
- what local seam should be changed
- what to avoid

## Capability tracks

### 1. Repository intelligence layer

Build a repo intelligence layer that lets the agent understand the project before reading random files.

It should produce a compact project map at runtime or from a default-disabled cache.

Capabilities:

- package/module map
- entrypoint map
- test map
- config map
- ownership or boundary hints
- recently relevant files
- likely files for a vague task
- stale or missing index detection

Reference:

- gemini-cli for repo context and memory file patterns
- opencode for project/session/workspace structure
- GitNexus for repository intelligence or code graph ideas
- graphiti if useful for graph-shaped memory
- pi if useful for code impact or project map ideas

Expected local output:

- Context Engine facade
- repo intelligence snapshot
- default-disabled cache or index
- tests or demo proving vague task can find relevant candidate files

### 2. Task-driven context acquisition

Build an agentic context acquisition loop.

The runtime should not require the user to always provide explicit files.

Capabilities:

- classify task type
- infer candidate modules
- search and read in stages
- stop when enough context exists
- avoid over-reading
- preserve why each file was read
- produce missing-facts and next-read suggestions
- keep context budget visible

Reference:

- OpenHands for controller and event-driven task loop
- mini-swe-agent for small issue-to-search-to-edit loop
- opencode for tool/session orchestration
- gemini-cli for repo-aware context discovery

Expected local output:

- task context acquisition runtime
- staged read loop
- evidence of selected reads
- enough-context decision
- missing-context decision
- demo with vague task

### 3. Context compression and working memory

Build a practical context memory layer to prevent the route-level death spiral:

read too much -> context fills -> compression loses detail -> reread everything.

Capabilities:

- compact task context summary
- durable read receipts
- file relevance summaries
- edit-target rationale summaries
- continuation-safe context packet
- cache default disabled
- clear invalidation when files change

Reference:

- mem0 for memory abstraction
- mempalace for memory organization
- graphiti for temporal or graph memory ideas
- gemini-cli for persistent context and memory files
- opencode for session persistence

Expected local output:

- context memory structure
- compact summary builder
- reuse of previous read evidence
- no hidden chain-of-thought persistence
- demo showing second pass avoids rereading everything

### 4. Semantic-ish code graph

Do not build a full LSP. Build a useful code graph that improves planning.

Capabilities:

- import/export facts
- symbol-ish ownership
- call-site hints where cheap
- test adjacency
- config and script linkage
- impact query
- related files ranking
- confidence and incompleteness warnings

Reference:

- GitNexus for code graph and repo intelligence
- graphiti for graph modeling patterns
- gemini-cli for repo-wide code context
- pi if useful for impact or project graph ideas

Expected local output:

- improved code graph facts
- impact query API
- ranked related file candidates
- tests or demo showing better target discovery than explicit-target-only flow

### 5. Unified analysis and planning owner

Create a clear planning owner.

Current analysis and planning are scattered across read/context, analysis, planQuality, taskLifecycle, and runMvpIntegratedFlow.

Route207 should introduce a Planning Runtime facade that owns:

- task understanding
- context sufficiency
- grounded analysis
- plan construction
- edit target selection
- verification intent
- handoff to mutation runtime

Reference:

- OpenHands for planner/controller separation
- mini-swe-agent for simple plan-act-observe loop
- opencode for session and tool orchestration
- inspect_ai for solver/scorer separation and evaluation-oriented structure

Expected local output:

- Planning Runtime facade
- enough-context gate
- grounded analysis result
- executable plan result
- edit target selection result
- verification intent result

### 6. Edit target selection handoff

The planner should not perform broad mutation.

It should select targets and hand them to existing proof-carrying mutation runtime.

Capabilities:

- choose edit targets
- explain why each target is selected
- map target to existing exact apply routes
- declare unsupported broad/fuzzy cases
- pass verification intent
- preserve Claim Ledger as terminal judge

Reference:

- mini-swe-agent for minimal patch flow
- OpenHands for edit loop and runtime feedback
- opencode for permissions and tool workflow
- Route203-206 local substrate for proof-carrying apply

Expected local output:

- edit target selection
- proposal handoff structure
- clear unsupported status for fuzzy or broad tasks
- demo showing plan can select correct files before mutation

### 7. Demo-first validation

Route207 should prove capability with demos, not only tests.

Add a small demo or focused command that runs against controlled fixtures or the current repo in no-write planning mode.

Demo cases should include:

1. vague bugfix task
2. vague feature task
3. test-related task
4. multi-file impact task
5. insufficient-context task

Each demo should show:

- candidate files found
- files read and why
- enough-context status
- grounded analysis
- plan
- edit targets
- verification intent
- handoff readiness
- unsupported or missing facts when applicable

Reference:

- inspect_ai for eval and scorecard shape
- mini-swe-agent for small task loops
- OpenHands for task trajectory structure

Expected local output:

- route207 demo command or focused harness
- concise report format
- no full stdout pasted in final response

## Success criteria

Route207 is complete when the system has a usable top-tier front-half runtime:

- vague tasks can produce relevant candidate files
- context acquisition is staged and budget-aware
- context summaries survive continuation without rereading everything
- repo intelligence improves target discovery
- code graph facts improve related file ranking
- Planning Runtime owns context sufficiency and plan creation
- edit target selection can hand off to existing mutation runtime
- unsupported tasks stop with useful missing facts
- demo output is useful enough for real development planning

The route should not be marked complete for only adding docs, tests, or wrappers.

## Validation

Use capability demos first.

Required:

- focused tests for new Context Engine
- focused tests for Planning Runtime
- focused tests for context memory or cache invalidation if added
- focused tests for code graph or impact query if added
- demo command for vague task to candidate files to plan to edit targets
- build
- diff check
- status

Recommended:

- no-write planning demo on current repository
- fixture demo showing second pass reuses context memory
- comparison summary showing what improved over explicit target flow

Do not over-invest in named verifiers unless needed.

## Final report

Do not paste full stdout.

Include:

1. Subagent study summary
2. Reference patterns adopted
3. Context Engine changes
4. Planning Runtime changes
5. Repo intelligence changes
6. Context memory or cache behavior
7. Code graph or impact query changes
8. Edit target selection behavior
9. Demo outputs summarized
10. Commands run with pass/fail
11. Files changed
12. Remaining gaps
13. Next route recommendation

## Route completion warning

This route is allowed to be large.

Do not prematurely close it after only scaffolding.

Do not stop at no-write proof.

Do not only add a map or facade.

Do not add another proof layer and call it context engineering.

The expected result is a meaningful upgrade to read -> analyze -> plan -> edit-targeting capability.
