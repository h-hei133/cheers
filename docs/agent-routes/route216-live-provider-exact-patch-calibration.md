# Route 216: Live Provider Exact Patch Calibration

## Goal

Route215 proved that live provider output is no longer an opaque REVIEW-ONLY bucket.

Current live diagnosis:

- provider called
- target matched
- wrapper=json
- shape=review-only-json
- oldTextPresent=false
- newTextPresent=false
- no live exact-ready
- no live apply/verify

Route216 must answer the key capability question:

Can the configured live provider act as a single-file exact patch author?

This route should not keep expanding parser/recovery infrastructure. Route215 already added diagnostics and recovery forms.

Route216 must run a minimal, unambiguous, single-file live-provider calibration task. The provider must either produce exact oldText/newText or be classified as unsuitable for direct patch authoring under the current model/prompt/config.

## Completion rule

COMPLETE requires one of two outcomes.

Outcome A: live exact patch success

- live provider returns exact patch data
- oldText present
- newText present
- target matched
- oldText appears exactly once in current file
- result becomes live exact-ready or recovered-exact-ready
- confirmed controlled apply uses existing proof backend
- readback verification succeeds
- no secrets or raw output printed

Outcome B: live patch author unsuitable

- minimal single-file task was clear and read-backed
- provider was called through approved config seam
- primary SiliconFlow tried once
- fallback SiliconFlow tried once if appropriate
- provider still failed to return oldText/newText or valid exact patch
- failure is classified as PATCH-AUTHOR-UNSUITABLE or PROVIDER-OUTPUT-INSUFFICIENT
- safe diagnostics prove the reason without printing raw provider output
- final recommendation switches future strategy away from direct live patch authoring

PARTIAL if only fake/focused exact-ready works or live failure reason remains vague.

BLOCKED if approved live provider path cannot safely run because of network/auth/config. Use NETWORK-BLOCKED, AUTH-FAILED, or CONFIG-FAILED.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign focused subagents only where needed.
2. Implement or run the phase.
3. Validate.
4. Audit.
5. If green, commit with message starting route216:.

Rules:

- Do not push.
- Do not commit failing states.
- Maximum 3 phase commits.
- Do not broaden scope if live provider fails.
- Final report must list commits and status.

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

Use references only for concrete phase needs.

Recommended mapping:

- exact patch prompting: opencode, OpenHands, gemini-cli
- minimal patch task style: mini-swe-agent, OpenHands
- failure classification/reporting: inspect_ai, OpenHands

Main thread must not broad-read references.

Subagent reports must be short:

- pattern found
- local seam
- recommended change
- audit risk

## Real provider policy

Live provider is explicit opt-in only.

Use only existing approved private provider config loading paths.

The user has primary SiliconFlow and fallback SiliconFlow configured in /home/wang/.private-agents-real/provider.env.

Do not cat, grep, print, echo, upload, or dump provider config.

Do not print API keys.

Do not print raw provider output.

Do not print oldText or newText from provider output.

Do not add provider.env to git.

Primary may be tried once.

Fallback may be tried once only if primary fails or produces a provider-availability/network class where fallback is appropriate, or if the route already supports explicit fallback calibration safely.

No retry loops.

If both are blocked by network/proxy/API availability, mark NETWORK-BLOCKED.

If auth or config fails, mark AUTH-FAILED or CONFIG-FAILED.

If provider output is useful but lacks exact patch fields, mark PROVIDER-OUTPUT-INSUFFICIENT or PATCH-AUTHOR-UNSUITABLE with safe diagnostics.

Never fake live exact-ready.

## Scope

Allowed:

- live provider exact patch prompt contract
- calibration task fixture
- safe diagnostic classification
- provider exact patch parser integration
- product Planning Runtime proposal path
- existing proof backend handoff
- result/session diagnostic surface
- Route216 benchmark/smoke

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large cli.tsx refactor
- large SessionManager refactor

Not allowed:

- new writer
- fuzzy direct apply
- broad arbitrary edit
- multi-file live provider edit
- provider call by default
- apply by default
- command dispatch by default
- new dependencies
- browser/MCP work
- raw provider output logging
- manual private config reads
- more parser expansion unless needed for the minimal calibration output

## Phase 0: Minimal calibration task design

Purpose:

Create one tiny, unambiguous, single-file patch task that gives provider no reasonable excuse to return review-only.

The task must include:

- one target file
- current file content read evidence
- one obvious replacement
- clear old behavior and new behavior
- expected exact output format
- verification hint

The task should be realistic enough to use the product path, but small enough that oldText/newText are obvious.

Deliverable:

- calibration task description
- selected target file
- read evidence source
- expected exact patch requirement
- no provider call yet unless already available through a dry-run harness

Audit:

- check task is not ambiguous
- check target content is available to provider prompt

Optional commit:

route216: add live exact patch calibration task

## Phase 1: Provider prompt hardening for no-excuse exact patch

Purpose:

Make the provider contract stricter for this calibration task.

Implementation target:

- require exact JSON only
- require targetFile, oldText, newText, reason, verificationHint
- explicitly state oldText must be copied exactly from provided current file content
- explicitly state review-only is allowed only if a required fact is missing
- require provider to name the missing fact if review-only
- prevent broad explanation
- keep raw output excluded from logs

Acceptance:

- prompt audit shows oldText/newText are mandatory for this task
- fake/focused provider exact JSON passes
- review-only without a missing fact becomes provider-output-insufficient

Audit:

- check no raw prompt secrets or provider output leak

Optional commit:

route216: harden live exact patch calibration prompt

## Phase 2: Live calibration attempt

Purpose:

Run the minimal live provider calibration exactly once per allowed provider attempt.

Implementation target:

- primary SiliconFlow once
- fallback only if policy allows and appropriate
- classify output with Route215 diagnostics
- if oldText/newText present and match exactly once, mark exact-ready
- if oldText/newText absent, mark PROVIDER-OUTPUT-INSUFFICIENT or PATCH-AUTHOR-UNSUITABLE
- if review-only includes concrete missing fact, preserve that reason
- no raw output printed

Acceptance:

- live result is exact-ready, recovered-exact-ready, NETWORK-BLOCKED, AUTH-FAILED, CONFIG-FAILED, PROVIDER-OUTPUT-INSUFFICIENT, PATCH-AUTHOR-UNSUITABLE, or provider-error
- result is not a vague REVIEW-ONLY bucket
- no fake live success

Audit:

- check live classification is evidence-based
- check fallback policy was respected

Optional commit:

route216: classify live provider patch author calibration

## Phase 3: Apply/verify if live exact-ready, or route strategy if unsuitable

Purpose:

If live exact-ready was achieved, prove backend execution.

If not, stop trying to force this provider as patch author and encode the future strategy.

If exact-ready:

- require explicit confirmation
- apply through existing proof backend
- readback verify
- optional command verification only if already authorized
- result/session shows live exact-ready -> apply -> verify

If unsuitable:

- add a product-visible strategy status:
  providerPatchRole=reviewer-or-planner
  exactPatchAuthor=deterministic-builder
- explain that future live provider output should inform planning/review, while deterministic builder or structured local proposal path creates exact oldText/newText
- do not call this success as live patch author

Acceptance:

- exact-ready path applies/verifies if achieved
- unsuitable path is explicit and actionable if not achieved
- no repeated live attempts
- no fake success

Audit:

- check the final status does not overclaim

Optional commit:

route216: finalize live provider patch author strategy

## Phase 4: Route216 benchmark and final audit

Benchmark cases:

- default no provider/no apply
- fake/focused exact patch author success
- fake/focused provider-output-insufficient classification
- live calibration result with safe diagnostics
- live exact-ready apply/verify if achieved
- patch-author-unsuitable strategy if not achieved
- Route215 diagnostics still pass
- Route213 deterministic exact proposal still passes

Final audit must answer:

- Did live provider produce oldText/newText?
- Did oldText match current file exactly once?
- Did live provider become exact-ready?
- If not, is the provider unsuitable as patch author under this setup?
- Were primary/fallback attempts bounded?
- Were secrets/raw output/oldText/newText protected?
- Did any fake/focused evidence get labeled live?
- What should the next route do?

Optional commit:

route216: add live exact patch calibration benchmark

## Required validation

Final validation should include:

- Route216 calibration benchmark
- fake/focused exact patch author tests
- provider-output-insufficient tests
- live provider calibration smoke
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
3. Calibration task summary
4. Provider primary/fallback status
5. Safe diagnostics
6. Did live provider produce oldText/newText?
7. Did live provider reach exact-ready?
8. Apply/verification result if exact-ready
9. If unsuitable, final provider role recommendation
10. Benchmark results
11. Commands run with pass/fail and key fields only
12. Files changed
13. Remaining not-proven claims
14. Next route recommendation
