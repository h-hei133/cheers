# Route 211: Practical Authorized Coding Loop

## Goal

Merge the next capability steps into one aggressive route.

Route208 made vague tasks enter the real product planning path.
Route209 made planning edit targets consumable by the proof-carrying mutation backend.
Route210 proved an engineering-style review-confirm-execute loop, but it still requires manual proposal JSON and remains too test-shaped.

Route211 must turn that engineering loop into a practical authorized coding loop.

Target flow:

vague user task
-> product Planning Runtime
-> product proposal generation or live provider proposal
-> proposal validation and anchoring
-> user-visible review
-> explicit confirmation
-> selected or controlled workspace authority
-> existing proof-carrying apply backend
-> readback verification and optional allowlisted test command
-> Claim Ledger/result verdict
-> repair path if verification fails

Default remains safe:

- no provider call by default
- no apply by default
- no command dispatch by default
- no production write by default

But with explicit opt-in and confirmation, the product path must be able to perform real useful work without requiring the user to handcraft internal proposal JSON.

## Hard completion rule

COMPLETE requires product-path evidence, not demo-only evidence.

COMPLETE only if:

- the user no longer needs to pass manual internal proposal JSON for the main authorized path
- product path can prepare or obtain a proposal from planning output
- explicit live provider opt-in can call the approved real-provider path, or correctly reports NETWORK-BLOCKED
- primary and fallback provider config are handled safely through existing/private approved provider config seams
- provider output is validated and anchored before review
- explicit confirmation can apply through existing proof backend
- selected workspace apply is supported only with explicit authority
- allowlisted verification command can run only with explicit approval or existing safe policy
- failed verification can produce repair continuation or repair proposal path
- result/session output shows provider/proposal/anchor/confirmation/apply/verification/repair evidence
- no new writer, no fuzzy direct apply, no fake live success

If real provider is unavailable because of network or API failure, final status may still be COMPLETE only for non-live practical loop work, but live-provider status must be NETWORK-BLOCKED or FAILED with exact reason. Do not claim live success.

PARTIAL if core capability only works in tests, benchmark, or internal route.

BLOCKED if safe authorized product path cannot be found.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign subagents to study local seams and relevant reference repos.
2. Main thread synthesizes.
3. Implement that phase.
4. Run focused validation.
5. Run audit subagent.
6. If green, commit with message starting route211:.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Final report must list phase commits and final status.
- If commit is blocked by policy, continue and report phase diffs.

## Reference repository pool

All reference repos are under /home/wang/projects:

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

Use references by phase. Main thread must not broad-read all repos.

Required mapping:

- proposal generation and coding loop: OpenHands, mini-swe-agent, opencode
- provider/tool orchestration: opencode, OpenHands, gemini-cli
- approval and selected workspace authority: opencode, OpenHands
- verification command loop: mini-swe-agent, OpenHands, inspect_ai
- repair loop and task trajectory: OpenHands, inspect_ai, mini-swe-agent
- result/session surface: opencode, OpenHands, inspect_ai
- context/impact only if needed: GitNexus, graphiti, pi, gemini-cli

Subagent reports must be short:

- pattern found
- reference repo area
- local seam
- recommendation
- audit risk

## Real provider policy

The user has configured a primary and fallback SiliconFlow real-provider setup in /home/wang/.private-agents-real/provider.env.

The implementation may rely on existing approved real-provider config loading paths only.

Do not manually cat, grep, print, upload, echo, or log private provider config.

Do not print API keys.

Do not print raw provider output.

Do not add provider.env to git.

Do not upload or persist provider secrets anywhere.

Expected provider behavior:

- primary provider: siliconflow, base URL api.siliconflow.cn
- fallback provider: siliconflow, base URL api.siliconflow.com
- model: DeepSeek-V4-Flash
- API keys must remain redacted and never appear in logs

Real-provider tests:

- must be explicit opt-in only
- primary may be tried once
- fallback may be tried once if primary returns network/auth/rate/provider-unavailable class where fallback is appropriate
- no retry loops
- if both fail due to network/proxy/API availability, mark NETWORK-BLOCKED
- if auth/config fails, mark CONFIG-FAILED or AUTH-FAILED
- do not fake live success
- fake/focused provider success must remain labeled fake/focused, not live
- raw provider output excluded from final report

## Scope

Allowed:

- packages/ts-shell broadly
- runMvpIntegratedFlow careful product-path integration
- Planning Runtime product path
- provider proposal and anchoring modules
- approval/confirmation modules
- selected workspace authority modules
- proof backend handoff modules
- verification command planning/running modules
- repair path modules
- result/session/continue surfaces
- benchmarks/verifiers needed for this route

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large cli.tsx refactor
- large SessionManager refactor

Not allowed:

- new writer
- fuzzy direct apply
- production workspace writes by default
- provider call by default
- command dispatch by default
- browser/MCP product work
- new dependencies
- raw provider output logging
- manual private config reads
- broad Claim Ledger expansion unless needed to prevent false success

## Phase 0: Baseline and capability contract

Purpose:

Confirm current Route210 limits and define exact authorized loop requirements.

Subagents:

- product loop baseline subagent
- reference coding-loop subagent

Must answer:

- where manual proposal JSON is currently required
- where product proposal preparation should happen
- how selected workspace authority currently works
- how real-provider opt-in currently works
- how verification command and repair path can attach
- which product paths still bypass the authorized loop

Deliverable:

- baseline table
- capability contract
- non-completion list

Optional commit:

- route211: baseline practical loop contract

## Phase 1: Remove manual proposal JSON from main product path

Purpose:

Make product path able to prepare proposal input from Planning Runtime handoff without requiring user-authored internal JSON.

Reference focus:

- mini-swe-agent patch loop
- OpenHands edit action flow
- opencode tool flow

Implementation target:

- planning output can become proposal request or proposal preparation input
- deterministic/focused proposal path exists for tests
- user-facing review does not require internal JSON
- proposal-prepared is not applied
- unsupported cases stop clearly

Acceptance:

- product path can reach proposal-prepared or review-ready without manual proposal JSON
- old explicit proposal JSON path may remain for debugging but is not the main path
- no provider call by default
- no apply by default

Audit:

- check this is product-path, not benchmark-only
- check no proposal implies success

Optional commit:

- route211: prepare product proposals from planning handoff

## Phase 2: Live provider proposal opt-in with fallback

Purpose:

Allow explicit opt-in live provider proposal generation from product path.

Reference focus:

- opencode and OpenHands for model/tool orchestration
- gemini-cli for provider configuration patterns

Implementation target:

- product path can request live provider proposal only with explicit opt-in
- reuse existing approved provider readiness and adapter path
- primary SiliconFlow config tried first
- fallback SiliconFlow config tried only when appropriate
- output validation required
- anchoring required
- raw provider output excluded
- network failures classified as NETWORK-BLOCKED
- fake/focused success cannot become live success

Acceptance:

- default path provider-called=false
- live opt-in either produces provider-called=true with valid proposal/anchor evidence or NETWORK-BLOCKED/CONFIG-FAILED/AUTH-FAILED
- fallback attempt is visible as metadata without secrets
- no retries beyond primary once and fallback once
- no provider call during apply

Audit:

- check no secrets in logs
- check no fake live success
- check raw provider output excluded

Optional commit:

- route211: add live provider proposal opt-in fallback

## Phase 3: Selected workspace authorized apply

Purpose:

Move beyond controlled temp workspace only, while preserving explicit authority.

Reference focus:

- opencode and OpenHands for permission/workspace authority
- mini-swe-agent for patch application simplicity

Implementation target:

- selected workspace apply available only with explicit confirmation and authority
- final stale-read or anchor freshness check
- snapshot or recovery evidence
- existing exact/proof backend only
- no new writer
- no fuzzy direct apply
- no default production writes
- controlled temp path remains available

Acceptance:

- default remains no-write
- confirmed selected workspace path can apply through existing backend
- changed files remain inside selected workspace
- partial failure is truthful
- explicit-target behavior stable

Audit:

- check prompt text cannot grant authority
- check selected workspace authority is explicit and recorded

Optional commit:

- route211: authorize selected workspace proof apply

## Phase 4: Allowlisted verification command path

Purpose:

Upgrade from readback-only verification to useful test command verification when explicitly allowed.

Reference focus:

- mini-swe-agent issue/test loop
- OpenHands runtime verification
- inspect_ai scorer/eval reporting

Implementation target:

- Planning Runtime verification intent can propose allowlisted commands
- commands require existing permission/safe policy
- command dispatch is not default
- command receipts attach to result/session
- failed command cannot success
- readback verification still runs where applicable

Acceptance:

- default command-dispatch=not-run
- explicit allowed verification command can run in controlled/selected safe path
- blocked command reports blocked, not success
- failed command reports verification-failed
- passed command can contribute to verified success

Audit:

- check no command allowlist expansion without explicit reason
- check no shell execution by prompt injection

Optional commit:

- route211: run authorized verification commands

## Phase 5: Product repair continuation

Purpose:

Connect verification failure to the existing repair proof chain through product path.

Reference focus:

- OpenHands failure/retry loop
- inspect_ai trajectory/eval
- mini-swe-agent repair simplicity

Implementation target:

- failed verification preserves original failure
- repair proposal is no-write
- repair confirmation separate from initial confirmation
- repair apply uses existing backend
- re-verification required for success
- session/continue output shows repair next action

Acceptance:

- verification failed cannot success
- repair proposal cannot success
- repair confirmed apply can lead to verified-success-with-repair
- original failure remains visible

Audit:

- check repair is not hidden retry
- check recovery available is not repair applied

Optional commit:

- route211: connect repair continuation product path

## Phase 6: Practical loop benchmark

Purpose:

Prove the full authorized loop on realistic product-path cases.

Benchmark cases:

- default vague task review-only, no provider, no apply
- product proposal prepared without manual JSON
- live provider opt-in primary or fallback, or NETWORK-BLOCKED
- confirmed controlled apply
- confirmed selected workspace apply in safe fixture or selected test workspace
- allowlisted verification passed
- verification failed -> repair continuation
- command-only bypass
- unsupported broad refactor stops clearly

Each case reports:

- product path used
- provider state
- fallback state
- proposal state
- anchor state
- confirmation state
- workspace authority
- apply state
- verification state
- repair state
- terminal verdict
- no-write/default safety markers

Acceptance:

- benchmark distinguishes live, fake, focused, default-safe, network-blocked, and not-proven
- no demo-only completion
- no secret output
- no fake live success

Audit:

- final benchmark audit checks every claim against evidence

Optional commit:

- route211: add practical authorized loop benchmark

## Phase 7: Final audit

Final audit subagent must answer:

- Can the main product path avoid manual proposal JSON?
- Can live provider opt-in use primary/fallback safely?
- Are network failures labeled NETWORK-BLOCKED?
- Can selected workspace apply run only with explicit authority?
- Can allowlisted verification command run only when authorized?
- Can repair continuation flow preserve original failure?
- Which evidence is live, fake, focused, default-safe, network-blocked, or not-proven?
- Were any secrets printed?
- Was any new writer or fuzzy apply introduced?
- Did any default path call provider, apply, or dispatch commands?

Final status must be COMPLETE / PARTIAL / BLOCKED.

Optional commit:

- route211: final practical loop audit adjustments

## Required validation

Run targeted checks during phases.

Final validation should include:

- product proposal preparation tests
- live provider opt-in/fallback classification tests
- selected workspace authority tests
- backend apply/readback tests
- verification command tests
- repair continuation tests
- result/session tests
- Route209 benchmark
- Route210 benchmark
- Route211 benchmark
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Real provider gate:

- run only with explicit opt-in
- use approved config path
- primary once, fallback once if appropriate
- if network/proxy/API unavailable, report NETWORK-BLOCKED
- do not retry repeatedly
- do not fake success
- do not print secrets or raw provider output

## Final report

Do not paste full stdout.

Do not print provider secrets.

Do not paste raw provider output.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase summary
3. Phase commits
4. Reference repos studied by phase
5. Manual proposal JSON removal status
6. Live provider primary/fallback status
7. Provider failure classification if any
8. Selected workspace apply behavior
9. Verification command behavior
10. Repair continuation behavior
11. Benchmark results
12. Commands run with pass/fail and key fields only
13. Files changed
14. Remaining not-proven claims
15. Next route recommendation
