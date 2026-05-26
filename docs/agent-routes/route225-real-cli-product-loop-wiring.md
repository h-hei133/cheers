# Route 225: Real CLI Product Loop Wiring

## Goal

Move the Route224 capstone loop from script-driven composition into the real CLI / print / session product path.

Route224 proved the loop can be composed:

vague task
-> planning
-> proposal or exact edit target
-> selected workspace apply
-> task-relevant verification
-> repair if needed
-> final evidence verdict

Route225 must make this user-visible from the actual product path, not just from scripts.

Primary goal:

A user prompt through the real CLI or print/session execution path can reach the existing planning, proposal, apply, verification, repair, and verdict surfaces under explicit authority.

This route should improve product behavior, not add another standalone proof harness.

## What must change

The main evidence should come from product code, not scripts.

Expected product wiring:

- CLI or print prompt enters real runtime path
- vague task can invoke Planning Runtime / Context Engine
- planning output can become review-ready proposal or edit target
- selected workspace apply is available only with explicit authority
- task-relevant verification dispatch is available only with explicit approval or authority
- verification failure can surface repair-required or repair-to-success handoff
- final terminal/session result shows honest verdict and not-proven claims
- no raw patch/provider secrets are printed

Route-local script evidence is secondary only.

## User-visible target

Add or wire a minimal real product surface that can show the loop.

Acceptable forms:

1. CLI print mode with explicit flags
2. CLI session mode with explicit flags
3. existing prompt path through runMvpIntegratedFlow with a clear mode switch
4. existing read/inspect/planning path upgraded to show handoff, verification, and repair status

Do not build a large new UI.

A good first user-visible flow:

prompt
-> context/planning summary
-> proposed edit target or review-ready proposal
-> authority required
-> if explicit selected-workspace authority is present, apply
-> if verification authority is present, run task-relevant verification
-> if verification fails, surface repair-required or run confirmed repair if explicitly allowed
-> final verdict

## Required evidence

Use frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-lower-bound-stable-selected-workspace-authority-case
- frozen-command-only-bypass-negative-control
- frozen-session-continuity-result-truth

Use repair frozen task if repair path is touched:

- frozen-upper-bound-challenge-verification-failure-repair-case

The route must generate:

docs/implementation-context/route225-real-cli-product-loop-report.json

The report must pass:

npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route225-real-cli-product-loop-report.json

## Completion contract

COMPLETE requires:

- real CLI / print / session path is used as primary evidence
- executionEntrypoint is product-runtime or real-cli-product-path, not route-local-script-only
- productConsumer names the actual runtime modules consumed
- helperOnlyComposition=false
- routeLocalHarnessUsed=false for primary evidence, or route-local evidence stays secondary
- at least one no-write planning task reaches product path and preserves no-provider/no-apply
- at least one authorized selected-workspace task reaches apply and readback through product path
- at least one task-relevant verification command is dispatched or correctly blocked through product path
- command-only bypass remains rejected
- stopped/partial/unsupported states remain truthful in result/session output
- result/session surface carries not-proven claims
- Route221 report gate passes
- independent audit returns PASS or final status remains PARTIAL

Expected target is COMPLETE.

PARTIAL if:

- loop only works through route224 runner or new route-local script
- CLI path only displays planning but cannot expose authority/apply/verification status
- apply happens without verification evidence
- verification is selected-not-run while reported success
- repair is only continuation/proposal but reported success
- session result drops stopped reason or not-proven claims
- report gate passes only for route-local evidence

BLOCKED if:

- real product path cannot safely expose selected workspace authority or verification authority without a separate permission route
- runMvpIntegratedFlow / session path cannot be touched safely in this route

## Milestone commit policy

Work in audited milestones.

After a milestone passes focused validation and audit, Codex may commit it to keep the working tree readable.

Commit rules:

- commit message starts with route225:
- do not push
- do not commit failing states
- do not commit audit residue
- final report lists phase commits

Suggested milestones:

1. Product path audit and report baseline
2. CLI/print/session planning surface wiring
3. Authorized apply and task-relevant verification wiring
4. Repair/stopped/session verdict wiring if touched
5. Final report, gate, validation, cleanup

## Implementation direction

Prefer product wiring over new abstractions.

Likely areas:

- CLI print/session execution path
- runMvpIntegratedFlow product routing
- planningRuntime product projection
- planningRuntimeProductExecution
- taskRelevantVerificationRoute
- verificationRepairFlow
- resultMapper / session result surface
- selected workspace authority handling
- report generation

Avoid making scripts the main implementation.

A script may be added only to drive the real CLI/product path and write the report.

## Boundaries

Allowed:

- small CLI / print / session wiring
- small runMvpIntegratedFlow wiring
- result/session projection updates
- product report artifact
- focused tests for real product path
- narrow Route221 gate update only if needed for real-cli-product-path evidence level

Avoid unless necessary:

- large CLI rewrite
- large runMvpIntegratedFlow refactor
- large SessionManager refactor
- live provider work
- broad Claim Ledger rewrite

Not allowed:

- new writer
- fuzzy apply as success
- arbitrary shell expansion
- production workspace write by default
- provider call by default
- new dependencies
- browser or MCP expansion
- raw provider output
- raw oldText/newText in logs
- route-local runner as primary COMPLETE evidence

## Reference policy

No broad reference scan.

Use references only for concrete blockers.

Reference pool under /home/wang/projects:

- opencode
- OpenHands
- mini-swe-agent
- gemini-cli
- inspect_ai

Suggested targeted references:

- opencode for CLI/tool permission flow
- OpenHands for action/observation/result trajectory
- mini-swe-agent for minimal issue to edit to test loop
- gemini-cli for CLI context/planning entry
- inspect_ai for verdict/report shape

If references are inspected, include reference adoption table.

If not inspected, state:

not-inspected; local Route224 and Route221 evidence was sufficient.

## Required report shape

docs/implementation-context/route225-real-cli-product-loop-report.json must include:

- schemaVersion
- route
- routeType
- finalStatus
- independentAuditResult
- independentPassRerun if needed
- primaryEvidence.source
- primaryEvidence.frozenTaskLoadedFromFile
- primaryEvidence.frozenTaskId
- primaryEvidence.executionEntrypoint
- primaryEvidence.productConsumer
- primaryEvidence.routeLocalHarnessUsed
- primaryEvidence.helperOnlyComposition
- frozenTasksAttempted
- productPathTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims

Each product path task verdict should include:

- prompt path used
- context/planning status
- proposal or edit target status
- confirmation or authority source
- apply status
- verification status
- repair status if touched
- result/session terminal status
- not-proven claims

## Validation

Required:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route225-real-cli-product-loop-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Also run focused tests for touched modules.

If a CLI/product-path verifier is added, it must drive the real product path and remain secondary unless it uses frozen/product evidence.

## Final audit questions

Final audit must answer:

- Did the evidence come from real CLI / print / session path?
- Did any route-local script become primary evidence?
- Which product modules consumed the task?
- Did no-write planning remain no-provider/no-apply?
- Did authorized apply require explicit authority?
- Did verification dispatch require explicit approval or authority?
- Was command-only bypass rejected?
- Did stopped/partial states remain truthful?
- Did session/result preserve not-proven claims?
- Did Route221 gate pass?
- Is finalStatus justified by weakest evidence?

## Final report

Do not paste full stdout.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Product path wired
4. Frozen tasks attempted
5. Product path tasks attempted
6. Planning behavior
7. Apply behavior
8. Verification behavior
9. Repair/session behavior if touched
10. Negative controls
11. Route221 gate result
12. Reference adoption table or not-inspected statement
13. Validation commands with pass/fail
14. Files changed
15. Remaining not-proven claims
16. What became user-visible
17. Recommended next route
