# Route 213: Exact Proposal Generation from Product Planning

## Goal

Fix the main blocker found by Route212.

Route212 proved that real product-path tasks can now find better files, read useful context, and reach handoff-ready or review-ready.

But the real tasks still often stop at:

- proposal review-only
- anchor missing-exact-mapping
- apply not-run
- verification not-run

Route213 must upgrade the product loop from:

planning knows where to edit

to:

planning can produce or obtain an exact proposal that the existing proof backend can anchor, review, confirm, apply, and verify.

Target flow:

vague task
-> product Planning Runtime
-> candidate target and read evidence
-> exact proposal generation
-> proposal normalization
-> exact anchor
-> review
-> explicit confirmation
-> existing proof backend
-> readback and optional verification command
-> Claim Ledger/result verdict

This route is about making the agent able to turn a plan into a concrete patch. It is not another context route and not another proof-only route.

## Completion rule

COMPLETE only if product-path evidence proves:

- Route212-style real tasks can move beyond review-ready into exact-proposal-ready or exact-ready
- product path can generate proposal input without manual internal JSON
- at least two real or realistic product-path tasks produce exact proposals from planning/read evidence
- at least one confirmed controlled or selected-workspace case applies through the existing backend and verifies
- exact proposal generation is not display-only
- failed or weak proposals stop truthfully as review-only or missing-exact-mapping
- live provider opt-in is supported safely or honestly reported as NETWORK-BLOCKED / REVIEW-ONLY / FAILED
- no new writer, no fuzzy direct apply, no fake live success

PARTIAL if only demo/focused/module evidence exists or exact proposal does not reach product backend.

BLOCKED if safe exact proposal generation cannot be integrated into the product path.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign subagents to inspect local seams and relevant reference repos.
2. Implement that phase.
3. Validate.
4. Run audit subagent.
5. If green, commit with message starting route213:.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Maximum 4 phase commits unless a blocker requires one extra cleanup commit.
- Final report must list phase commits and git status.

## Reference repository pool

All repos are under /home/wang/projects:

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

Use references only by phase. Main thread must not broad-read all repos.

Recommended mapping:

- patch generation loop: mini-swe-agent, OpenHands, opencode
- provider proposal prompting and tool orchestration: opencode, OpenHands, gemini-cli
- exact diff or edit normalization: mini-swe-agent, opencode
- context-to-edit reasoning: GitNexus, gemini-cli, pi
- result/eval reporting: inspect_ai, OpenHands

Subagent reports must be short:

- blocker or pattern
- reference repo area
- local seam
- recommended implementation
- audit risk

## Real provider policy

Live provider is allowed only under explicit opt-in.

Use only the existing approved private provider config loading path.

The user has primary SiliconFlow and fallback SiliconFlow configured in /home/wang/.private-agents-real/provider.env.

Do not cat, grep, print, echo, upload, or dump provider config.

Do not print API keys.

Do not print raw provider output.

Primary may be tried once.

Fallback may be tried once if primary fails with a network/provider-availability class where fallback is appropriate.

No retry loops.

If both are blocked by network/proxy/API availability, mark NETWORK-BLOCKED.

If auth/config fails, mark AUTH-FAILED or CONFIG-FAILED.

If provider output is usable only for human review, mark REVIEW-ONLY and do not fake exact-ready.

Never fake live success.

## Scope

Allowed:

- packages/ts-shell broadly
- product Planning Runtime
- proposal generation and normalization modules
- provider proposal path
- anchoring modules
- existing proof backend handoff
- verification/readback modules
- result/session surfaces needed for exact proposal status
- route benchmark scripts

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large cli.tsx refactor
- large SessionManager refactor

Not allowed:

- new writer
- fuzzy direct apply
- broad arbitrary refactor
- production writes by default
- provider call by default
- command dispatch by default
- new dependencies
- browser/MCP product work
- raw provider output logging
- manual private config reads

## Phase 0: Baseline exact-mapping failure audit

Purpose:

Reproduce Route212 blockers and identify why review-ready tasks do not become exact proposals.

Use the Route212 task cases:

- vague bugfix around planningRuntimeProductProjection or a similar current-repo issue
- feature/output improvement around realTaskLoopRepairChain or a similar current-repo issue
- verification/test-related controlled case

Must answer:

- what target was selected
- what read evidence exists
- why exact mapping is missing
- whether current proposal data is text-only or structured
- which backend input is missing
- whether provider or deterministic proposal generation should be used

Deliverable:

- exact-mapping blocker table
- selected product seam
- top proposal generation fix

Optional commit:

route213: baseline exact proposal blockers

## Phase 1: Exact proposal contract from planning evidence

Purpose:

Define the product-path exact proposal shape that can be produced from Planning Runtime and read evidence.

Implementation target:

- target file
- read receipt or source snippet
- old text or anchor
- new text or replacement intent
- expected change summary
- verification intent
- proposal source: deterministic, live-provider, fake, focused
- readiness: exact-proposal-ready, review-only, missing-exact-mapping, unsupported
- no mutation authority granted by proposal alone

Acceptance:

- product path emits structured exact proposal state
- proposal-only cannot success
- weak proposal remains review-only
- unsupported tasks stop clearly

Audit:

- check this is consumed by backend path or prepared for consumption, not just display text

Optional commit:

route213: add exact proposal contract from planning

## Phase 2: Deterministic exact proposal path

Purpose:

Create a stable non-live path that can generate exact proposals from read evidence for bounded tasks.

This is not a fake live provider. It is a deterministic local proposal path for bounded cases and tests.

Implementation target:

- use existing read evidence and target file content
- produce exact old/new mapping for bounded simple changes
- reject broad or ambiguous changes
- normalize into existing proposal/anchoring backend input
- keep proposal source clearly labeled deterministic/focused

Acceptance:

- at least two product-path tasks can produce exact proposal or exact-ready state without manual JSON
- failed cases report missing-exact-mapping or unsupported
- no provider call by default
- no apply by default

Audit:

- check deterministic success is not labeled live provider success
- check exact mapping is real and not marker-only

Optional commit:

route213: generate deterministic exact proposals

## Phase 3: Live provider exact proposal quality

Purpose:

Improve live provider proposal path so it can produce exact proposals more often, while staying honest.

Reference focus:

- opencode and OpenHands for provider/tool prompting
- gemini-cli for model interaction patterns
- mini-swe-agent for patch style simplicity

Implementation target:

- provider prompt includes exact output contract
- provider output validation expects exact target and replacement or hunk
- normalization converts valid output into proposal input
- anchor quality is exact-ready only when current file evidence supports it
- review-only remains review-only
- primary/fallback SiliconFlow behavior follows provider policy

Acceptance:

- explicit live opt-in either reaches exact-ready, review-only, NETWORK-BLOCKED, AUTH-FAILED, CONFIG-FAILED, or FAILED with clear reason
- raw provider output excluded
- fake/focused evidence not labeled live
- fallback not called unless appropriate

Audit:

- check no secret or raw output leak
- check provider-called does not imply apply

Optional commit:

route213: improve live provider exact proposal path

## Phase 4: Backend apply and verification from exact proposal

Purpose:

Make exact proposals generated by product planning flow reach the existing proof backend.

Implementation target:

- exact proposal enters existing anchoring/proposal apply path
- explicit confirmation required
- selected or controlled workspace authority required
- existing writer only
- readback verification required
- optional verification command only if explicitly authorized
- result/session shows exact-proposal, anchor, confirmation, apply, verification states

Acceptance:

- one confirmed controlled or selected workspace case applies and readback verifies
- default path remains review-only/no-write
- applied but unverified cannot success
- partial failure remains truthful

Audit:

- check no new writer
- check no fuzzy direct apply
- check terminal success derives from runtime evidence

Optional commit:

route213: apply and verify exact proposals

## Phase 5: Product task benchmark

Purpose:

Prove Route213 improves the real blockers from Route212.

Benchmark cases:

- Route212 vague bugfix case now reaches exact proposal or exact-ready, not only review-ready
- Route212 feature/output case now reaches exact proposal or exact-ready, or stops with a precise non-generic reason
- verification/test-related case still reaches apply/readback/command verification
- live provider opt-in case reports exact-ready, review-only, NETWORK-BLOCKED, or exact failure class honestly
- unsupported broad task stops clearly

Each case reports:

- product path used
- proposal source
- exact mapping status
- anchor status
- confirmation state
- apply state
- verification state
- terminal result
- provider primary/fallback status if used

Acceptance:

- benchmark shows before/after improvement from Route212 blockers
- no demo-only completion
- no fake live success
- no secret output

Optional commit:

route213: add exact proposal benchmark

## Phase 6: Final audit

Final audit subagent must answer:

- Did real product tasks move beyond review-ready?
- Are exact proposals consumed by existing backend?
- Are live provider statuses honest?
- Did any default path call provider, apply, or run commands?
- Did any new writer or fuzzy apply appear?
- Did any proposal-only path claim success?
- Are result/session states clear?

Final status must be COMPLETE / PARTIAL / BLOCKED.

Optional commit:

route213: final exact proposal audit adjustments

## Required validation

Final validation should include:

- exact proposal contract tests
- deterministic exact proposal tests
- live provider classification tests
- backend apply/readback tests
- Route212 benchmark or task sprint
- Route213 benchmark
- Route209 benchmark
- Route210 benchmark
- Route211 benchmark
- verify:result-contract
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Real provider:

- explicit opt-in only
- primary once, fallback once if appropriate
- no repeated retries
- NETWORK-BLOCKED if network/proxy/API unavailable
- no fake success
- no secrets or raw output in logs

## Final report

Do not paste full stdout.

Do not print provider secrets or raw provider output.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Route212 blocker before/after
4. Exact proposal contract
5. Deterministic proposal behavior
6. Live provider primary/fallback status
7. Backend apply/verification result
8. Benchmark results
9. Commands run with pass/fail and key fields only
10. Files changed
11. Remaining not-proven claims
12. Next route recommendation
