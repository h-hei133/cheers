# Route 219: Real Task Quality and Self-Repair Coding Loop

## Goal

Route218 proved that the product path can perform small authorized coding tasks:

- cross-module live single-file exact patches
- small multi-file exact target-set apply
- selected workspace authorized apply
- authorized command dispatch path
- repair continuation creation

Route219 must raise the capability ceiling.

This route is not a pure verifier route and not a narrow repair closeout.

Route219 must prove the agent can run a set of real or realistic development tasks through the product path, choose relevant verification, repair failures when possible, and produce task-level evidence verdicts.

Target flow:

real task
-> context and planning
-> live provider or live-assisted exact patch
-> selected or controlled authorized apply
-> task-relevant verification command
-> if verification fails, repair proposal
-> repair confirmation
-> repair apply
-> re-verification
-> task-level verdict with proven and not-proven claims

Innovation point must be used as the task verdict system, not as a route blocker.

## Completion rule

COMPLETE requires real task quality improvement, not only benchmark scaffolding.

COMPLETE requires:

- at least 5 real or realistic product-path tasks
- at least 3 tasks use live provider generated patch evidence
- at least 2 tasks apply and pass task-relevant verification commands
- at least 1 multi-file task carries per-file evidence
- at least 1 verification failure reaches repair flow
- repair either succeeds with re-verification or stops honestly at repair-required with original failure preserved
- every task has a task-level verdict table
- default path remains no-provider, no-apply, no-command
- no fake live success
- no new writer
- no fuzzy direct apply
- no raw provider output, oldText/newText, API keys, or provider config printed

PARTIAL if tasks run but most success is fake/focused/deterministic only.

PARTIAL if verification remains shallow and does not relate to the changed task.

BLOCKED if real provider, selected workspace, or verification command path cannot safely run.

## Route budget and commit policy

This is a large aggressive route.

Expected runtime: several hours if needed.

Execute in phases.

For each phase:

1. Assign subagents to inspect local seams and relevant reference repos.
2. Implement or run that phase.
3. Validate.
4. Run audit subagent.
5. If green, commit with message starting route219:.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Maximum 7 phase commits unless a small cleanup is required.
- Final report must list commits and final git status.

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

Use references by phase. Main thread must not broad-read all repos.

Required mapping:

- task loop and repair cycle: OpenHands, mini-swe-agent, opencode
- verification command selection: mini-swe-agent, OpenHands, inspect_ai
- task trajectory and verdict reporting: inspect_ai, OpenHands
- multi-file task handling: OpenHands, mini-swe-agent, opencode
- context and impact selection: GitNexus, gemini-cli, graphiti, pi
- result/session reporting: opencode, OpenHands, inspect_ai

Subagent reports must be short:

- blocker or pattern
- reference repo area
- local seam
- recommended fix
- audit risk

## Real provider policy

Live provider is explicit opt-in only.

Use only existing approved private provider config loading paths.

The user has primary SiliconFlow and fallback SiliconFlow configured in /home/wang/.private-agents-real/provider.env.

Do not cat, grep, print, echo, upload, or dump provider config.

Do not print API keys.

Do not print raw provider output.

Do not print provider oldText or newText.

Do not add provider.env to git.

Primary may be tried once per task case.

Fallback may be tried once only if primary fails with network/provider availability class where fallback is appropriate.

No retry loops.

If both are blocked by network/proxy/API availability, mark NETWORK-BLOCKED.

If auth/config fails, mark AUTH-FAILED or CONFIG-FAILED.

If provider output lacks exact patch fields, mark PROVIDER-OUTPUT-INSUFFICIENT or REVIEW-ONLY with safe diagnostics.

Never fake live exact-ready.

## Scope

Allowed:

- product Planning Runtime
- context discovery and target selection
- live provider exact patch path
- exact proposal parser/normalizer
- multi-file target-set proposal path
- selected workspace authority path
- existing proof backend handoff
- task-relevant verification command selection
- verification result interpretation
- repair continuation and repair apply path
- task-level verdict/report surface
- Route219 benchmark/task pack

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large cli.tsx refactor
- large SessionManager refactor

Not allowed:

- new writer
- fuzzy direct apply
- arbitrary broad refactor
- provider call by default
- apply by default
- command dispatch by default
- production workspace write by default
- new dependencies
- browser/MCP product work
- raw provider output logging
- manual private config reads
- turning task verdicts into another huge Claim Ledger rewrite

## Task pack requirements

Create or select at least 5 real or realistic current-repo product-path tasks.

The pack must include:

1. small bugfix or behavior fix
2. small feature or output improvement
3. test-related task
4. multi-file coordinated task
5. verification failure and repair task

Optional if useful:

6. result/session surface task
7. script/verifier task

Tasks must not all touch the same file or same module.

Tasks must not be toy success-only prompts.

For each task, record:

- task description
- selected files
- provider state
- proposal state
- apply state
- verification command
- verification result
- repair state
- final verdict
- not-proven claims

## Phase 0: Task pack and baseline

Purpose:

Select the task pack and run baseline product-path behavior.

Must record:

- which tasks are real or realistic
- why each task matters
- expected target files
- expected verification command
- whether live provider is needed
- whether selected workspace apply is needed
- likely repair trigger if applicable

Deliverable:

- task pack table
- baseline result table
- top blockers

Audit:

- ensure tasks are not all easy same-file marker changes
- ensure verification commands are task-relevant, not node --version style smoke only

Optional commit:

route219: add real task quality baseline

## Phase 1: Task-relevant verification selection

Purpose:

Upgrade verification from command-channel proof to task-relevant validation.

Implementation target:

- map changed files to focused tests or route verifier commands where possible
- Planning Runtime verification intent chooses relevant command
- command requires explicit approval or existing safe policy
- command result attaches to task verdict
- missing relevant verification is not success
- blocked command is reported as blocked

Acceptance:

- at least 2 tasks use verification commands relevant to their changed files
- node --version style checks cannot satisfy task verification unless the task is command-runtime only
- failed command cannot success

Audit:

- check no command dispatch by default
- check no prompt-injected shell execution

Optional commit:

route219: select task relevant verification commands

## Phase 2: Multi-file task quality

Purpose:

Move beyond a small target-set proof into a useful multi-file task.

Implementation target:

- one task modifies at least two related files
- per-file exact proposal evidence
- per-file apply and readback evidence
- task-level verification command
- partial failure remains truthful
- one-file success cannot hide another-file failure

Acceptance:

- at least one multi-file task reaches apply/readback for all required files or stops with clear per-file failure
- per-file verdict appears in task-level report

Audit:

- check multi-file evidence is not flattened into a single success marker
- check no fuzzy apply

Optional commit:

route219: improve multi-file task quality

## Phase 3: Verification failure and repair execution

Purpose:

Move from repair-continuation-created to real repair behavior where possible.

Implementation target:

- create or use a task where verification fails
- preserve original failure
- generate repair proposal from failure evidence
- require separate repair confirmation
- apply repair through existing backend if exact-ready
- re-run relevant verification
- final success with repair keeps original failure visible

Acceptance:

- at least one task reaches repair-ready
- repair is applied and re-verified if exact-ready and authorized, or stops at repair-required with precise reason
- original failure is visible in final task verdict

Audit:

- check no hidden retry
- check repair proposal alone does not success
- check recovery available is not repair applied

Optional commit:

route219: execute verification repair loop

## Phase 4: Live provider task quality fixes

Purpose:

Fix the top 1-2 live provider or planning blockers discovered by the task pack.

Allowed fixes:

- context snippet selection
- provider prompt specificity for task-relevant exact patch
- target path normalization
- oldText/newText extraction support
- verification hint generation
- repair prompt input
- result/session clarity

Not allowed:

- fuzzy apply
- invented oldText
- broad provider rewrite
- multi-file scope creep beyond the selected task

Acceptance:

- at least 3 tasks have live provider patch evidence
- at least 2 tasks apply and verify
- failures have actionable classifications

Audit:

- check fake/focused evidence is not mislabeled live
- check raw provider output is not logged

Optional commit:

route219: improve live task quality blockers

## Phase 5: Task-level verdict surface

Purpose:

Use the project innovation point as a practical task verdict.

Implementation target:

Each task output must include a compact verdict table:

- context found
- provider/proposal
- anchor/exact-ready
- apply
- verification
- repair
- final verdict
- not-proven claims

Verdict statuses should be simple:

- verified-success
- verified-success-with-repair
- review-only
- confirmation-required
- verification-failed
- repair-required
- blocked
- unsupported

Acceptance:

- every Route219 task has a verdict row
- success requires apply and verification evidence
- not-proven claims stay visible
- no broad Claim Ledger rewrite unless needed to prevent false success

Audit:

- check final report cannot overclaim task completion

Optional commit:

route219: add task level verdict reporting

## Phase 6: Route219 benchmark

Purpose:

Create one route gate summarizing the real task quality result.

Benchmark must report:

- all tasks
- changed files
- provider state
- proposal state
- per-file apply/readback
- verification command and result
- repair state
- final verdict
- default safety markers
- raw-output/secrets safety markers

Acceptance:

- benchmark covers all required tasks
- benchmark separates live, deterministic, live-assisted, fake/focused, default-safe, network-blocked, and not-proven evidence
- no raw provider output/secrets
- no fake live success

Optional commit:

route219: add real task quality benchmark

## Phase 7: Final audit

Final audit subagent must answer:

- Did the route improve real task completion, not just benchmark shape?
- How many tasks reached verified-success?
- How many tasks used live provider patch evidence?
- Did verification commands relate to the changes?
- Did repair execute or stop honestly?
- Were per-file multi-file results preserved?
- Did any default path call provider/apply/command?
- Did any new writer or fuzzy apply appear?
- Were secrets/raw output/oldText/newText protected?
- Is final COMPLETE/PARTIAL/BLOCKED justified?

Optional commit:

route219: final task quality audit

## Required validation

Final validation should include:

- Route219 benchmark
- live provider task smoke
- focused tests for changed modules
- task-relevant verification selection tests
- multi-file evidence tests
- repair execution tests
- task verdict/report tests
- Route218 benchmark
- Route217 benchmark
- Route216 benchmark
- Route215 benchmark
- Route214 benchmark
- Route213 benchmark
- Route212 benchmark
- Route211 benchmark
- Route210 benchmark
- Route209 benchmark
- verify:result-contract
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Do not paste full stdout.

## Final report

Do not print provider secrets.

Do not paste raw provider output.

Do not paste provider oldText/newText.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Task pack results
4. Verified-success count
5. Live provider patch count
6. Multi-file task result
7. Task-relevant verification results
8. Repair result
9. Task-level verdict table
10. Provider primary/fallback status
11. Safe diagnostics for failures
12. Benchmarks and commands with pass/fail only
13. Files changed
14. Remaining not-proven claims
15. Next route recommendation
