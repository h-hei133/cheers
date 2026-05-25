# Route 218: Real Authorized Coding Capability Expansion

## Goal

Route217 proved live provider exact single-file editing on three friendly tasks in one file.

Route218 must expand this into real authorized coding capability.

This is not a single-point proof route. Cross-module single-file validation is only Phase 1 and must not be used as the stopping point.

Target progression:

cross-module live single-file
-> small multi-file live or live-assisted exact patch
-> explicit selected-workspace apply
-> authorized verification command
-> verification failure and repair continuation
-> real task pack audit

The route should move the project from:

live provider can edit one friendly file

to:

the product path can perform small real authorized coding tasks across modules, with truthful failure handling.

## Completion rule

COMPLETE requires product-path evidence across the full route, not only Phase 1.

COMPLETE requires:

- at least 5 real or realistic product-path tasks run
- at least 3 cross-module single-file tasks, not all in the same file or module
- at least 2 live provider exact patches applied and readback verified
- at least 1 small multi-file task reaches exact proposals for multiple files and is either applied+verified or stops with truthful per-file evidence
- at least 1 explicitly authorized selected-workspace apply case
- at least 1 authorized verification command case
- at least 1 verification-failure-to-repair-continuation case, or a clearly marked blocked repair case with preserved failure evidence
- all failures classified precisely
- default path remains no-provider, no-apply, no-command
- no new writer
- no fuzzy direct apply
- no fake live success
- no secrets/raw provider output/oldText/newText printed

PARTIAL if only cross-module single-file succeeds.

PARTIAL if all success is fake/focused/deterministic and live provider does not materially participate.

BLOCKED if real provider or selected workspace path cannot safely run because of network/auth/config/policy.

## Route budget and commit policy

This is an aggressive long route.

Expected runtime: several hours if needed.

Execute in phases.

For each phase:

1. Assign subagents to inspect local seams and relevant reference repos.
2. Implement or run that phase.
3. Validate.
4. Run audit subagent.
5. If green, commit with message starting route218:.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Maximum 7 phase commits unless a small cleanup is required.
- Final report must list commits and git status.
- Do not stop after Phase 1.

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

- cross-module task selection and context: GitNexus, gemini-cli, pi, graphiti
- live patch loop and edit application: OpenHands, mini-swe-agent, opencode
- multi-file task handling: OpenHands, mini-swe-agent, opencode
- selected workspace authority and permissions: opencode, OpenHands
- verification command loop: mini-swe-agent, OpenHands, inspect_ai
- repair continuation and failure trajectory: OpenHands, inspect_ai, mini-swe-agent
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
- small multi-file proposal handling
- selected workspace authority path
- existing proof backend handoff
- readback verification
- authorized verification command path
- repair continuation path
- result/session evidence surfaces
- Route218 benchmark/task pack

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

## Phase 0: Capability baseline and task pack selection

Purpose:

Select a real task pack that is not biased toward one file.

Task pack must include:

1. cross-module single-file task in planning/orchestration area
2. cross-module single-file task in result/session surface area
3. cross-module single-file task in script/verifier/test area
4. small multi-file task
5. selected workspace authorized apply task
6. verification failure or repair continuation task

Some tasks may overlap, but the pack must still cover the capabilities above.

Must record:

- task description
- target files
- module area
- why this is not a toy success-only task
- expected verification
- whether live provider will be used
- risk and fallback classification

Audit:

- ensure tasks are not all from the same file/module
- ensure Phase 1 cannot satisfy the whole route

Optional commit:

route218: add real authorized task pack baseline

## Phase 1: Cross-module live single-file expansion

Purpose:

Prove Route217 is not targetRanking.ts-specific.

Run at least three live single-file tasks across different modules.

Acceptance:

- at least 3 tasks run
- at least 2 reach live exact-ready
- at least 2 apply through existing backend and readback verify
- each task reports provider status, anchor status, apply status, verification status
- no raw output/secrets/oldText/newText printed

If a task fails:

- classify precisely
- fix only the top blocker if local and high-value

Audit:

- confirm this phase did not stop the route
- confirm modules/files are diverse

Optional commit:

route218: expand live single-file coverage

## Phase 2: Small multi-file live or live-assisted task

Purpose:

Move from single-file to small multi-file editing.

Task examples:

- implementation file plus test file
- runtime file plus result surface file
- script/verifier file plus package script
- planner file plus focused test

Implementation target:

- provider may produce multi-file exact patches if supported
- if live provider cannot produce multi-file exact patches, allow live-assisted strategy:
  provider proposes structured change intent, deterministic exact builder creates per-file exact patches from read evidence
- evidence must label live, deterministic, and live-assisted correctly
- per-file status required: target, anchor, apply, verify, failed, unattempted
- partial success cannot become full success

Acceptance:

- at least one small multi-file task reaches per-file exact proposal state
- apply/verify if explicit confirmation and authority are present
- partial or unsupported cases remain truthful

Audit:

- check one-file success does not hide second-file failure
- check live-assisted is not mislabeled as live-authored

Optional commit:

route218: add small multi-file authorized editing path

## Phase 3: Selected workspace authorized apply

Purpose:

Move beyond isolated controlled fixtures where safe.

Implementation target:

- selected workspace apply requires explicit authority
- final stale-read or anchor freshness check
- snapshot or recovery evidence
- existing proof backend only
- changed files remain inside selected workspace
- default still no-write

Acceptance:

- at least one selected workspace task applies and readback verifies, or is blocked with precise authority/safety reason
- no production write by default
- prompt text alone cannot grant authority

Audit:

- check explicit authority is recorded
- check no workspace escape

Optional commit:

route218: prove selected workspace authorized apply

## Phase 4: Authorized verification command selection and execution

Purpose:

Make verification more useful than readback.

Implementation target:

- Planning Runtime selects verification intent
- route chooses focused allowlisted command when possible
- command requires explicit approval or existing safe policy
- command result attaches to product result/session
- failed command cannot success
- blocked command reports blocked

Acceptance:

- at least one task runs authorized verification command
- command pass contributes to verified result
- command fail/block remains truthful

Audit:

- check no command dispatch by default
- check no prompt-injected shell execution

Optional commit:

route218: run authorized task verification command

## Phase 5: Verification failure and repair continuation

Purpose:

Prove failure can continue into repair path.

Implementation target:

- create or use a task where verification fails
- preserve original failure
- produce repair proposal or repair continuation
- repair proposal is no-write
- repair confirmation is separate
- repair apply uses existing backend if executed
- re-verification required for success

Acceptance:

- at least one verification failure reaches repair-ready or repair-continuation state
- if repair is applied, original failure remains visible
- if repair is not applied, not counted as repaired

Audit:

- check no hidden retry
- check recovery available is not repair applied

Optional commit:

route218: connect real task repair continuation

## Phase 6: Real authorized coding benchmark

Purpose:

Create one benchmark/gate that summarizes the real capability expansion.

Benchmark must report:

- each task
- product path used
- provider status
- target files
- exact proposal status
- per-file anchor/apply/verify
- selected workspace authority
- verification command status
- repair status
- terminal result
- default safety markers

Acceptance:

- benchmark covers all required route capabilities
- benchmark separates live, deterministic, live-assisted, fake/focused, default-safe, network-blocked, and not-proven evidence
- no raw provider output/secrets
- no fake live success

Optional commit:

route218: add real authorized coding benchmark

## Phase 7: Final audit

Final audit subagent must answer:

- Did capability move beyond Route217 friendly single-file tasks?
- How many live exact patches succeeded?
- Did at least one multi-file task reach per-file exact proposal state?
- Did selected workspace apply work or block honestly?
- Did verification command run under authorization?
- Did verification failure lead to repair continuation?
- Which tasks failed and why?
- Did any default path call provider/apply/command?
- Did any new writer or fuzzy apply appear?
- Were secrets/raw output/oldText/newText protected?
- Is final status COMPLETE/PARTIAL/BLOCKED justified?

Optional commit:

route218: final capability expansion audit

## Required validation

Final validation should include:

- Route218 benchmark
- live provider task smoke
- focused tests for changed modules
- selected workspace authority tests
- multi-file per-file evidence tests
- verification command tests
- repair continuation tests
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
3. Task pack summary
4. Cross-module single-file results
5. Multi-file result
6. Selected workspace apply result
7. Verification command result
8. Repair continuation result
9. Provider primary/fallback status
10. Safe diagnostics for failures
11. Benchmarks and commands with pass/fail only
12. Files changed
13. Remaining not-proven claims
14. Next route recommendation
