# Route 202: Trusted task loop handoff

## Goal

Fix the live task-loop gap and make the project cross from no-write provider proposal to the first real controlled task completion.

Route 199 proved:

- openai-compatible provider can be approved
- provider-called=true
- output-validation=valid-exact-single-target
- anchor-quality=exact-ready
- no-write=true

Route 200/201 scaffold still failed the real task-loop claim:

- provider-called=false
- anchor-quality=none
- apply=not-run
- verification=not-run
- status=task-loop-stopped

Route 202 must reuse the Route 199 provider boundary inside the task loop and prove:

- default remains no-provider/no-apply
- live no-apply reaches provider-called=true and confirmation-required
- trusted confirmed mode applies only in controlled temp workspace
- readback verification succeeds
- result/scorecard/session report the real state, not scaffold success

This route should be aggressive: one larger vertical slice, not another no-write calibration layer.

## Required parallel subagents

Before editing, the main Codex thread must use parallel subagents.

The main thread should not do broad repo reading before implementation. It should coordinate subagents, read their short reports, then edit.

Run these read-only subagents in parallel:

1. Provider handoff subagent
   Find how Route 199 reaches openai-compatible adapter-approved=true and provider-called=true. Report the minimal provider boundary the task loop should reuse.

2. Task-loop failure subagent
   Find why the task-loop verifier still reports provider-called=false and confirmation invalid. Report the exact branch and smallest fix.

3. Apply/verification subagent
   Find the existing exact apply lane and readback verification lane for controlled temp workspace mutation. Report the safest reuse path.

4. Result/scorecard/session subagent
   Find how provider-called, confirmation, apply, verification, mutation-scope, snapshot/recovery, and provider-call-during-apply should appear in result and scorecard without false success.

After editing, run parallel review subagents:

1. Evidence review
   Check that provider-called, apply, and verification are derived from real runtime state, not marker text.

2. Safety review
   Check default no-provider/no-apply, no production workspace mutation, no new writer, no fuzzy apply, no provider call during apply.

3. Regression review
   Check default, live no-apply, trusted confirmed apply, result-contract, build, diff, and status.

Final report must include a short Subagent findings section.

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

Use references only when useful.

Primary reference budget:

- source-claudecode, opencode, gemini-cli
- max 6 files per primary repo

Focus:

- provider to task-loop handoff
- proposal apply confirmation
- controlled apply and verification
- result or scorecard shape

Do not default-read pi or GitNexus unless scorecard, harness learning, code graph, or impact query becomes directly relevant.

## Owner modules

Primary:

- Provider / Model
- Task Loop / Provider Smoke
- Proposal Anchoring
- Edit / Patch
- Runtime / Verification
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
- realTaskLoopPlan.ts
- realTaskLoopResult.ts
- realTaskLoopScorecard.ts
- liveProviderAdapterApproval.ts
- openAICompatibleAnchoredSmokeAdapter.ts
- anchoredProposalRuntime.ts
- providerAnchoredProposal.ts
- editProposalApply.ts
- proposalHunkSetRoute.ts
- fencedEditRoute.ts
- editSnapshot.ts
- verificationCommandResult.ts
- harnessScorecard.ts
- sessionResultParity.ts
- continuationEvidenceParity.ts

Avoid broad runMvpIntegratedFlow.ts work unless the task loop has no other seam.

## Current defect / audit

The current unacceptable state is:

- live opt-in=true
- real provider smoke opt-in=true
- provider-called=false
- anchor-quality=none
- confirmation invalid
- apply=not-run
- verification=not-run

This is scaffold completion, not capability completion.

## Implementation tasks

1. Audit why task-loop live mode does not reach provider-called=true.

2. Reuse the Route 199 openai-compatible adapter approval path inside the task loop.

3. Make live no-apply mode call provider once, validate output, anchor output, and stop at confirmation-required.

4. Make trusted confirmed mode require exact-ready anchored proposal, then apply through an existing exact apply lane.

5. Keep mutation inside controlled temp workspace.

6. Run readback verification proving expected new text exists and old text is absent.

7. Emit result and scorecard evidence for provider-called, anchor-quality, confirmation, apply, verification, mutation-scope, snapshot/recovery, and provider-call-during-apply=false.

8. Add regression tests for default no-provider/no-apply, live no-apply, trusted confirmed apply, readback verification, production workspace untouched, and provider not called during apply.

## Hard acceptance criteria

Default verifier:

- provider-called=false
- apply=not-run
- verification=not-run

Live no-apply verifier:

- provider-called=true
- adapter-approved=true
- anchor-quality=exact-ready
- confirmation=required
- apply=not-run
- verification=not-run

Trusted confirmed apply verifier:

- provider-called=true
- anchor-quality=exact-ready
- confirmation=trusted-confirmed
- apply=succeeded
- verification=succeeded
- mutation-scope=controlled-temp-workspace
- snapshot=created or recovery=available
- provider-call-during-apply=false

## Boundaries

- no provider call by default
- no apply without trusted confirmation
- no production workspace mutation
- no new writer
- no direct fuzzy apply
- no provider call during apply
- no manual private provider config reads
- no command allowlist expansion
- no CLI/schema/deps churn
- no browser or MCP work

## Regression markers

Do not accept this as complete:

- provider-called=false
- apply=not-run
- verification=not-run
- status=task-loop-stopped

Do not count these as live task-loop success:

- focused tests only
- default-safe skip only
- fake-ready provider-called
- exact-ready proposal without confirmation
- apply without readback verification

## Validation

Run:

- focused task-loop/provider-adapter/apply/readback tests
- rtk node --check scripts/verify-real-provider-task-loop-mvp.mjs
- rtk node scripts/verify-real-provider-task-loop-mvp.mjs
- live no-apply verifier with local provider config
- live trusted confirmed apply verifier with local provider config
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If local provider config is unavailable, report live checks as not-run. Do not fake live success.

## Final report

Include:

1. Subagent findings
2. Why provider-called was false
3. Provider adapter handoff
4. Live no-apply result
5. Trusted confirmed apply result
6. Readback verification result
7. Snapshot/recovery evidence
8. Mutation scope
9. Provider-call-during-apply status
10. Validation
11. Remaining risks
12. Next route recommendation
