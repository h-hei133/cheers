# Route 204: Claim Ledger and False-success Gate

## Goal

Route203 proved the first live proof-carrying controlled mutation:

- Route199 real provider anchored smoke passes exact-ready no-write
- task-loop real no-apply reaches confirmation-required
- task-loop real confirmed mode applies in controlled temp workspace
- readback verification succeeds
- snapshot and recovery evidence exist
- provider-call-during-apply=false

Route204 must turn that successful chain into a shared Claim Ledger v1 and add a false-success adversarial gate.

This route is intentionally larger than a patch route. It should connect runtime, result, scorecard, session parity, and verifier evidence into one proof-carrying contract.

The purpose is not more agent capability. The purpose is to make success harder to fake.

## Required shape

Create or consolidate a shared claim ledger projection with these claim groups:

- provider claim
- proposal claim
- anchor claim
- authority claim
- mutation claim
- verification claim
- recovery claim
- terminal claim
- not-proven claims

Keep it practical. Do not over-abstract.

Each claim should have enough structure to explain:

- status
- evidence type
- source
- scope
- reason or blocker
- key receipt fields

The terminal success verdict must be derived from the ledger. Do not allow independent runner, scorecard, or session code to invent success without the required claims.

## Required parallel subagents

Before editing, use parallel read-only subagents.

The main Codex thread must not do broad repo reading. Use subagent summaries, then edit.

Run these subagents:

1. Claim ledger seam subagent
   Find the smallest shared place to project Route203 evidence into a ledger without rewriting the whole runtime.

2. Result and scorecard subagent
   Find where verified-success, review-required, stopped, partial, unsupported, fake-ready, and default-safe states are currently derived.

3. Session parity subagent
   Find how ledger evidence should appear in session result parity, continuation evidence, and replay-safe summaries.

4. False-success corpus subagent
   Design adversarial cases that prove incomplete evidence cannot produce terminal success.

After editing, run review subagents:

1. Evidence review
   Check that ledger fields are runtime-derived, not marker-derived.

2. Safety review
   Check no production workspace mutation, no new writer, no broad/fuzzy apply, no provider call during apply, no provider call by default.

3. Regression review
   Check Route203 behavior remains intact and false-success cases fail closed.

Final report must include only concise subagent findings. Do not paste full command output.

## Reference scan

Reference pool:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode
- /home/wang/projects/gemini-cli
- /home/wang/projects/OpenHands
- /home/wang/projects/inspect_ai
- /home/wang/projects/mini-swe-agent
- /home/wang/projects/pi
- /home/wang/projects/GitNexus

Use references only after local seams are identified.

Primary reference budget:

- source-claudecode
- opencode
- gemini-cli
- max 5 files per primary repo

Optional reference use:

- inspect_ai for eval/result vocabulary
- mini-swe-agent for minimal task loop reporting
- OpenHands for event/result state
- pi or GitNexus only if scorecard, harness learning, code graph, or impact query becomes directly relevant

Do not do reference repo tours.

## Likely owner modules

Primary:

- Task Loop / Provider Smoke
- Harness / Eval
- Result Surface
- Session / Continue
- Runtime / Verification
- Edit / Patch

Collaborating:

- Workspace / File Context
- Permission / Policy

Avoid:

- broad runMvpIntegratedFlow work
- CLI productization
- browser
- MCP
- package/dependency churn

## Implementation tasks

1. Add Claim Ledger v1 projection.

It may be a new module or a small consolidation around existing result and scorecard evidence.

It must cover Route203 task-loop evidence and be reusable by future repair and multi-file routes.

2. Project Route203 states into the ledger.

Required supported states:

- default no-provider/no-apply
- live no-apply confirmation-required
- trusted confirmed verified-success
- unsupported anchor
- provider error
- confirmation invalid
- apply not-run
- partial or failed apply
- verification not-run
- verification failed
- fake-ready evidence
- focused-test-only evidence

3. Make terminal verdict derive from ledger.

Verified success requires at least:

- provider claim proven when live provider path is used
- proposal validation proven
- anchor exact-ready proven
- authority trusted-confirmed for mutation
- mutation succeeded in controlled scope
- verification succeeded
- no provider call during apply
- no blocker claim

Missing required claims must produce stopped, review-required, blocked, or not-proven, never verified-success.

4. Add false-success adversarial gate.

Add tests or verifier cases for at least:

- provider-called=false cannot success
- provider-called=true but output-validation missing cannot success
- anchor-quality=unsupported cannot success
- confirmation flag with unsupported anchor becomes invalid
- apply=succeeded but verification=not-run cannot verified-success
- verification failed cannot verified-success
- fake-ready provider-called cannot be labeled live success
- focused tests passing cannot be labeled live success
- snapshot created without apply cannot imply mutation success
- repair/recovery available cannot imply repair applied

5. Preserve Route203 behavior.

Do not break:

- default verifier no-provider/no-apply
- fake-ready no-apply exact-ready plus confirmation-required
- fake-ready confirmed controlled apply/readback
- real task-loop result shape
- result-contract
- session continuation parity

6. Improve final report discipline.

Verifiers and runner outputs should expose key ledger fields, but final assistant reports must summarize commands instead of pasting full logs.

If a command fails, report command, exit code, and key failing fields only.

## Boundaries

- no real provider call by default
- no mandatory real API run for this route unless live runner behavior is touched
- if real API is attempted and network appears, stop retrying and give manual commands
- no production workspace mutation
- no new writer
- no fuzzy direct apply
- no provider call during apply
- no raw provider output in final logs
- no manual private provider config reads
- no CLI/deps/browser/MCP work

## Validation

Run:

- focused claim ledger tests
- false-success adversarial tests
- task-loop focused tests touched by Route203
- session parity tests touched by ledger projection
- rtk node scripts/verify-real-provider-task-loop-mvp.mjs
- fake-ready no-apply verifier
- fake-ready confirmed apply verifier
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Real API gates are optional for Route204 unless touched live behavior requires one check.

If real API is not run, say so directly.

If real API is run, run each real gate at most once.

## Acceptance

Complete only if:

- Claim Ledger v1 exists or is clearly consolidated
- Route203 success path projects into the ledger
- terminal verified-success is derived from proven claims
- false-success adversarial cases pass
- fake/default/focused/live evidence labels remain distinct
- result and session parity preserve ledger evidence
- Route203 behavior does not regress
- validation passes

Do not accept:

- success derived only from scorecard marker text
- success with verification missing
- success with unsupported anchor
- fake-ready labeled as live success
- focused tests labeled as live success
- broad new abstractions without tests
- large runMvp or CLI refactor

## Final report format

Keep final report short.

Include:

1. Subagent findings
2. Claim Ledger v1 shape
3. False-success cases added
4. Route203 regression status
5. Validation summary with command names and pass/fail only
6. Real API status, if any
7. Files changed
8. Remaining risks
9. Next route recommendation

Do not paste full command stdout unless explicitly requested.
