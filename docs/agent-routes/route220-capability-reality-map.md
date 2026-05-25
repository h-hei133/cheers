# Route 220: Capability Reality Map and Next-Stage Prioritization

## Goal

Route207-219 moved the project from context/planning scaffolding to a real-task-capable coding loop v1.

Before adding more capability, Route220 must audit reality.

This route must answer:

What can the agent actually do now?
Which capabilities are proven in real product path?
Which are only benchmark/focused/fixture?
Which are not proven?
What is the highest-value next route?

This is primarily an audit and capability map route, not a new feature route.

Do not add a new coding capability unless a tiny diagnostic script or assertion is needed to reveal the truth.

## Completion rule

COMPLETE requires a durable capability reality map and evidence-backed next-stage recommendation.

COMPLETE requires:

- inspect Route207-219 current implementation and benchmark gates
- run targeted validation gates where necessary
- classify capabilities as product-proven, benchmark-proven, focused-only, fake/focused, live-provider-proven, partial, blocked, or not-proven
- produce a capability matrix covering context, planning, live patch, apply, verification, repair, multi-file, selected workspace, fallback provider, session/result, and task verdict
- identify overclaims or weak evidence
- recommend the next 2-3 routes with priority and reason
- avoid broad code churn
- no fake success
- no provider secret/raw output leakage

PARTIAL if the map is incomplete or cannot verify critical gates.

BLOCKED if validation cannot run due to environment or missing baseline.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign focused audit subagents.
2. Inspect targeted files and gates only.
3. Run minimal validation.
4. Record evidence.
5. If a durable audit artifact is added or updated and green, commit with message starting route220:.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Maximum 3 commits.
- Do not modify product behavior unless a tiny diagnostic assertion is necessary.
- Final report must list commits and git status.

## Reference repository pool

All repos are under /home/wang/projects:

- OpenHands
- mini-swe-agent
- opencode
- gemini-cli
- inspect_ai
- GitNexus
- graphiti
- pi
- mem0
- mempalace
- playwright-mcp
- stagehand

Use references only for comparison, not broad study.

Suggested mapping:

- coding loop capability comparison: OpenHands, mini-swe-agent, opencode
- verification/repair/eval comparison: inspect_ai, OpenHands, mini-swe-agent
- context/repo intelligence comparison: GitNexus, gemini-cli, graphiti, pi
- session/result/UX comparison: opencode, OpenHands

Main thread must not broad-read reference repos.

Subagent reports must be short:

- capability being compared
- reference pattern
- local reality
- gap
- next route recommendation

## Real provider policy

This is an audit route.

Do not run live provider unless a current route gate already requires it and the user-approved command is necessary for reality classification.

If live provider is run:

- explicit opt-in only
- approved private config path only
- primary SiliconFlow once
- fallback only if appropriate
- no retries
- no raw provider output
- no oldText/newText
- no secrets
- no provider config printing
- classify NETWORK-BLOCKED / AUTH-FAILED / CONFIG-FAILED honestly

Prefer existing route benchmark outputs and safe summaries.

## Scope

Allowed:

- inspect packages/ts-shell route207-219 related code
- inspect benchmark scripts
- inspect package scripts
- run targeted benchmark gates
- add or update a durable audit document
- add a tiny diagnostic assertion only if needed

Not allowed:

- new feature implementation
- broad refactor
- new writer
- fuzzy apply
- provider by default
- apply by default
- command dispatch by default
- raw provider output logging
- manual private config reads
- turning this into another capability route

## Phase 0: Current-state inventory

Purpose:

Build a map of Route207-219 implementation and gates.

Must inspect targeted current files, not broad repo scan.

Cover:

- Context Engine and Planning Runtime product path
- exact proposal generation
- live provider exact patch path
- selected workspace apply
- verification command selection
- repair flow
- multi-file target-set path
- task-level verdict/reporting
- result/session surfaces
- benchmark scripts and npm gates

Deliverable:

- inventory table
- files/gates checked
- initial risk list

Optional commit:

route220: add capability inventory baseline

## Phase 1: Capability evidence matrix

Purpose:

Classify each capability by evidence strength.

Capabilities to classify:

1. vague task to context/planning
2. cross-module single-file live patch
3. deterministic exact proposal
4. live provider exact proposal
5. selected workspace authorized apply
6. multi-file per-file evidence
7. task-relevant verification command
8. verification failure handling
9. repair proposal
10. repair apply
11. re-verification after repair
12. task-level verdict
13. default safety gates
14. fallback provider
15. session/result/continue evidence
16. context memory/long-session reuse
17. real task pack success rate

Evidence classes:

- product-proven
- live-provider-proven
- selected-workspace-proven
- benchmark-proven
- focused-only
- fake/focused-only
- partial
- blocked
- not-proven

Deliverable:

- capability matrix
- weakest evidence per capability
- overclaim risks

Audit:

- no capability may be marked product-proven from demo/focused evidence only

Optional commit:

route220: add capability evidence matrix

## Phase 2: Validation spot checks

Purpose:

Run only the commands needed to verify the matrix.

Suggested gates:

- Route219 benchmark
- Route218 benchmark
- Route217 benchmark
- Route216 benchmark
- Route215 benchmark
- verify:result-contract
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Run older Route209-214 gates only if needed to resolve uncertainty.

Do not run the full broad suite unless needed.

If a broad suite has known unrelated failures, classify as baseline drift and do not block this audit unless it invalidates the audited capability.

Deliverable:

- validation table
- pass/fail
- key fields only
- no full stdout

Optional commit:

route220: record capability validation evidence

## Phase 3: Top-tier gap analysis

Purpose:

Compare current project reality against top coding-agent capability areas.

Gap areas:

- real task success rate
- repair-to-success
- multi-file robustness
- relevant verification quality
- long-session context memory
- interactive review/approval UX
- fallback provider reliability
- broader task benchmark
- session/result continuity
- ecosystem/tool expansion

For each gap:

- current evidence
- why it matters
- risk if ignored
- next route candidate
- expected payoff

Deliverable:

- prioritized gap list

Optional commit:

route220: add top tier gap analysis

## Phase 4: Next-route decision

Purpose:

Recommend the next 2-3 routes.

The recommendation must choose one immediate next route and explain why.

Candidate route categories:

- repair-to-success loop
- broader real task benchmark and success-rate improvement
- long-session context memory and repo intelligence
- interactive product UX
- fallback provider reliability
- multi-file robustness
- verification command quality

The decision must be based on evidence, not vibes.

Deliverable:

- recommended next route
- rejected alternatives and why
- exact scope recommendation
- risk and expected duration

Optional commit:

route220: recommend next capability route

## Final audit

Final audit subagent must answer:

- Is Route207-219 capability evidence accurately classified?
- Are any claims over-marked as complete?
- Which capabilities are strongest?
- Which capabilities are weakest?
- Is the next-route recommendation justified?
- Did the audit avoid new feature churn?
- Were provider secrets/raw output protected?
- Is final COMPLETE/PARTIAL/BLOCKED justified?

## Required validation

Final validation should include:

- Route219 benchmark unless impossible
- Route218 benchmark unless redundant and already proven in current state
- verify:result-contract
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Additional route benchmarks only if needed.

Do not paste full stdout.

## Final artifacts

Route220 should produce or update a durable audit artifact, recommended path:

docs/implementation-context/capability-reality-map-route220.md

This artifact should be concise enough for future Codex sessions.

It must include:

- capability matrix
- validation evidence
- weakest links
- next route recommendation
- known not-proven claims
- route execution rules learned from Route207-219

## Final report

Do not print provider secrets.

Do not paste raw provider output.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Capability matrix summary
4. Product-proven capabilities
5. Benchmark/focused-only capabilities
6. Not-proven claims
7. Validation commands with pass/fail and key fields only
8. Strongest capability areas
9. Weakest capability areas
10. Recommended next route
11. Rejected route options
12. Files changed
13. Git status
