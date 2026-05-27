# Route 222: Repair-to-Success Against Frozen Tasks

## Goal

Route220 showed repair-to-success is one of the weakest remaining capabilities.
Route221 and Route221B added the anti-false-success harness.

Route222 must now prove a real repair-to-success product path against the frozen repair task, not a route-local fixture.

Primary frozen task:

frozen-upper-bound-challenge-verification-failure-repair-case

Required product flow:

verification fails
-> original failure is preserved
-> repair proposal is created
-> repair proposal remains no-write
-> explicit repair confirmation is required
-> repair apply uses existing exact hunk/backend route
-> post-repair verification runs
-> final task verdict is verified-success-with-repair only after re-verification passes

This route is both a capability route and the first real test of the Route221B anti-false-success report gate.

## Hard completion rule

COMPLETE requires all of the following:

- frozen-upper-bound-challenge-verification-failure-repair-case is the primary evidence
- route-local repair benchmark is secondary only
- machine-checkable report exists at docs/implementation-context/route222-repair-to-success-report.json
- Route221B report gate passes on that report
- original verification failure is preserved
- repair proposal is produced but not counted as success
- explicit repair confirmation is recorded
- repair apply goes through the existing exact hunk/proof backend
- post-repair verification passes
- task verdict records verified-success-with-repair
- negative controls reject repair-continuation-only and repair-proposal-only success
- negative control rejects apply-without-post-repair-verification success
- independent final audit returns PASS, or final status remains PARTIAL
- no new writer
- no fuzzy apply
- no automatic repair without confirmation
- no provider during apply
- default path remains no-provider, no-apply, no-command

PARTIAL if repair reaches continuation/proposal but not apply plus post-repair verification.

PARTIAL if only route-local/focused evidence proves repair success.

BLOCKED if product path cannot safely create the verification failure or cannot safely run repair apply under existing authority.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign targeted subagents where useful.
2. Inspect local seams and relevant references only for the current blocker.
3. Implement or run the phase.
4. Validate.
5. Audit.
6. If green, commit with message starting route222:.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Maximum 5 phase commits unless a small cleanup is required.
- Final report must list commits and git status.
- The final report must follow docs/implementation-context/future-route-report-template-route221.md.
- The machine report must pass scripts/verify-route221-anti-false-success-gate.mjs --report.

## Reference repository pool

All repos are under /home/wang/projects:

- OpenHands
- mini-swe-agent
- opencode
- inspect_ai
- gemini-cli
- GitNexus
- graphiti
- pi
- mem0
- mempalace
- playwright-mcp
- stagehand

Use references by capability:

- repair cycle and failure trajectory: OpenHands, mini-swe-agent
- task/verdict/eval reporting: inspect_ai, OpenHands
- approval and tool safety: opencode, OpenHands
- verification command handling: mini-swe-agent, OpenHands, inspect_ai

Reference adoption is mandatory if references are inspected.

Record adoption in the final report:

- capability area
- reference repo
- file or subsystem inspected
- pattern adopted
- local seam changed
- pattern rejected
- reason
- evidence produced

Main thread must not broad-read reference repos.

Subagent reports must be short:

- blocker or pattern
- reference area
- local seam
- recommended fix
- audit risk

## Real provider policy

Live provider is not required for this route.

Do not run live provider unless an existing approved product path requires explicit opt-in for the selected repair proposal path.

If provider is used:

- explicit opt-in only
- approved config path only
- primary SiliconFlow once
- fallback once only if appropriate
- no retry loops
- do not print provider config, API keys, raw output, oldText, or newText
- no fake live success

Provider is not allowed during apply.

## Scope

Allowed:

- repair proposal path
- verification failure classifier
- repair confirmation contract
- existing exact hunk/proof backend handoff
- post-repair verification
- result/session/task verdict surface
- Route222 report artifact
- Route222 verifier/benchmark only as secondary regression evidence
- package script wiring for Route222 gate if needed

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large cli.tsx refactor
- large SessionManager refactor
- live provider path changes

Not allowed:

- new writer
- fuzzy direct apply
- automatic repair without confirmation
- broad arbitrary refactor
- provider call by default
- apply by default
- command dispatch by default
- production workspace write by default
- new dependencies
- raw provider output logging
- manual private config reads
- broad Claim Ledger rewrite

## Phase 0: Frozen task baseline and report skeleton

Purpose:

Bind the route to the frozen repair task and create the machine-checkable report skeleton.

Must inspect:

- docs/implementation-context/frozen-capability-tasks-route221.json
- docs/implementation-context/future-route-report-template-route221.md
- docs/implementation-context/capability-evidence-schema-route221.md
- current repair and verification modules

Deliverables:

- docs/implementation-context/route222-repair-to-success-report.json
- baseline task verdict with finalStatus PARTIAL
- frozen task id recorded
- route-local tasks, if any, marked secondary
- required negative controls present
- not-proven claims explicit

Validation:

- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route222-repair-to-success-report.json must pass even while finalStatus is PARTIAL

Optional commit:

route222: add frozen repair report baseline

## Phase 1: Product verification failure preservation

Purpose:

Create or use a product-path task where verification fails and the original failure is preserved.

Implementation target:

- failure is runtime-derived, not marker-only
- failed verification cannot success
- session/result evidence keeps original failure
- repair state is repair-required or repair-ready
- no apply-after-failure without repair confirmation

Acceptance:

- frozen repair task records original verification failure
- final verdict remains PARTIAL or repair-required at this phase
- report gate passes
- route-local failure fixture cannot be primary COMPLETE evidence

Negative controls:

- verification failure mapped to success must fail
- repair continuation reported as success must fail

Optional commit:

route222: preserve frozen repair verification failure

## Phase 2: Repair proposal and explicit confirmation

Purpose:

Generate repair proposal from failure evidence and require separate confirmation.

Implementation target:

- repair proposal uses original failure evidence
- repair proposal is no-write
- repair proposal has exact-ready or review-required state
- repair confirmation is separate from initial apply confirmation
- prompt text alone cannot grant repair authority
- repair proposal cannot success

Acceptance:

- report records repair proposal created
- report records repair confirmation missing or explicit
- without confirmation final verdict remains PARTIAL
- repair proposal-only success negative control is rejected

Optional commit:

route222: require explicit repair confirmation

## Phase 3: Repair apply through existing backend

Purpose:

Apply confirmed repair through the existing exact hunk/proof backend.

Implementation target:

- confirmed exact repair hunk enters existing backend
- no new writer
- no fuzzy apply
- selected or controlled workspace authority is explicit
- files touched are recorded
- readback runs after repair apply
- provider-call-during-apply=false

Acceptance:

- repair apply status is applied
- readback after repair apply succeeds
- apply without post-repair verification is not success
- report gate still passes

Optional commit:

route222: apply confirmed repair through proof backend

## Phase 4: Post-repair verification and verdict

Purpose:

Run post-repair verification and derive final verdict.

Implementation target:

- post-repair verification is task-relevant
- verification command or readback is tied to repaired target
- if post-repair verification passes, final verdict is verified-success-with-repair
- original failure remains visible in final report
- if post-repair verification fails, final verdict is repair-failed or PARTIAL
- not-proven claims remain visible

Acceptance:

- frozen task verdict is COMPLETE only if repair apply and post-repair verification pass
- taskVerdicts repair.applied=true
- taskVerdicts repair.postRepairVerification=passed
- apply.reportedSuccess=true only with apply.status=applied and verificationStatus=passed
- Route221B report gate passes

Optional commit:

route222: verify repair success verdict

## Phase 5: Route222 gate and final audit

Purpose:

Add secondary regression gate and run final audit.

Deliverables:

- optional scripts/verify-route222-repair-to-success.mjs
- optional package script verify:route222-repair-to-success
- final machine report at docs/implementation-context/route222-repair-to-success-report.json
- human final report following Route221 template

Required validation:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route222-repair-to-success-report.json
- npm run verify:route222-repair-to-success if added
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Final audit must answer:

- Did the frozen repair task reach repair apply plus post-repair verification?
- Did original failure remain visible?
- Did route-local evidence stay secondary?
- Did negative controls reject repair continuation/proposal-only success?
- Did apply without verification remain non-success?
- Did any new writer/fuzzy apply appear?
- Did audit PASS?
- Is COMPLETE/PARTIAL/BLOCKED justified?

Optional commit:

route222: finalize repair-to-success gate

## Required machine report shape

docs/implementation-context/route222-repair-to-success-report.json must include:

- schemaVersion: 1
- route: route222
- routeType: capability
- finalStatus
- independentAuditResult
- independentPassRerun when needed
- frozenTasksAttempted with frozen-upper-bound-challenge-verification-failure-repair-case
- routeLocalTasksAdded marked secondary
- requiredNegativeControls all true
- taskVerdicts including repair fields:
  - continuationCreated
  - proposalCreated
  - applied
  - postRepairVerification
  - reportedRepairSuccess
- apply fields:
  - status
  - verificationStatus
  - reportedSuccess
- not-proven claims

If repair is not applied and re-verified, finalStatus must remain PARTIAL.

## Final report

Do not print provider secrets.

Do not paste raw provider output.

Do not paste provider oldText/newText.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Frozen repair task verdict
4. Route-local tasks and why secondary
5. Original verification failure evidence
6. Repair proposal evidence
7. Repair confirmation evidence
8. Repair apply evidence
9. Post-repair verification evidence
10. Negative controls
11. Route221B report gate result
12. Reference adoption table
13. Validation commands with pass/fail only
14. Files changed
15. Remaining not-proven claims
16. Recommended next route
