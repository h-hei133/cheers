# Route 227F: Repair Iteration Product Loop

## Goal

Turn verification failure into a full product repair iteration loop.

Route227E strengthens task-relevant verification and failure evidence.

Route227F must use that evidence to complete:

failed task-relevant verification
-> preserved original failure
-> repair proposal from failure evidence
-> explicit repair confirmation
-> repair apply through existing backend
-> rerun same relevant verification
-> verified-success-with-repair or honest repair failure

Expected final status: COMPLETE.

This route must not stop at repair-required, repair proposal, or continuation-created. It must prove at least one real product repair iteration to success through product path or accepted product composition root, and at least one honest repair failure/blocked case.

## Current gap

The project already has:

- Route222B product repair-to-success against a frozen content-level repair task
- Route223 task-relevant verification dispatch
- Route225 CLI/product path visibility
- Route227E stronger verification failure evidence
- result/session truthfulness
- anti-false-success gates

But the repair loop is still not fully top-tier because:

- CLI/product path may surface repair-required without completing repair-to-success
- repair proposal generation may be separate from task-relevant command failure evidence
- repair confirmation may not be cleanly separated from initial apply confirmation
- repair apply and re-verification may not rerun the same relevant command
- failed repair attempts may not preserve enough evidence for continuation
- repair retry budget and stop conditions may be unclear
- original verification failure can be accidentally hidden by final success

Route227F must make repair an actual iteration loop, not only a continuation marker.

## Capability to build

Build a product repair iteration loop.

Required capabilities:

1. Failure evidence intake
   Consume Route227E verification failure evidence:
   - failed command
   - exit status
   - safe output summary
   - changed files
   - covered files
   - failure class
   - task context
   - original apply evidence
   - verification intent

2. Repair proposal generation
   Generate repair proposal from failure evidence:
   - deterministic-from-failure-evidence where possible
   - live-provider repair proposal only if explicitly opted in
   - review-only if repair cannot be exact
   - no route-local hardcoded proposal as success
   - proposal remains no-write

3. Repair confirmation
   Require explicit repair authority:
   - product approval or explicit authority contract
   - separate from initial apply confirmation
   - no harness boolean as primary evidence
   - no automatic repair apply

4. Repair apply
   Apply confirmed repair through existing backend:
   - exact hunk / target-set backend
   - selected or controlled workspace authority
   - no new writer
   - no fuzzy apply
   - provider-call-during-apply=false
   - snapshot/recovery evidence
   - per-file apply/readback evidence

5. Re-verification
   Rerun the same relevant verification when possible:
   - same focused test or command
   - same package build/test fallback if command changed for a recorded reason
   - runtime receipt
   - failure/pass classification
   - original failure preserved

6. Repair verdict
   Final verdict must be one of:
   - verified-success-with-repair
   - repair-failed
   - repair-blocked
   - repair-partial
   - repair-not-proven

7. Retry and stop policy
   Add bounded repair iteration:
   - default max one repair apply
   - optional second attempt only if explicit route policy and evidence support it
   - no infinite repair loops
   - failed repair remains visible

8. Product path and session continuity
   Real CLI/product path should surface:
   - original failure
   - repair proposal
   - confirmation requirement
   - repair apply result
   - re-verification result
   - final verdict
   - continuation state if not complete

## Required subagents

Use focused subagents.

Before implementation:

1. Repair flow subagent
   Inspect verificationRepairFlow, repair planner, edit repair result, session continuation, and Route222B repair path.
   Report the smallest path to connect Route227E failure evidence to repair-to-success.

2. Verification rerun subagent
   Inspect taskRelevantVerificationRoute, verification command receipt, and failure classifier.
   Report how to rerun same relevant verification after repair.

3. Session/product path subagent
   Inspect CLI/session/result surfaces from Route225.
   Report how repair iteration becomes user-visible and continuation-safe.

After implementation:

1. Repair provenance audit subagent
   Check proposal source, confirmation source, repair apply source, and post-repair verification source.

2. Original failure preservation audit subagent
   Check final success does not hide original verification failure.

3. Retry/stop-condition audit subagent
   Check no infinite retry, no auto repair without confirmation, and honest repair failed/blocked states.

Each subagent should return short findings, changed seams, risks, and audit result.

## Reference policy

No broad reference scan.

Reference pool under /home/wang/projects:

- OpenHands
- mini-swe-agent
- opencode
- inspect_ai

Suggested mapping:

- OpenHands: failed action -> repair trajectory and observation boundaries
- mini-swe-agent: simple retry loop after failed test
- opencode: approval/tool authority for repair apply
- inspect_ai: retry/eval verdict and failure preservation

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local Route222B/223/225/227E substrate was sufficient.

## Phases

### Phase 1: Repair loop baseline and failure evidence contract

Goal:

Audit current repair paths and define the product repair iteration evidence contract.

Do:

- inspect Route222B repair composition root
- inspect Route227E verification failure evidence
- inspect verification repair planner / flow
- inspect session continuation repair state
- inspect result/session terminal surface
- define repair iteration task verdict fields

Required fields:

- originalVerificationFailure
- failedCommand
- failureClass
- changedFiles
- verificationCoverage
- repairProposalSource
- repairProposalStatus
- repairConfirmationSource
- repairApplyStatus
- postRepairVerificationSource
- postRepairVerificationStatus
- originalFailurePreserved
- finalRepairVerdict
- retryCount
- notProvenClaims

Baseline task pack:

1. failed relevant command -> repair-required
2. repair proposal-only negative case
3. unconfirmed repair negative case
4. repair apply without re-verification negative case
5. repair-to-success positive case
6. repair failed/blocked case

Focused audit:

- repair-required is not repair success
- repair proposal is not repair apply
- apply without re-verification is not success

### Phase 2: Repair proposal from task-relevant failure evidence

Goal:

Generate repair proposal from real failure evidence.

Do:

- consume failed command receipt
- consume changed files and coverage evidence
- consume original apply/readback evidence
- produce deterministic repair proposal if safe
- support review-only repair when not exact
- optionally support live provider repair only behind explicit opt-in
- keep proposal no-write
- record proposal provenance

Product evidence:

- one failed relevant command produces repair proposal from failure evidence
- one unsupported failure produces review-only or blocked repair
- route-local hardcoded proposal cannot support COMPLETE

Focused audit:

- proposalSource is not route-local-hardcoded
- fake/focused proposal is not product repair proof
- repair proposal does not imply success

### Phase 3: Repair confirmation and apply

Goal:

Apply confirmed repair through existing backend.

Do:

- require repair-specific confirmation
- separate repair confirmation from initial apply authority
- use product approval or explicit authority contract
- apply through existing exact hunk / target-set backend
- no new writer
- no fuzzy apply
- record snapshot/recovery evidence
- record per-file readback evidence
- provider-call-during-apply=false

Product evidence:

- unconfirmed repair is blocked
- confirmed repair apply succeeds for at least one task
- apply without post-repair verification remains partial

Focused audit:

- prompt text alone does not grant repair authority
- harness boolean cannot be primary confirmation evidence
- repair apply does not bypass existing backend

### Phase 4: Re-run same relevant verification

Goal:

Post-repair verification must be real and tied to original failure.

Do:

- rerun same focused test / command where possible
- if command changes, record why
- use product verification route
- capture runtime receipt
- classify pass/fail/error
- tie verification to repaired files and original failure
- preserve original failure in final verdict

Product evidence:

- one task reaches post-repair verification passed
- one task reaches post-repair verification failed or blocked
- original failure remains visible in both cases

Focused audit:

- fixture-readback-only is not task-relevant re-verification
- marker-only verification is not success
- final success includes original failure evidence

### Phase 5: Product/session repair loop surface

Goal:

Make repair iteration visible and continuation-safe.

Do:

- wire repair iteration into real CLI/product path or accepted composition root
- update result/session projection if needed
- surface original failure, proposal, confirmation, apply, re-verification, final verdict
- store continuation state for repair partial/blocked cases
- ensure compact/replay summary preserves repair evidence
- keep not-proven claims visible

Product evidence:

- product path shows verified-success-with-repair
- product path shows repair-failed/blocked
- continuation preserves failed repair state
- result/session does not turn repair partial into success

Focused audit:

- display-only summary is not capability proof
- session continuation does not erase failure
- repair success cannot hide prior failure

### Phase 6: Retry budget and failure/blocked taxonomy

Goal:

Make repair robust without infinite loops.

Do:

- define max repair attempts
- record retry count
- classify no-repair-available
- classify repair-proposal-not-exact
- classify repair-apply-failed
- classify post-repair-verification-failed
- classify command-unavailable
- classify authority-missing
- emit next-action guidance

Product evidence:

- one repair-blocked case has useful next action
- one repair-failed case stays failed
- no loop exceeds budget

Focused audit:

- no infinite retry
- no automatic second repair without policy
- failure taxonomy is not collapsed into generic error

### Phase 7: Route227F report and handoff to Route227G

Create:

docs/implementation-context/route227f-repair-iteration-product-loop-report.json

Report must include:

- schemaVersion
- route=route227f
- routeType=repair-iteration-capability
- finalStatus
- primaryEvidence
- repairTasksAttempted
- repairIterationEvidence
- postRepairVerificationEvidence
- sessionContinuationEvidence
- retryStopEvidence
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims
- referenceAdoption if references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227f-repair-iteration-product-loop-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route227f verifier only if useful. It must drive product repair path or remain secondary.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-upper-bound-challenge-verification-failure-repair-case
- frozen-session-continuity-result-truth
- frozen-command-only-bypass-negative-control
- frozen-lower-bound-stable-selected-workspace-authority-case

Recommended if cheap:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-upper-bound-challenge-multi-file-case

These protect repair truth while the product loop expands.

## Completion criteria

Route227F is COMPLETE only if:

- product path or accepted product composition root consumes task-relevant verification failure evidence
- at least 4 repair tasks are attempted
- at least 1 task reaches verified-success-with-repair after repair apply and post-repair verification
- at least 1 task reaches repair-failed or repair-blocked honestly
- repair proposal is derived from failure evidence
- repair proposal is no-write
- repair confirmation is explicit and separate from initial confirmation
- unconfirmed repair apply is blocked
- repair apply uses existing backend
- post-repair verification reruns same relevant command or records justified command change
- original verification failure remains visible after final success
- repair retry budget prevents infinite loops
- session/result surface preserves repair status and not-proven claims
- command-only bypass remains rejected
- route-local demos are not primary evidence
- Route221 report gate passes
- final report justifies COMPLETE from product repair evidence

If product repair-to-success cannot be completed with task-relevant verification, final status must be PARTIAL or BLOCKED with exact reason.

## Scope

Allowed:

- repair iteration flow
- failure evidence intake
- repair proposal from failure evidence
- repair confirmation contract
- repair apply backend handoff
- post-repair verification rerun
- repair failure taxonomy
- retry budget
- session/result repair surface
- continuation repair evidence
- report artifact
- focused tests for repair iteration/provenance/reverification/session

Avoid unless necessary:

- live provider repair proposal unless explicitly opted in
- broad edit engine work
- verification planning already owned by Route227E
- large CLI refactor
- large SessionManager refactor
- broad Claim Ledger rewrite
- browser/MCP work

Not allowed:

- automatic repair without confirmation
- repair proposal as success
- repair continuation as success
- apply without post-repair verification as success
- new unrestricted writer
- fuzzy apply as success
- infinite repair loop
- harness boolean as primary confirmation evidence
- route-local hardcoded repair proposal as primary COMPLETE evidence
- fixture-readback-only as task-relevant re-verification
- production workspace default write
- new dependencies unless already approved by project policy

## Phase commit policy

Codex may commit a green phase to keep worktree readable.

Commit rules:

- commit message starts with route227f:
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
3. Repair baseline gaps
4. Failure evidence intake behavior
5. Repair proposal provenance
6. Repair confirmation behavior
7. Repair apply behavior
8. Post-repair verification behavior
9. Original failure preservation
10. Repair failed/blocked behavior
11. Retry budget behavior
12. Product/session continuation evidence
13. Frozen tasks attempted
14. Negative controls
15. Route221 gate result
16. Reference adoption table or not-inspected statement
17. Validation commands with pass/fail
18. Files changed
19. Remaining not-proven claims
20. What capability increased
21. What lower-bound safety was preserved
22. Next route: docs/agent-routes/route227g-tool-ecosystem-and-external-capabilities.md

## Next route

After Route227F is complete, continue with:

docs/agent-routes/route227g-tool-ecosystem-and-external-capabilities.md

Route227G will upgrade external tool capabilities: MCP, browser/tool observations, runtime receipts, external/local evidence separation, and tool result integration into context, verification, result, and session surfaces.
