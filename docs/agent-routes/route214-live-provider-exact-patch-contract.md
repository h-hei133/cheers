# Route 214: Live Provider Exact Patch Contract

## Goal

Fix the current biggest capability gap:

The deterministic path can now produce exact single-file proposals from Planning Runtime evidence, then confirm, apply, and verify.

The live-provider path can call SiliconFlow, but currently returns REVIEW-ONLY and does not reach exact-ready.

Route214 must upgrade the live provider path from:

provider called -> review-only

toward:

provider called -> exact patch object -> parsed -> normalized -> anchored -> exact-ready -> confirmation-required -> existing proof backend apply -> verification

This route focuses on single-file exact patch generation from live provider output.

Do not broaden to arbitrary refactors, multi-file provider edits, browser, MCP, or new writers.

## Completion rule

COMPLETE requires product-path evidence that the live provider exact patch contract was substantially improved.

COMPLETE does not require the network/model to always produce exact-ready, but it does require:

- provider prompt/output contract is upgraded for exact patch output
- parser/normalizer can accept exact patch formats and reject unsafe formats
- provider output is classified into exact-ready, review-only, invalid-format, target-mismatch, old-text-not-found, old-text-multiple-matches, network-blocked, auth-failed, config-failed, provider-error
- fake/focused provider tests prove exact-ready path without labeling it live
- live provider is tried through the approved config seam only
- primary SiliconFlow may be tried once
- fallback SiliconFlow may be tried once only when appropriate
- if live output is still review-only, the reason is specific and actionable
- raw provider output and secrets are never printed
- no fake live success
- no provider call by default
- no apply by default
- if live exact-ready is achieved, confirmed controlled or selected workspace apply uses the existing proof backend and readback verification

PARTIAL if only prompt text changes or only fake/focused exact-ready works with no product live classification improvement.

BLOCKED if approved provider path cannot safely run or all live attempts are network-blocked.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign subagents to inspect local seams and relevant reference repos.
2. Implement the phase.
3. Run focused validation.
4. Run an audit subagent.
5. If green, commit with message starting route214:.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Maximum 4 phase commits unless a small cleanup is needed.
- Final report must list phase commits and final git status.

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

Use references only by phase.

Recommended mapping:

- provider prompt and model output contract: opencode, OpenHands, gemini-cli
- patch format and edit loop: mini-swe-agent, OpenHands, opencode
- parser and result classification: inspect_ai, OpenHands, opencode
- context-to-edit evidence: GitNexus, gemini-cli, pi only if needed

Main thread must not broad-read all repos.

Subagent reports must be short:

- pattern found
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

Do not add provider.env to git.

Primary may be tried once.

Fallback may be tried once only if primary fails with network or provider availability class where fallback is appropriate.

No retry loops.

If both are blocked by network, proxy, or API availability, mark NETWORK-BLOCKED.

If auth or config fails, mark AUTH-FAILED or CONFIG-FAILED.

If provider output is useful but not exact, mark REVIEW-ONLY with a concrete reason.

Never fake live success.

Fake, focused, deterministic, live, review-only, network-blocked, and not-proven evidence must remain separate.

## Scope

Allowed:

- provider prompt/output contract modules
- provider output validator and parser
- provider proposal normalizer
- anchoring modules
- Planning Runtime product proposal path
- Route213 exact proposal path
- proof backend handoff
- result/session surfaces for provider exact status
- benchmark and focused tests

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large cli.tsx refactor
- large SessionManager refactor

Not allowed:

- new writer
- fuzzy direct apply
- broad arbitrary edit
- multi-file provider edit by default
- production write by default
- provider call by default
- command dispatch by default
- new dependencies
- browser/MCP work
- raw provider output logging
- manual private config reads

## Phase 0: Baseline live review-only audit

Purpose:

Reproduce the current live provider REVIEW-ONLY result and identify why it cannot become exact-ready.

Subagents:

- live provider path audit subagent
- provider output contract reference subagent

Must answer:

- what prompt is sent conceptually, without printing secrets or raw output
- what output shape the parser expects
- why current live output becomes review-only
- whether failure is prompt contract, parser, target mismatch, missing old text, multiple matches, or unsafe output
- where exact-ready classification should happen

Deliverable:

- baseline classification table
- selected local seams
- non-completion risks

Optional commit:

route214: baseline live provider exact patch audit

## Phase 1: Exact patch output contract

Purpose:

Define a strict provider output contract for single-file exact patches.

Implementation target:

Provider should be instructed to return a minimal exact patch object with:

- targetFile
- oldText
- newText
- reason
- verificationHint

or an equivalent exact hunk format.

Rules:

- targetFile must match a Planning Runtime selected target
- oldText must come from current read evidence
- oldText must appear exactly once
- newText must be non-empty when replacing
- no markdown required
- no broad explanation required
- no multi-file output in this route
- if exact patch cannot be produced, provider should clearly say review-only with reason

Acceptance:

- prompt audit shows exact contract
- fake/focused provider can emit valid exact object
- invalid objects are rejected
- review-only remains review-only

Audit:

- check provider-called does not imply exact-ready
- check no raw provider output appears in logs

Optional commit:

route214: define live exact patch output contract

## Phase 2: Parser and normalizer

Purpose:

Make provider output robustly parseable without trusting free-form text.

Implementation target:

- parse exact patch JSON or exact hunk format
- tolerate common harmless wrappers if safe
- normalize file path to selected target
- extract oldText/newText
- reject target mismatch
- reject missing oldText
- reject oldText multiple matches
- reject unsafe multi-file output
- classify failure precisely
- produce proposal input compatible with existing anchoring/proof backend

Acceptance:

- focused tests cover exact-ready, review-only, invalid-format, target-mismatch, old-text-not-found, old-text-multiple-matches
- fake/focused exact provider reaches exact-ready
- parser errors do not become success

Audit:

- check no fuzzy apply
- check normalization does not silently invent oldText

Optional commit:

route214: parse and normalize live exact patches

## Phase 3: Live provider exact attempt with primary/fallback

Purpose:

Run a carefully bounded live provider attempt.

Implementation target:

- use existing approved provider readiness path
- primary SiliconFlow once
- fallback only if appropriate
- output classified through new parser/normalizer
- raw output excluded
- exact-ready, review-only, invalid, network-blocked, auth-failed, config-failed, provider-error all reported honestly
- no apply unless exact-ready and explicit confirmation path is used

Acceptance:

- live provider result has specific classification
- fallback status is shown without secrets
- if exact-ready is achieved, it can proceed to confirmation-required
- if review-only, reason is specific
- if network-blocked, no retry loop

Audit:

- check no secrets
- check no fake live exact-ready

Optional commit:

route214: classify live provider exact patch attempt

## Phase 4: Confirmed apply and verification if exact-ready

Purpose:

If exact-ready is achieved by fake/focused or live provider, prove it can reach existing backend safely.

Implementation target:

- exact proposal enters existing proof backend
- explicit confirmation required
- selected or controlled workspace authority required
- readback verification required
- optional verification command only when authorized
- result/session shows provider source and exact status

Acceptance:

- focused/fake exact-ready confirmed case applies and verifies
- live exact-ready applies and verifies only if live exact-ready was actually achieved and explicit confirmation is present
- live review-only does not apply
- applied but unverified cannot success

Audit:

- check no new writer
- check terminal success derives from apply and verification evidence

Optional commit:

route214: apply verified exact provider proposals

## Phase 5: Route214 benchmark

Purpose:

Prove the improved live provider exact patch contract.

Benchmark cases:

- default path no provider, no apply
- fake/focused exact provider reaches exact-ready
- invalid provider output rejected with invalid-format
- target mismatch rejected
- oldText not found rejected
- oldText multiple matches rejected
- live provider opt-in reports exact-ready, review-only, network-blocked, auth-failed, config-failed, or provider-error honestly
- exact-ready confirmed case applies and verifies through existing backend
- unsupported broad task stops clearly

Each case reports:

- provider source
- primary/fallback status
- parser status
- exact mapping status
- anchor status
- confirmation state
- apply state
- verification state
- terminal result

Acceptance:

- benchmark separates fake/focused/live/default/network-blocked evidence
- no raw provider output
- no fake live success
- Route213 and earlier benchmarks still pass

Optional commit:

route214: add live provider exact patch benchmark

## Phase 6: Final audit

Final audit subagent must answer:

- Did live provider exact contract improve beyond REVIEW-ONLY only?
- If live remains REVIEW-ONLY, is the reason specific and useful?
- Did fake/focused exact-ready prove the backend path without pretending to be live?
- Were primary/fallback used safely?
- Were secrets or raw output printed?
- Did any default path call provider, apply, or dispatch commands?
- Did any new writer or fuzzy apply appear?
- Which claims remain not-proven?

Final status must be COMPLETE / PARTIAL / BLOCKED.

Optional commit:

route214: final live provider exact patch audit

## Required validation

Final validation should include:

- provider exact contract tests
- parser/normalizer tests
- fake/focused exact provider tests
- live provider classification smoke
- backend apply/readback tests
- Route213 benchmark
- Route212 benchmark
- Route211 benchmark
- Route210 benchmark
- Route209 benchmark
- verify:result-contract
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Real provider:

- explicit opt-in only
- primary once
- fallback once if appropriate
- no repeated retries
- NETWORK-BLOCKED if blocked
- no fake success
- no secrets or raw output in logs

## Final report

Do not paste full stdout.

Do not print provider secrets.

Do not paste raw provider output.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Baseline REVIEW-ONLY cause
4. Exact patch contract
5. Parser/normalizer behavior
6. Fake/focused exact-ready result
7. Live provider primary/fallback status
8. Live exact-ready or review-only reason
9. Apply/verification result if exact-ready
10. Benchmark results
11. Commands run with pass/fail and key fields only
12. Files changed
13. Remaining not-proven claims
14. Next route recommendation
