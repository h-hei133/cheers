# Route 224: Capstone Coding Agent Capability Sprint

## Goal

Run a fast capstone sprint that turns the current substrate into a visible coding-agent loop.

This route should raise the project ceiling quickly while preserving the Route221 anti-false-success floor.

Do not spend this route building another isolated proof layer. Reuse what already exists:

- Route207 context/planning runtime
- Route213 deterministic exact proposal path
- Route218/219 selected workspace and multi-file evidence
- Route222B product repair-to-success
- Route223 task-relevant verification dispatch
- Route221/221C evidence and provenance gates

Target loop:

vague task
-> repo/context discovery
-> grounded plan
-> proposal or exact edit target
-> explicit authority
-> apply through existing backend
-> task-relevant verification
-> repair if verification fails
-> final verdict with evidence and not-proven claims

This route is allowed to be large and fast. The aim is not full generality; the aim is a strong capstone pack that shows the project can behave like a serious coding agent without lying about incomplete claims.

## Core principle

Raise the upper bound, preserve the lower bound.

Upper bound means:

- show end-to-end agent behavior on realistic tasks
- combine planning, edit, verification, repair, and verdict in one flow
- make the demo feel like a real coding agent, not a pile of helper tests

Lower bound means:

- frozen tasks still pass
- route-local tasks do not become fake COMPLETE evidence
- command-only bypass is rejected
- unsupported broad task is blocked
- apply without verification is not success
- repair proposal without repair apply and re-verification is not success
- fake/focused/default-safe evidence is not labeled live/product proof

## Expected target

Expected final status: COMPLETE for the capstone sprint if the route proves a meaningful product/composition-root task pack with honest verdicts.

Not every capstone task must be COMPLETE. The route is COMPLETE only if:

- required frozen lower-bound tasks pass
- capstone task pack runs through product runtime or accepted product composition roots
- at least two capstone tasks reach verified success or verified-success-with-repair through existing apply/verification paths
- all failed or unsupported capstone tasks are honestly PARTIAL/BLOCKED with not-proven claims
- Route221 anti-false-success gate passes for the report
- independent audit does not return PARTIAL without rerun PASS

If the loop only works in route-local helper composition, finalStatus must be PARTIAL.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least these frozen tasks:

1. frozen-lower-bound-stable-explicit-no-provider-no-apply
2. frozen-lower-bound-stable-selected-workspace-authority-case
3. frozen-command-only-bypass-negative-control
4. frozen-unsupported-broad-task-negative-control
5. frozen-upper-bound-challenge-verification-failure-repair-case

Recommended if cheap:

6. frozen-upper-bound-challenge-multi-file-case
7. frozen-session-continuity-result-truth

Frozen tasks protect the floor. Capstone-local tasks raise the ceiling but stay secondary unless they are driven by product path and classified correctly.

## Capstone task pack

Build or run a small capstone task pack with 5-8 tasks.

Minimum task shapes:

1. Vague bugfix task
   Must use context/planning to find candidate files and produce an edit target.

2. Focused feature or output-improvement task
   Must produce a concrete proposal or exact edit target and verification intent.

3. Selected workspace apply task
   Must apply through existing backend with explicit authority and readback.

4. Task-relevant verification task
   Must dispatch a relevant command through the product verification path.

5. Verification failure task
   Must fail honestly and produce repair-required or verification-failed evidence.

6. Repair-to-success task
   Must reuse Route222B-style product repair flow and preserve original failure.

7. Small multi-file task
   Should show per-file apply/verification evidence if feasible.

8. Unsupported broad task
   Must block instead of claiming broad refactor capability.

Do not tune every task to pass. Honest PARTIAL/BLOCKED verdicts are acceptable and valuable.

## Product-path requirement

The capstone runner may be a driver, but it cannot be the capability.

Primary evidence must come from product runtime or accepted product composition roots.

Allowed product consumers include existing or newly wired composition roots for:

- context/planning runtime
- proposal / exact edit handoff
- selected workspace apply
- task-relevant verification dispatch
- product repair-to-success flow
- result/session verdict projection

The report must name the productConsumer for each primary task.

Do not claim COMPLETE from:

- helper-only composition
- route-local scripts only
- hardcoded proposals
- harness booleans
- fixture readback only
- selected-not-run verification
- command-only success
- demo-only output

## Evidence report

Create:

docs/implementation-context/route224-capstone-coding-agent-capability-report.json

It must include:

- schemaVersion
- route=route224
- routeType=capstone-capability
- finalStatus
- independentAuditResult
- independentPassRerun if needed
- primaryEvidence
- frozenTasksAttempted
- capstoneTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims
- referenceAdoption if references are inspected

Each task verdict should include:

- task id
- origin: frozen or capstone-local
- productConsumer
- context/planning evidence
- proposal source
- confirmation source
- apply status
- verification source
- repair status
- final verdict
- not-proven claims

Run:

npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route224-capstone-coding-agent-capability-report.json

If the existing gate rejects routeType=capstone-capability but the report is otherwise valid, update the gate narrowly without weakening Route221 rules.

## Milestone style and commits

Work fast in large milestones.

After a milestone passes focused validation and audit, Codex may commit it to keep the working tree readable.

Commit rules:

- commit message starts with route224:
- do not push
- do not commit failing states
- do not commit audit residue
- do not use commits to hide PARTIAL evidence
- final report lists phase commits

Suggested milestones:

1. Capstone report baseline and frozen task loading
2. Capstone task runner through product/composition roots
3. End-to-end success tasks: planning -> apply -> verification
4. Failure/repair/negative-control tasks
5. Final report, gate, audit, cleanup

## Reference policy

Use references only to unblock speed or capability quality.

Reference pool under /home/wang/projects:

- mini-swe-agent
- OpenHands
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

Recommended targeted references:

- mini-swe-agent: minimal issue -> edit -> test loop
- OpenHands: action/observation trajectory and repair loop
- opencode: permission/tool execution flow
- gemini-cli: repo/context discovery and memory
- inspect_ai: task verdict and report shape

Do not broad-scan the pool.

If references are inspected, include the reference adoption table.

If not, state:

not-inspected; local Route207-223 substrate was sufficient.

## Scope

Allowed:

- capstone task runner/report
- product composition wiring
- context/planning handoff improvements
- proposal/exact edit handoff improvements
- selected workspace apply reuse
- task-relevant verification dispatch reuse
- repair-to-success flow reuse
- result/session verdict projection
- small focused tests for capstone paths
- narrow Route221 report-gate update if needed for capstone report type
- docs/DOC_STATUS.md if artifact registration is required

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large CLI refactor
- large SessionManager refactor
- broad Claim Ledger rewrite
- live provider changes

Not allowed:

- new writer
- fuzzy apply as success
- arbitrary shell expansion
- production workspace write by default
- provider call by default
- live provider required for route completion
- new dependencies
- browser/MCP expansion
- raw provider output logging
- raw oldText/newText logging
- route-local helper success as primary COMPLETE evidence

## Validation

Required:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route224-capstone-coding-agent-capability-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route224 verifier only if useful:

npm run verify:route224-capstone-coding-agent-capability-sprint

If added, the verifier is secondary unless it drives frozen/product evidence.

Also run focused tests for changed modules.

## Final audit questions

Final audit must answer:

- Which frozen tasks were loaded and attempted?
- Which capstone tasks reached verified success?
- Which capstone tasks were PARTIAL or BLOCKED?
- Did any route-local task become primary COMPLETE evidence?
- Did command-only bypass remain rejected?
- Did unsupported broad task remain blocked?
- Did apply without verification remain rejected?
- Did repair proposal-only remain rejected?
- Did failed verification preserve failure evidence?
- Did result/session verdicts match weakest evidence?
- Did the report pass Route221 gate?
- Is finalStatus justified?

## Final report

Do not paste full stdout.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Frozen tasks attempted
4. Capstone tasks attempted
5. Product consumers used
6. End-to-end success cases
7. Failure/repair cases
8. Negative controls
9. Route221 report gate result
10. Reference adoption table or not-inspected statement
11. Validation commands with pass/fail
12. Files changed
13. Remaining not-proven claims
14. What capability ceiling increased
15. What lower-bound safety was preserved
16. Recommended next route
