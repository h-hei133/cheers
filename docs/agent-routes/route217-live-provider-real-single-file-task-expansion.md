# Route 217: Live Provider Real Single-file Task Expansion

## Goal

Route216 proved that the configured live provider can act as an exact patch author on a tiny calibration task:

live provider
-> exact oldText/newText
-> exact-ready
-> existing proof backend apply
-> readback verification

Route217 must expand this from calibration to real small single-file tasks.

This route answers:

Can the live provider produce exact patches for real repository tasks, not only tiny calibration fixtures?

Target flow:

real small task
-> product Planning Runtime
-> context/read evidence
-> live provider exact patch proposal
-> exact anchor
-> review
-> explicit confirmation
-> controlled or selected workspace apply through existing proof backend
-> readback verification
-> optional authorized verification command
-> truthful result

This route should not jump to multi-file provider editing yet.

## Completion rule

COMPLETE requires product-path evidence for real single-file tasks.

Complete if:

- at least 3 real or realistic current-repo single-file tasks are run through the product path
- at least 2 tasks reach live exact-ready or recovered-exact-ready, or one task reaches live apply/readback and the others fail with actionable classifications
- at least 1 live provider generated exact patch is confirmed, applied through the existing proof backend, and readback verified
- failures are classified precisely: context-missing, provider-output-insufficient, target-mismatch, old-text-not-found, old-text-multiple-matches, review-only, network-blocked, auth-failed, config-failed, provider-error
- no raw provider output, oldText/newText, secrets, or provider config are printed
- no fake/focused evidence is labeled live
- no new writer
- no fuzzy direct apply
- no provider/apply/command dispatch by default

PARTIAL if live provider only works on calibration or fake/focused cases.

BLOCKED if approved live provider path cannot safely run because of network/auth/config.

## Route budget

Target runtime: 60-120 minutes.

Hard limits:

- 3 required task cases
- 2 optional task cases only if time remains
- max 2 core fixes
- max 4 phase commits
- primary provider once per live task case
- fallback once only when policy allows
- no retry loops

## Phase and commit policy

For each phase:

1. Run or inspect product-path behavior.
2. Identify the real blocker.
3. Use subagents only for that blocker or phase.
4. Implement the smallest useful fix.
5. Validate and audit.
6. If green, commit with message starting route217:.

Do not push.

Do not commit failing states.

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

Use references only for concrete blockers.

Suggested mapping:

- live patch prompting: opencode, OpenHands, gemini-cli
- small task patch loops: mini-swe-agent, OpenHands
- context-to-edit target reasoning: GitNexus, gemini-cli, pi
- verification/eval reporting: inspect_ai, OpenHands
- result/session surface: opencode, OpenHands

Main thread must not broad-read references.

Subagent reports must be short:

- blocker
- reference pattern
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

Primary may be tried once per live task case.

Fallback may be tried once only if primary fails with network/provider availability class where fallback is appropriate.

No retry loops.

If both are blocked by network/proxy/API availability, mark NETWORK-BLOCKED.

If auth/config fails, mark AUTH-FAILED or CONFIG-FAILED.

If provider output lacks exact patch fields, mark PROVIDER-OUTPUT-INSUFFICIENT or REVIEW-ONLY with safe diagnostics.

Never fake live exact-ready.

## Scope

Allowed:

- product Planning Runtime
- live provider exact patch path
- prompt/contract tuning
- context/read evidence selection
- exact proposal parser/normalizer
- anchoring path
- existing proof backend handoff
- readback verification
- allowlisted verification command only when explicitly authorized
- result/session evidence
- Route217 benchmark

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large cli.tsx refactor
- large SessionManager refactor

Not allowed:

- multi-file live provider edit in this route
- new writer
- fuzzy direct apply
- broad arbitrary edit
- provider call by default
- apply by default
- command dispatch by default
- production workspace write by default
- new dependencies
- browser/MCP work
- raw provider output logging
- manual private config reads

## Required task pack

Run 3 required single-file real or realistic current-repo tasks.

Task 1: small output/message improvement

Example shape:
- one file
- simple visible output or wording change
- expected oldText/newText should be obvious

Task 2: small behavior/logic fix

Example shape:
- one file
- simple conditional, status label, classification, or result projection behavior

Task 3: small test or verification-related improvement

Example shape:
- one test file or one verification fixture
- live provider must propose exact change or fail with clear reason

Optional if time remains:

Task 4: selected workspace authorized apply case
Task 5: verification failure -> repair continuation case

Do not use toy success-only tasks that bypass the product path.

## Phase 0: Baseline real task selection

Purpose:

Choose the 3 required tasks and run baseline product-path planning.

Must record:

- task description
- target file selected
- read evidence available
- whether task is truly single-file
- whether provider has enough context
- expected verification method
- risk of broad or ambiguous edit

Deliverable:

- task table
- selected 3 tasks
- not-proven claims

Optional commit:

route217: add live single-file task baseline

## Phase 1: First live exact patch task

Purpose:

Run live provider on the clearest single-file task.

Acceptance:

- provider called through approved seam
- exact patch produced or failure classified
- if exact-ready, explicit confirmation applies through existing backend
- readback verification runs after apply
- no raw output or secrets

If failure occurs:

- classify precisely
- fix only if the blocker is local and high-value

Optional commit:

route217: complete first live single-file task

## Phase 2: Expand to second and third tasks

Purpose:

Run the remaining required tasks.

Acceptance:

- each task has precise provider/proposal/anchor/apply/verification status
- at least one task improves beyond baseline
- do not retry provider endlessly
- do not broaden to multi-file

Optional commit:

route217: expand live single-file task coverage

## Phase 3: Fix top blocker

Purpose:

If fewer than 2 tasks reach exact-ready, fix the top blocker.

Allowed fixes:

- provider prompt specificity
- context snippet selection
- exact target evidence
- oldText/newText extraction
- target path normalization
- review-only reason projection
- verification intent clarity

Not allowed:

- fuzzy apply
- invented oldText
- broad provider rewrite
- multi-file expansion

Optional commit:

route217: improve live single-file blocker

## Phase 4: Route217 benchmark and final audit

Benchmark cases:

- default no provider/no apply
- calibration exact-ready still passes
- real task 1 live status
- real task 2 live status
- real task 3 live status
- at least one live exact-ready apply/readback if achieved
- provider-output-insufficient classification if not
- no raw output/secrets
- no fake live success

Final audit must answer:

- How many real tasks reached live exact-ready?
- How many applied and readback verified?
- What blocked the remaining tasks?
- Did any task require fake/focused evidence?
- Did any new writer/fuzzy apply appear?
- Did default path remain closed?
- Should next route expand provider, context, or verification?

Optional commit:

route217: add live single-file task benchmark

## Required validation

Final validation should include:

- Route217 benchmark
- live provider smoke for selected tasks
- focused tests for changed modules
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
3. Three task results
4. Live exact-ready count
5. Live apply/readback count
6. Provider primary/fallback status
7. Safe diagnostics for failures
8. Fixes made
9. Benchmarks and commands with pass/fail only
10. Files changed
11. Remaining not-proven claims
12. Next route recommendation
