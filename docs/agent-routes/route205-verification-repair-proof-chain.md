# Route 205: Verification-driven Repair Proof Chain

## Goal

Route203 proved the first live proof-carrying controlled mutation.

Route204 added Claim Ledger v1 and false-success gates.

Route205 must turn verification failure into a second proof-carrying mutation chain.

Target chain:

initial provider proposal
-> exact-ready anchor
-> trusted controlled apply
-> verification failed
-> ledger terminal is verification-failed, not success
-> repair proposal is created as no-write evidence
-> repair proposal becomes exact-ready
-> repair confirmation required
-> trusted repair apply
-> re-verification succeeded
-> final ledger terminal is verified-success-with-repair

This route should be aggressive. Complete one full repair vertical slice if local seams allow it.

## Required parallel subagents

Before editing, use parallel read-only subagents.

The main Codex thread must not do broad repo reading. Use subagent summaries, then edit.

Run these subagents:

1. Verification failure subagent
   Find the smallest way to create a controlled verification failure after a successful controlled apply, without production workspace mutation.

2. Repair proposal subagent
   Find existing repair planning/proposal modules and identify the smallest seam to produce a no-write exact repair proposal.

3. Repair apply/readback subagent
   Find how repair can reuse existing exact apply and readback verification lanes without a new writer.

4. Ledger/result/session subagent
   Find how original failure, repair proposal, repair authority, repair apply, re-verification, and final terminal claim should appear in Claim Ledger, scorecard, result, and continuation evidence.

After editing, run review subagents:

1. Evidence review
   Check that original failure, repair proposal, repair apply, and re-verification are runtime-derived.

2. Safety review
   Check no production workspace mutation, no new writer, no fuzzy apply, no provider call during apply, no hidden repair apply.

3. Regression review
   Check Route203 and Route204 behavior still pass, including false-success gates.

Final report must summarize subagent findings only. Do not paste full command output.

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

Optional:

- OpenHands for failure and repair event flow
- inspect_ai for eval/result vocabulary
- mini-swe-agent for minimal repair loop shape
- pi or GitNexus only if scorecard, harness learning, impact query, or code graph becomes directly relevant

No reference repo tours.

## Owner modules

Primary:

- Repair Loop
- Verification / Runtime
- Claim Ledger / Result Surface
- Task Loop / Provider Smoke
- Edit / Patch
- Session / Continue
- Harness / Eval

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

1. Add a controlled verification-failure fixture.

It should start from the Route203 controlled task-loop shape, apply a mutation, then fail verification in a deterministic way.

The failure must be real runtime evidence, not marker text.

2. Project original failure into Claim Ledger.

Required behavior:

- initial apply can succeed
- first verification fails
- terminal cannot be verified-success
- ledger preserves failed verification evidence
- continuation evidence explains repair is available
- snapshot/recovery evidence does not imply repair applied

3. Add no-write repair proposal path.

Repair proposal must be evidence only until confirmed.

Required behavior:

- repair proposal exists
- repair output validation is valid exact single-target if usable
- repair anchor is exact-ready if usable
- confirmation is required before repair apply
- repair proposal alone cannot produce success

4. Add trusted repair apply path.

Trusted repair apply must require:

- original failed verification evidence
- exact-ready repair proposal
- explicit repair confirmation
- controlled temp workspace authority
- existing exact apply lane
- no provider call during apply

5. Add re-verification.

After repair apply, run readback verification again.

Final success requires:

- original failure preserved
- repair apply succeeded
- re-verification succeeded
- mutation scope remains controlled temp workspace
- Claim Ledger terminal derives verified-success-with-repair

6. Extend Claim Ledger v1.

Add repair-aware fields only as needed.

Do not over-abstract.

Ledger must distinguish:

- repair-proposed
- repair-confirmation-required
- repair-applied
- repair-verification-succeeded
- repair-available
- repair-not-run
- recovery-available
- recovery-executed if already supported

7. Add false-success repair gates.

Add cases for:

- verification failed cannot success
- repair proposal cannot success
- repair exact-ready without confirmation cannot success
- repair confirmation without exact-ready is invalid
- repair apply without re-verification cannot success
- recovery available cannot mean repair applied
- fake repair cannot be labeled live repair success
- original failure cannot be hidden by final success

8. Optional helper extraction.

If marker assertions are duplicated, extract a small local helper for runner/verifier ledger marker assertions.

Do not create a broad framework.

## Real API rule

Real API is optional for Route205 unless live behavior is touched.

If Codex runs real API gates, each real gate may run at most once.

If provider-error-class=network appears, stop real API testing immediately and give manual commands for the user.

Do not retry network failures.

Do not fake live repair success.

## Boundaries

- no provider call by default
- no apply without explicit confirmation
- no repair apply without separate repair confirmation
- no production workspace mutation
- no new writer
- no fuzzy direct apply
- no provider call during apply
- no raw provider output in final logs
- no manual private provider config reads
- no CLI/deps/browser/MCP work
- no broad runMvp refactor

## Validation

Run:

- focused repair proposal tests
- focused verification failure tests
- focused repair apply/readback tests
- focused claim ledger repair tests
- false-success repair tests
- Route203 task-loop focused tests
- Route204 claim ledger tests
- fake-ready no-apply verifier
- fake-ready confirmed apply verifier
- repair verifier or repair focused script if added
- rtk node scripts/verify-real-provider-task-loop-mvp.mjs
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Real API gates are optional. If run, run each at most once.

## Acceptance

Complete only if:

- controlled verification failure is represented as failure, not success
- repair proposal is no-write and review-required
- repair exact-ready requires confirmation
- trusted repair apply uses existing exact apply lane
- re-verification succeeds before final success
- final terminal claim is derived from Claim Ledger
- original verification failure remains visible in final evidence
- repair/recovery states cannot fake success
- Route203 and Route204 behavior do not regress
- validation passes

Do not accept:

- repair proposal counted as repair applied
- recovery available counted as recovery executed
- verification failed hidden by final success
- repair apply without re-verification
- fake-ready labeled live repair success
- broad abstractions without tests
- large CLI or runMvp refactor

## Final report format

Keep final report short.

Include:

1. Subagent findings
2. Original verification failure path
3. Repair proposal path
4. Repair apply and re-verification path
5. Claim Ledger repair shape
6. False-success repair cases
7. Route203 and Route204 regression status
8. Validation summary with command names and pass/fail only
9. Real API status, if any
10. Files changed
11. Remaining risks
12. Next route recommendation

Do not paste full command stdout unless explicitly requested.
