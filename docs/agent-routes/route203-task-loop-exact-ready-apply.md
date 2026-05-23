# Route 203: Task-loop exact-ready apply

## Goal

Route 202 fixed the old provider-called=false scaffold gap.

Current real state:

- Route 199 real anchored smoke passes
- provider-called=true
- output-validation=valid-exact-single-target
- anchor-quality=exact-ready
- no-write=true

Current task-loop state:

- provider-called=true
- provider-error-class=none
- anchor-quality=unsupported
- confirmation=not-requested or invalid
- apply=not-run
- verification=not-run
- status=review-required

Route 203 must fix the remaining task-loop gap:

real provider task-loop output
-> valid exact single-target proposal
-> exact-ready anchor
-> confirmation-required in live no-apply
-> trusted confirmed controlled apply
-> readback verification
-> truthful scorecard/result/session evidence

This route should be aggressive. Do not create another no-write scaffold. Complete the vertical slice if the local seams allow it.

## Required parallel subagents

Before editing, use parallel read-only subagents. The main thread must not do broad repo reading.

Run these subagents:

1. Route199 anchoring subagent
   Compare the passing Route 199 exact-ready path. Find the prompt, output validation, anchor extraction, and anchored proposal builder that produce valid-exact-single-target and exact-ready.

2. Route203 task-loop subagent
   Find why task-loop provider output becomes anchor-quality=unsupported even though provider-called=true and provider-error-class=none.

3. Apply/readback subagent
   Confirm the existing exact apply lane and readback verification lane that should run after exact-ready plus trusted confirmation.

4. Scorecard/session subagent
   Confirm how confirmation-required, trusted-confirmed, apply succeeded, verification succeeded, and unsupported anchor should appear in result, scorecard, and continuation evidence.

After editing, run review subagents:

1. Evidence review
   Check that exact-ready, apply, and verification are runtime-derived, not marker-derived.

2. Safety review
   Check no production workspace mutation, no new writer, no fuzzy apply, no provider call during apply.

3. Regression review
   Check default, fake-ready, Route199 real, task-loop live no-apply, task-loop confirmed apply, result-contract, build, diff, status.

Final report must include Subagent findings.

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

- source-claudecode, opencode, gemini-cli
- max 6 files per primary repo

Focus:

- provider output formatting for code edits
- proposal validation before apply
- confirmation-required state
- controlled apply and readback verification
- scorecard/result shape

Do not default-read pi or GitNexus unless scorecard, harness learning, impact query, or code graph becomes directly relevant.

## Likely owner modules

Primary:

- Task Loop / Provider Smoke
- Provider Proposal / Anchoring
- Edit / Patch
- Verification / Runtime
- Harness / Eval
- Result Surface

Collaborating:

- Workspace / File Context
- Session / Continue
- Permission / Policy

## Likely touched files

- scripts/verify-real-provider-task-loop-mvp.mjs
- scripts/real-provider-smokes/taskLoopRunner.ts
- realTaskLoopRuntime.ts
- realTaskLoopResult.ts
- realTaskLoopScorecard.ts
- openAICompatibleAnchoredSmokeAdapter.ts
- anchoredProposalRuntime.ts
- providerOutputValidator.ts
- providerProposalAnchors.ts
- providerAnchorMatcher.ts
- providerAnchoredProposal.ts
- editProposalApply.ts
- proposalHunkSetRoute.ts
- editSnapshot.ts
- verificationCommandResult.ts
- sessionResultParity.ts
- continuationEvidenceParity.ts

Avoid broad runMvpIntegratedFlow, CLI, MCP, browser, package/dependency work.

## Implementation tasks

1. Compare Route199 exact-ready path against task-loop provider output path.

2. Identify why task-loop real output is classified unsupported.

3. Fix the smallest seam so task-loop live no-apply uses an exact single-target edit proposal format that the existing validator and anchor matcher can accept.

4. Preserve raw provider output exclusion.

5. Make live no-apply produce:

- provider-called=true
- output-validation=valid-exact-single-target
- anchor-quality=exact-ready
- confirmation=required
- apply=not-run
- verification=not-run

6. Make trusted confirmed mode produce:

- provider-called=true
- anchor-quality=exact-ready
- confirmation=trusted-confirmed
- apply=succeeded
- verification=succeeded
- mutation-scope=controlled-temp-workspace
- provider-call-during-apply=false

7. Keep unsupported anchor as a truthful stopped/review-required state when the provider output is not valid.

8. Add or update focused tests for unsupported anchor, exact-ready no-apply, trusted confirmed apply, readback verification, and provider-call-during-apply=false.

## Real API rule

Real API testing requires the user to close proxy.

Codex may run each real API gate at most once:

- Route199 real anchored smoke
- task-loop real no-apply
- task-loop real confirmed apply

If a real API gate returns provider-error-class=network, stop real API testing immediately. Do not retry. Finish code review and provide manual commands for the user to run with proxy disabled.

If a real API gate returns auth, config, or provider error, do not fake success. Report it as external provider blocked.

If fake-ready and focused tests pass but real API cannot be run, final status is code-ready, manual-real-verification-required.

## Boundaries

- no provider call by default
- no apply without trusted confirmation
- no production workspace mutation
- no new writer
- no fuzzy direct apply
- no provider call during apply
- no raw provider output in final logs
- no manual private provider config reads
- no CLI/deps/browser/MCP work

## Validation

Run local checks:

- focused task-loop/provider/anchoring/apply/readback/session tests
- rtk node --check scripts/verify-real-provider-task-loop-mvp.mjs
- rtk node scripts/verify-real-provider-task-loop-mvp.mjs
- fake-ready no-apply verifier
- fake-ready confirmed apply verifier
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Real checks:

- run each real API gate at most once
- if network appears, stop real API retries and give manual commands

Final report must include manual real-test commands for the user.

## Acceptance

Complete only if one of these is true:

A. Full live pass

- Route199 real exact-ready passes
- task-loop real no-apply exact-ready plus confirmation-required passes
- task-loop real confirmed controlled apply plus readback verification passes

B. Code-ready manual verification required

- focused tests pass
- fake-ready no-apply passes
- fake-ready confirmed apply/readback passes
- default verifier passes
- real gate was not repeated because network requires user proxy-off manual run
- final report includes manual commands

Do not accept:

- provider-called=false
- anchor-quality=unsupported in live no-apply after successful provider call
- confirmation=invalid when exact-ready should exist
- apply without readback verification
- focused tests only as live success
- fake-ready as live success

## Final report

Include:

1. Subagent findings
2. Why Route202 task-loop was unsupported
3. What seam was fixed
4. Route199 comparison
5. Live no-apply state
6. Trusted confirmed apply state
7. Readback verification state
8. Scorecard/session evidence
9. Real API attempt result, max one attempt per gate
10. Manual real-test commands for user
11. Validation commands and results
12. Remaining risks
13. Next route recommendation
