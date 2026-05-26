# Route 227E: Verification Intelligence Upgrade

## Goal

Upgrade verification from basic build/command dispatch into intelligent, task-relevant verification.

Route227D expands edit operations.
Route227E must ensure those edits are verified by the right checks, not just by readback or generic commands.

Target chain:

changed files / edit operation evidence
-> impact-aware verification planning
-> focused test / build / typecheck ladder
-> explicit command authority
-> product verification dispatch
-> runtime receipt
-> failure classification
-> repair handoff
-> result/session verdict

Expected final status: COMPLETE.

This route must improve real verification capability, not merely add command names or route-local tests.

## Current gap

The project can already:

- dispatch a task-relevant command through product route
- reject command-only bypass
- preserve selected-not-run as not success
- classify failed relevant command as verification-failed / repair-required
- run package-level build verification

But it is still weak at:

- selecting focused tests from changed implementation files
- connecting code graph / test adjacency to verification planning
- choosing among build, test, typecheck, and focused test
- distinguishing task-relevant failure from environment/tool failure
- feeding verification failure into repair context
- preserving multi-file verification coverage
- showing verification confidence and not-proven claims in product path

Route227E must make verification feel closer to a top-tier coding agent.

## Capability to build

Build a stronger verification intelligence layer.

Required capabilities:

1. Verification ladder
   Select verification strategy by confidence and scope:
   - focused test
   - package test
   - package build
   - typecheck if available
   - content/readback verification when command verification is not applicable
   - blocked / not-proven when no task-relevant verification exists

2. Focused test selection
   From changed files and context graph:
   - identify direct test files
   - identify nearby test files
   - identify package-level test command
   - identify workspace/package build fallback
   - record confidence and reason

3. Test adjacency
   Use Route227B graph/context output:
   - implementation file -> likely test file
   - test file -> implementation target
   - package/module ownership
   - script availability
   - changed-file impact candidates

4. Command relevance model
   For every selected command record:
   - changed files covered
   - package/module covered
   - why command is relevant
   - risk level
   - approval requirement
   - fallback reason if broader command is selected

5. Command authority and dispatch
   Dispatch only through existing product verification route:
   - explicit approval or authority contract
   - no arbitrary shell expansion
   - no unrelated command success
   - runtime receipt with exit code and safe output summary
   - selected-not-run cannot success

6. Failure classification
   Classify verification failures:
   - test-failed
   - typecheck-failed
   - build-failed
   - command-not-allowlisted
   - command-unavailable
   - environment-failed
   - timeout
   - task-not-covered
   - selected-not-run
   - passed

7. Repair handoff
   Failed task-relevant verification should produce:
   - failure evidence
   - changed files
   - command summary
   - likely repair context
   - repair-required or verification-failed verdict
   This feeds Route227F.

8. Multi-file verification coverage
   For multi-file edits:
   - per-file coverage evidence
   - aggregate coverage status
   - uncovered files remain not-proven
   - one covered file cannot prove whole target set

9. Product path visibility
   Real CLI/product path must show:
   - selected verification
   - why it was selected
   - dispatch status
   - result
   - failure classification
   - not-proven coverage

## Required subagents

Use focused subagents.

Before implementation:

1. Test adjacency subagent
   Inspect code graph, context graph, repo intelligence, package/test maps, and current verification planner.
   Report how to map changed files to focused tests and package commands.

2. Verification command subagent
   Inspect verificationCommandPlan, verificationCommandRunner, taskRelevantVerificationRoute, allowlist/policy, and result/session projection.
   Report the safest way to add focused test/build/typecheck ladder.

3. Repair handoff subagent
   Inspect verification failure classifier and repair flow.
   Report how verification failures should feed Route227F repair context.

After implementation:

1. Command relevance audit subagent
   Check command relevance, changed-file coverage, command-only bypass, selected-not-run, and allowlist rules.

2. Failure classification audit subagent
   Check failed command classes, environment failures, and repair-required handoff.

3. Product path audit subagent
   Check real product path consumes the verification intelligence and route-local evidence remains secondary.

Each subagent should return short findings, changed seams, risks, and audit result.

## Reference policy

No broad reference scan.

Reference pool under /home/wang/projects:

- mini-swe-agent
- OpenHands
- inspect_ai
- gemini-cli
- opencode

Suggested mapping:

- mini-swe-agent: issue fix -> run relevant tests loop
- OpenHands: command observation, failure classification, retry/repair trajectory
- inspect_ai: scorer/verdict separation and eval evidence
- gemini-cli: command planning and project test discovery
- opencode: tool permission and command authority

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local Route223/227B/227D substrate was sufficient.

## Phases

### Phase 1: Verification baseline and command taxonomy

Goal:

Map current verification capability and define the command taxonomy.

Do:

- inspect verificationCommandPlan
- inspect verificationCommandRunner
- inspect taskRelevantVerificationRoute
- inspect verification failure classifier
- inspect Route227B test adjacency output if present
- inspect Route227D edit operation evidence
- inspect product CLI/session verification surface
- create a baseline matrix

Baseline matrix:

1. changed implementation file -> focused test candidate
2. changed test file -> run that test
3. changed package file -> package build
4. multi-file edit -> coverage across files
5. command-only bypass -> rejected
6. selected-not-run -> not success
7. failing command -> verification-failed / repair-required
8. command unavailable / not allowlisted -> blocked

Focused audit:

- no arbitrary shell expansion
- no command-only bypass success
- no selected-not-run success
- current gaps recorded honestly

### Phase 2: Test adjacency and focused test selection

Goal:

Make verification planning select focused tests when possible.

Do:

- add or strengthen test adjacency from code graph / repo intelligence
- map implementation files to likely test files
- map test files to themselves
- map package/module to package-level test/build commands
- record confidence and reason
- produce fallback ladder when focused test is not found
- keep missing test evidence visible

Product evidence:

- at least one implementation-file task selects a focused test candidate
- at least one test-file task selects that test
- at least one no-test task falls back to build/typecheck with not-proven claims
- command-only bypass remains rejected

Focused audit:

- likely test is not dispatched verification
- low-confidence test selection cannot support success without dispatch
- missing tests remain not-proven

### Phase 3: Verification ladder and authority

Goal:

Choose and authorize the right verification command.

Do:

- implement verification ladder:
  focused test -> package test -> typecheck/build -> content/readback -> blocked
- record why each step was selected or skipped
- require explicit authority for dispatch
- enforce allowlist / low-risk policy
- avoid arbitrary shell expansion
- preserve selected-not-run when authority missing
- expose command risk level

Product evidence:

- one focused test command is selected and authorized
- one package build/typecheck fallback is selected and authorized
- one command-not-allowlisted case is blocked
- no authority means selected-not-run, not success

Focused audit:

- prompt text alone does not grant command authority
- allowlist expansion is narrow and justified
- selected-not-run does not become success

### Phase 4: Dispatch, receipt, and failure classification

Goal:

Run selected verification through product route and classify outcome.

Do:

- dispatch allowed commands through existing product verification route
- capture runtime receipt
- summarize output safely
- classify pass/fail/error
- classify failure reason
- tie receipt to changed files
- tie receipt to product task verdict
- preserve command output safety

Product evidence:

- one focused or package command passes and supports success
- one failing relevant command blocks success
- one unavailable/not-allowlisted command is blocked
- unrelated passing command is rejected as verification proof

Focused audit:

- exit code 0 alone is not enough
- command must cover changed files
- failed relevant command cannot success
- environment/tool failure is not misreported as code failure unless evidence supports it

### Phase 5: Multi-file coverage and repair handoff

Goal:

Make verification useful for multi-file edits and repair.

Do:

- compute per-file verification coverage
- aggregate coverage across target set
- record uncovered files as not-proven
- route failing relevant verification into repair-required context
- include command summary and changed file evidence
- preserve original verification failure
- do not auto-repair in this route

Product evidence:

- multi-file task records per-file coverage
- uncovered file prevents whole-task verified success
- failing verification produces repair-required handoff for Route227F
- repair proposal is not counted as success

Focused audit:

- one file verified cannot hide another unverified file
- repair-required is not repair success
- failure evidence remains visible

### Phase 6: Product surface and handoff to Route227F

Goal:

Expose verification intelligence in product path and prepare repair iteration.

Do:

- update product CLI/session/result surface if needed
- show selected command, relevance, dispatch status, outcome, failure class, and not-proven coverage
- ensure session continuation carries verification evidence
- hand off failure evidence to repair context
- preserve result truthfulness

Product evidence:

- real product path shows verification planning and result
- session/result preserves failed verification and not-proven claims
- Route227F can consume failure context

Focused audit:

- product surface does not hide partial/blocked verification
- continuation does not promote verification failure to success
- handoff is evidence-based, not display-only

### Phase 7: Route227E report and handoff to Route227F

Create:

docs/implementation-context/route227e-verification-intelligence-upgrade-report.json

Report must include:

- schemaVersion
- route=route227e
- routeType=verification-intelligence-capability
- finalStatus
- primaryEvidence
- verificationTasksAttempted
- focusedTestSelectionEvidence
- commandDispatchEvidence
- failureClassificationEvidence
- multiFileCoverageEvidence
- repairHandoffEvidence
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims
- referenceAdoption if references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227e-verification-intelligence-upgrade-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route227e verifier only if useful. It must drive product verification path or remain secondary.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-command-only-bypass-negative-control
- frozen-lower-bound-stable-selected-workspace-authority-case
- frozen-upper-bound-challenge-multi-file-case
- frozen-session-continuity-result-truth
- frozen-upper-bound-challenge-verification-failure-repair-case

Recommended if cheap:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-unsupported-broad-task-negative-control

These protect verification truth while intelligence improves.

## Completion criteria

Route227E is COMPLETE only if:

- product path consumes verification intelligence
- at least 5 verification tasks are attempted
- at least 1 focused test candidate is selected from changed-file/test adjacency
- at least 1 focused or package command is dispatched through product route and passes
- at least 1 failing relevant command is dispatched and blocks success
- at least 1 command-only bypass is rejected
- at least 1 selected-not-run case remains not success
- multi-file verification coverage records covered and uncovered files
- verification failure produces repair-required handoff evidence
- result/session surface preserves verification evidence and not-proven claims
- no arbitrary shell expansion is introduced
- route-local demos are not primary evidence
- Route221 report gate passes
- final report justifies COMPLETE from product verification evidence

If focused test dispatch cannot be safely implemented, final status must be PARTIAL or BLOCKED with exact reason.

## Scope

Allowed:

- verification command planning
- test adjacency / test impact
- focused test selection
- build/test/typecheck ladder
- command relevance scoring
- explicit verification authority
- existing product command runner handoff
- runtime receipt projection
- failure classification
- multi-file verification coverage
- repair-required handoff
- result/session verification surface
- report artifact
- focused tests for verification planning/dispatch/classification/coverage

Avoid unless necessary:

- live provider work
- broad edit engine work
- large CLI refactor
- large SessionManager refactor
- broad Claim Ledger rewrite
- browser/MCP work

Not allowed:

- arbitrary shell expansion
- new unrestricted command runner
- unrelated command success as verification proof
- selected-not-run as success
- readback-only as command verification
- repair proposal as repair success
- automatic repair-to-success in this route
- route-local command pass as primary COMPLETE evidence
- production workspace default write
- new dependencies unless already approved by project policy

## Phase commit policy

Codex may commit a green phase to keep worktree readable.

Commit rules:

- commit message starts with route227e:
- do not push
- do not commit failing states
- do not commit audit residue
- final report lists phase commits

Commits are optional, not mandatory.

## Final report

Do not paste full stdout.

Do not print secrets or excessive command output.

Include:

1. Final status
2. Phase commits
3. Baseline verification matrix
4. Test adjacency improvements
5. Focused test selection behavior
6. Verification ladder behavior
7. Command authority behavior
8. Dispatch receipt behavior
9. Failure classification behavior
10. Multi-file coverage behavior
11. Repair handoff behavior
12. Product path evidence
13. Frozen tasks attempted
14. Negative controls
15. Route221 gate result
16. Reference adoption table or not-inspected statement
17. Validation commands with pass/fail
18. Files changed
19. Remaining not-proven claims
20. What capability increased
21. What lower-bound safety was preserved
22. Next route: docs/agent-routes/route227f-repair-iteration-product-loop.md

## Next route

After Route227E is complete, continue with:

docs/agent-routes/route227f-repair-iteration-product-loop.md

Route227F will use the stronger verification failure evidence from Route227E to complete a product repair iteration loop: failed task-relevant verification -> repair proposal -> explicit repair confirmation -> repair apply -> rerun same relevant verification -> verified-success-with-repair or honest repair failure.
