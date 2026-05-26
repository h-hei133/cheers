# Route 223: Product Task-Relevant Verification Dispatch

## Goal

Upgrade verification from selected/planned/readback-only evidence into product-dispatched, task-relevant command evidence.

Route222B proved product repair-to-success for a frozen content-level repair task. Route223 must now close the next gap from Route220:

task-relevant verification command is still partial.

Target flow:

changed files
-> verification planner selects relevant command
-> explicit approval or authority contract
-> product verification route dispatches command
-> runtime receipt records exit status and output summary
-> relevance evidence ties command to changed files
-> result/session/task verdict uses the command result
-> unrelated command success cannot prove task success
-> failed relevant command blocks success and can produce repair-required evidence

This is a capability route. The expected target is COMPLETE. If product verification dispatch cannot honestly satisfy the evidence rules, report PARTIAL or BLOCKED.

## What counts as success

COMPLETE requires:

- at least one frozen task is loaded from docs/implementation-context/frozen-capability-tasks-route221.json
- frozen-command-only-bypass-negative-control is attempted and rejects unrelated command success
- selected workspace or product planning evidence drives a changed-file verification case
- executionEntrypoint is product-runtime or product-composition-root
- productConsumer names the verification planner/runner/result path
- helperOnlyComposition=false
- route-local harness is not primary COMPLETE evidence
- verificationSource is task-relevant-command or product-verification-route
- command dispatch is runtime-derived, not marker-only
- command relevance is recorded and tied to changed files
- unrelated passing command is not accepted as task verification
- failed relevant command does not become success
- result/session surface preserves verification status and not-proven claims
- machine report passes Route221 anti-false-success gate
- independent audit returns PASS or finalStatus remains PARTIAL

PARTIAL if:

- command is selected but not dispatched
- command dispatch exists only in route-local script
- command relevance is not tied to changed files
- verification is readback-only while claiming task command proof
- route-local benchmark is the only COMPLETE evidence
- frozen command-only bypass is not attempted
- audit returns PARTIAL without independent PASS rerun

BLOCKED if:

- product command dispatch cannot be safely authorized in this route
- existing verification route cannot represent task relevance without a separate route
- no safe low-risk command can be used for the frozen/product verification case

## Phase commit policy

Work in audited milestones.

After a milestone passes its focused validation and audit, Codex may commit that milestone to keep the working tree readable.

Commit rules:

- commit message must start with route223:
- do not push
- do not commit failing states
- do not commit audit residue
- do not use commits to hide PARTIAL evidence
- final report must still summarize all phase commits

Suggested maximum:

- 4 milestone commits
- 1 final cleanup commit if needed

## Milestone 1: Frozen task and report baseline

Load frozen task definitions from:

docs/implementation-context/frozen-capability-tasks-route221.json

Primary frozen task:

frozen-command-only-bypass-negative-control

Strongly recommended supporting frozen tasks:

frozen-lower-bound-stable-selected-workspace-authority-case
frozen-upper-bound-challenge-verification-failure-repair-case

Create:

docs/implementation-context/route223-task-relevant-verification-report.json

Initial report may be PARTIAL, but must be valid.

Report must include:

- schemaVersion
- route=route223
- routeType=capability
- finalStatus
- primaryEvidence
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims

Run:

npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route223-task-relevant-verification-report.json

Milestone 1 is complete when the report gate passes and status is honest.

Optional commit:

route223: add verification evidence report baseline

## Milestone 2: Task-relevant command planning

Build or extend product verification planning so it can select a relevant command from changed files and task context.

The plan must record:

- changed files
- candidate commands
- selected command
- relevance reason
- covered files or package area
- command risk level
- approval requirement
- why unrelated commands are insufficient

Relevant examples:

- package build for changed package
- focused test command for changed implementation or test file
- existing allowlisted verification command tied to changed file

Not relevant:

- node --version
- npm --version
- echo ok
- unrelated passing test
- command selected only because it exits zero

Milestone 2 is complete when product planning can distinguish selected relevant command from command-only bypass.

Optional commit:

route223: plan task-relevant verification commands

## Milestone 3: Product dispatch and runtime receipt

Dispatch the selected relevant command through the existing product verification route or accepted product composition root.

Requirements:

- explicit approval or authority contract before command dispatch
- no arbitrary shell expansion
- no new command runner unless absolutely necessary
- existing tool/runtime receipt is used where possible
- exit code is recorded
- stdout/stderr are summarized safely
- command result is tied to changed files
- command-only bypass remains rejected
- selected-not-run cannot become success

Allowed low-risk command shapes:

- npm run build -w packages/ts-shell
- npm run test -w packages/ts-shell -- focused test files
- existing allowlisted verification commands already supported by product runtime

Milestone 3 is complete when a product-routed command is actually dispatched and its receipt is durable evidence.

Optional commit:

route223: dispatch task-relevant verification through product route

## Milestone 4: Verdict, failure handling, and audit

Wire verification result into task verdict and result/session surface.

Requirements:

- passed relevant command can support verified success together with apply/readback evidence
- failed relevant command blocks success
- failed relevant command can produce repair-required or verification-failed evidence
- unrelated passing command cannot support success
- readback-only remains classified separately from task-relevant command verification
- not-proven claims remain explicit
- final status follows weakest required evidence

Negative controls:

- command-only bypass rejected
- selected-not-run rejected as success
- failed relevant command rejected as success
- route-local benchmark-only COMPLETE rejected
- fake/focused evidence not labeled product-proven
- audit PARTIAL not overridden without independent PASS rerun

Run:

npm run verify:route221-anti-false-success-gate
npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route223-task-relevant-verification-report.json
npm run verify:result-contract
npm run build -w packages/ts-shell
git diff --check
git status --short --branch

Add a route223 verifier only if useful. If added, it is secondary unless it drives frozen/product evidence through the product path.

Optional commit:

route223: finalize task-relevant verification verdict

## Reference policy

No broad reference scan.

Use references only for concrete blockers.

Reference pool under /home/wang/projects:

- mini-swe-agent
- OpenHands
- inspect_ai
- opencode
- gemini-cli
- GitNexus
- graphiti
- pi
- mem0
- mempalace
- playwright-mcp
- stagehand

Useful mapping:

- mini-swe-agent: simple issue fix to test command loop
- OpenHands: action/observation command result trajectory
- inspect_ai: task, scorer, verdict separation
- opencode: command authority and tool permission

If references are inspected, include reference adoption table.

If not inspected, state:

not-inspected; local Route220/221/221C evidence was sufficient.

## Scope

Allowed:

- verification planner
- verification command relevance model
- verification command runner handoff
- runtime receipt projection
- result/session verification surface
- task verdict report
- route223 machine report
- small product-composition root if needed
- focused tests for relevance, dispatch, verdict, and negative controls

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large CLI refactor
- large SessionManager refactor
- broad Claim Ledger rewrite
- live provider changes

Not allowed:

- arbitrary shell expansion
- new unrestricted command runner
- provider call by default
- apply by default
- production workspace write by default
- automatic repair-to-success expansion
- browser or MCP work
- new dependencies
- raw provider output logging
- raw patch oldText/newText logging
- route-local command pass as COMPLETE primary evidence

## Required machine report shape

docs/implementation-context/route223-task-relevant-verification-report.json must include:

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
- primaryEvidence.verificationSource
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims

Each verification task verdict should include:

- changedFiles
- selectedCommand
- commandRelevance
- coveredFiles
- approvalSource
- dispatchStatus
- exitStatus
- resultSummary
- verificationSource
- finalVerdict
- notProvenClaims

If command is not dispatched, finalStatus cannot be COMPLETE for task-relevant verification.

If unrelated command passes, task verdict must remain PARTIAL, BLOCKED, or not-proven.

## Final report

Do not paste full stdout.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Frozen tasks loaded and attempted
4. Product entrypoint and productConsumer
5. Verification planning evidence
6. Command relevance evidence
7. Command approval evidence
8. Command dispatch receipt
9. Result/session verdict behavior
10. Negative controls
11. Route221 report gate result
12. Reference adoption table or not-inspected statement
13. Validation commands with pass/fail
14. Files changed
15. Remaining not-proven claims
16. Recommended next route
