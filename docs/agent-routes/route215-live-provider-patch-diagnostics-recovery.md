# Route 215: Live Provider Patch Diagnostics and Exact-Ready Recovery

## Goal

Route214 added the live provider exact patch contract, parser, and classifications.

But live provider still ended as:

provider-called=true
-> REVIEW-ONLY
-> no live exact-ready
-> no live apply/verify

Route215 must make this failure actionable.

The goal is not to blindly tweak prompts. The goal is to safely diagnose why live provider output did not become exact-ready, and recover common safe provider output shapes into exact proposals when possible.

Target flow:

live provider output
-> safe diagnostic envelope
-> parser/recovery attempt
-> exact-ready OR specific review-only reason
-> optional confirmed apply if exact-ready
-> readback verification

## Completion rule

COMPLETE requires product-path evidence that live provider REVIEW-ONLY is no longer an opaque bucket.

COMPLETE requires:

- safe diagnostics explain why provider output did not become exact-ready
- diagnostics never print raw provider output, secrets, oldText, or newText
- parser/recovery handles common safe forms:
  - exact JSON object
  - markdown-wrapped JSON
  - provider proposal JSON compatible with existing shape
  - simple single-file unified diff when it can be mapped exactly
  - target filename/path variants when unambiguous
- unsafe or uncertain cases remain review-only
- fake/focused tests prove recovered exact-ready path
- live provider is tried through approved config seam only
- primary SiliconFlow once, fallback once only if appropriate
- live result is classified as exact-ready, recovered-exact-ready, review-only with reason, invalid-format, target-mismatch, old-text-not-found, old-text-multiple-matches, network-blocked, auth-failed, config-failed, or provider-error
- no fake live success
- no fuzzy direct apply
- no new writer
- no provider call by default

If live exact-ready or recovered-exact-ready is achieved, confirmed apply must use existing proof backend and readback verification.

PARTIAL if only fake/focused recovery works and live diagnostics remain vague.

BLOCKED if approved live provider path cannot safely run.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign subagents to inspect local seams and relevant reference repos.
2. Implement that phase.
3. Run focused validation.
4. Run audit subagent.
5. If green, commit with message starting route215:.

Rules:

- Do not push.
- Do not commit failing states.
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

- provider diagnostics and model output handling: opencode, OpenHands, gemini-cli
- patch parsing and edit normalization: mini-swe-agent, OpenHands, opencode
- classification/eval reporting: inspect_ai, OpenHands
- context-to-target mapping only if needed: GitNexus, gemini-cli, pi

Subagent reports must be short:

- pattern found
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

Do not print oldText or newText from provider output.

Do not add provider.env to git.

Primary may be tried once.

Fallback may be tried once only if primary fails or produces a provider-availability/network class where fallback is appropriate.

No retry loops.

If both are blocked by network/proxy/API availability, mark NETWORK-BLOCKED.

If auth or config fails, mark AUTH-FAILED or CONFIG-FAILED.

If provider output is useful but not exact, mark REVIEW-ONLY with a concrete safe reason.

Never fake live success.

## Safe diagnostics policy

Diagnostics may include only safe metadata:

- parse status
- output shape kind
- target file matched yes/no
- target candidate count
- oldText present yes/no
- newText present yes/no
- oldText match count: 0 / 1 / multiple
- oldText length
- newText length
- content hash/fingerprint if already used safely in project
- wrapper kind: none / markdown-json / json / diff / unknown
- rejection reason
- selected provider attempt: primary / fallback
- provider status classification

Diagnostics must not include:

- raw provider output
- API keys
- provider config values
- full oldText
- full newText
- private file contents beyond existing normal project output policy

## Scope

Allowed:

- provider exact patch contract
- provider parser/normalizer
- provider diagnostic projection
- live provider classification path
- Planning Runtime product proposal path
- anchoring modules
- proof backend handoff
- result/session provider diagnostic surface
- benchmarks/tests

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large cli.tsx refactor
- large SessionManager refactor

Not allowed:

- new writer
- fuzzy direct apply
- broad arbitrary edit
- multi-file live provider edits
- provider call by default
- apply by default
- command dispatch by default
- new dependencies
- browser/MCP work
- raw provider output logging
- manual private config reads

## Phase 0: Baseline safe diagnostic audit

Purpose:

Reproduce the Route214 live REVIEW-ONLY result and add safe diagnostic capture around why exact-ready failed.

Subagents:

- live provider diagnostic seam subagent
- reference output-handling subagent

Must answer:

- where live provider output is classified
- what safe metadata can be retained
- why current result collapsed to REVIEW-ONLY
- where diagnostic reason should appear in product output/benchmark
- what not to log

Deliverable:

- diagnostic envelope design
- baseline live classification table
- no raw output

Optional commit:

route215: add safe live provider diagnostics

## Phase 1: Recovery parser and normalizer

Purpose:

Recover safe exact patches from common provider output forms.

Implementation target:

- exact JSON object
- markdown-wrapped JSON
- existing proposal JSON shape
- simple single-file unified diff if exact old/new can be reconstructed
- unambiguous target path normalization
- strict oldText exact match against current file
- reject ambiguous or unsafe cases

Recovery must not become fuzzy apply.

If whitespace or path normalization is used, it must produce an exact current-file oldText span before reaching exact-ready.

Acceptance:

- focused tests cover recovered exact-ready
- invalid-format remains invalid
- target mismatch remains rejected
- oldText not found remains rejected
- oldText multiple matches remains rejected
- unsafe diff remains review-only

Audit:

- check no invented oldText
- check no fuzzy direct mutation

Optional commit:

route215: recover safe provider exact patches

## Phase 2: Product-path diagnostic surface

Purpose:

Expose useful safe diagnostics in product result/session output.

Implementation target:

- live provider exact status
- selected attempt: primary/fallback
- wrapper kind
- parse/recovery status
- target match status
- oldText match count
- rejection reason
- exact-ready or review-only reason
- no raw content

Acceptance:

- product output says why review-only happened
- benchmark output includes safe diagnostics
- result/session surfaces do not leak provider output

Audit:

- check diagnostics are useful but not secret-bearing

Optional commit:

route215: surface safe provider patch diagnostics

## Phase 3: Live provider diagnostic attempt

Purpose:

Run a bounded live provider attempt through the new diagnostic and recovery pipeline.

Implementation target:

- primary once
- fallback once if appropriate
- classify through diagnostic/recovery pipeline
- no raw output
- if exact-ready or recovered-exact-ready, stop at confirmation-required unless explicit confirmation is provided
- if review-only, give concrete safe reason
- if network-blocked, say so

Acceptance:

- live result is no longer opaque REVIEW-ONLY
- exact-ready/recovered-exact-ready applies only if truly exact
- fallback behavior is safe and reported
- no fake live success

Audit:

- check no secret/raw leakage
- check provider-called does not imply apply

Optional commit:

route215: classify live provider exact diagnostics

## Phase 4: Apply and verify if recovered exact-ready

Purpose:

If exact-ready is achieved by fake/focused or live provider, prove backend path remains safe.

Implementation target:

- existing proof backend only
- explicit confirmation required
- controlled or selected workspace authority required
- readback verification required
- optional command verification only if authorized

Acceptance:

- fake/focused recovered exact-ready confirms/apply/verifies
- live exact-ready applies/verifies only if actual live exact-ready happened and confirmation exists
- live review-only does not apply
- applied but unverified cannot success

Audit:

- check no new writer
- check terminal result is evidence-derived

Optional commit:

route215: verify recovered exact provider patches

## Phase 5: Route215 benchmark

Benchmark cases:

- default no provider/no apply
- exact JSON recovered exact-ready
- markdown JSON recovered exact-ready
- existing proposal JSON recovered exact-ready
- simple single-file diff recovered exact-ready when exact
- unsafe diff review-only
- target mismatch rejected
- oldText not found rejected
- oldText multiple matches rejected
- fake/focused recovered exact-ready applies/verifies
- live provider classified with safe diagnostics
- live provider exact-ready applies/verifies only if achieved
- unsupported broad task stops clearly

Each case reports:

- provider source
- primary/fallback status
- wrapper kind
- parser/recovery status
- exact mapping status
- rejection reason
- apply state
- verification state
- terminal result

Acceptance:

- no raw output
- no fake live success
- Route214/213/212/211/210/209 benchmarks still pass as needed

Optional commit:

route215: add live provider diagnostics benchmark

## Phase 6: Final audit

Final audit subagent must answer:

- Is live REVIEW-ONLY now actionable?
- Which exact forms can be recovered safely?
- Did any recovery invent oldText?
- Did any fuzzy apply appear?
- Were secrets or raw provider output printed?
- Did fallback run only when appropriate?
- Did fake/focused exact-ready remain separate from live?
- Did any default path call provider/apply/command?
- What remains not-proven?

Final status must be COMPLETE / PARTIAL / BLOCKED.

Optional commit:

route215: final diagnostics audit

## Required validation

Final validation should include:

- diagnostic envelope tests
- parser/normalizer recovery tests
- product diagnostic surface tests
- live provider diagnostic smoke
- fake/focused exact recovery apply/readback test
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

Real provider:

- explicit opt-in only
- primary once
- fallback once if appropriate
- no repeated retries
- NETWORK-BLOCKED if blocked
- no fake success
- no secrets/raw output/oldText/newText in logs

## Final report

Do not paste full stdout.

Do not print provider secrets.

Do not paste raw provider output.

Do not paste provider oldText/newText.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Baseline live REVIEW-ONLY diagnostic
4. Safe diagnostic fields
5. Recovery forms supported
6. Live provider primary/fallback status
7. Live exact-ready/recovered-exact-ready/review-only reason
8. Apply/verification result if exact-ready
9. Benchmark results
10. Commands run with pass/fail and key fields only
11. Files changed
12. Remaining not-proven claims
13. Next route recommendation
