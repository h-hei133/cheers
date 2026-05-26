# Route 222B: Product Repair-to-Success Against Frozen Task

## Goal

Redo Route222 correctly.

Route222 was downgraded to PARTIAL because it proved helper composition, not product repair-to-success.

Route222B must prove one real product repair-to-success path against the frozen task:

frozen-upper-bound-challenge-verification-failure-repair-case

Target flow:

frozen task loaded from file
-> product runtime or accepted product composition root
-> runtime-derived original verification failure
-> repair proposal derived from failure evidence
-> explicit repair confirmation through product approval or authority contract
-> repair apply through existing exact hunk/proof backend
-> post-repair task-relevant verification
-> verified-success-with-repair with original failure preserved
-> machine-checkable report passes Route221C provenance gate

This is a capability route. The expected target is COMPLETE. Do not stop at PARTIAL unless a real product-path blocker is found and clearly documented.

## Why Route222 failed

Do not repeat these patterns:

- helper-only composition
- frozen task id used as a constant instead of loading the frozen task pack
- route-local hardcoded repair proposal
- harness boolean confirmation
- fixture readback-only verification
- route-local benchmark used as primary COMPLETE evidence

Route222B must prove evidence provenance, not only output fields.

## Completion contract

COMPLETE requires:

- frozen task loaded from docs/implementation-context/frozen-capability-tasks-route221.json
- primaryEvidence.frozenTaskLoadedFromFile=true
- primaryEvidence.frozenTaskId=frozen-upper-bound-challenge-verification-failure-repair-case
- primaryEvidence.executionEntrypoint=product-runtime or product-composition-root
- primaryEvidence.productConsumer names the product module or composition root
- primaryEvidence.helperOnlyComposition=false
- proposalSource is deterministic-from-failure-evidence, deterministic-from-product-read-evidence, or live-provider if explicitly opted in
- proposalSource is not route-local-hardcoded and not fake-focused
- confirmationSource is product-approval or explicit-authority-contract
- confirmationSource is not harness-boolean
- verificationSource is product-verification-route or task-relevant-command
- verificationSource is not fixture-readback-only, marker-only, or not-run
- original verification failure remains visible after final success
- repair proposal alone is not success
- repair apply without post-repair verification is not success
- final verdict is verified-success-with-repair only after repair apply and post-repair verification pass
- route222b report passes the Route221 anti-false-success gate
- independent audit returns PASS or finalStatus remains PARTIAL

PARTIAL if:

- frozen task is only referenced, not loaded
- product path is not used
- evidence is helper-only
- repair proposal is hardcoded
- confirmation is only a harness boolean
- verification is fixture-readback-only
- repair stops at continuation or proposal
- repair apply happens but post-repair verification is missing
- independent audit returns PARTIAL without an independent PASS rerun

BLOCKED if:

- no safe product or product-composition root exists for this frozen task
- product repair apply cannot be authorized without a separate route
- post-repair task-relevant verification cannot be represented without weakening Route221 rules

## Working mode

Work in milestones, not micro-phases.

Use targeted subagents only when blocked or when auditing a milestone.

Default to no reference scan. If a reference is needed, inspect only the concrete subsystem relevant to the blocker and record reference adoption.

Do not let report bookkeeping replace the product proof.

Commits are optional unless the current workflow explicitly requires them. Do not push.

## Milestone 1: Frozen task and provenance baseline

Load the frozen task from:

docs/implementation-context/frozen-capability-tasks-route221.json

Create or update:

docs/implementation-context/route222b-product-repair-to-success-report.json

Initial report may be PARTIAL, but it must be valid and provenance-aware.

Must include:

- schemaVersion=1
- route=route222b
- routeType=capability
- finalStatus
- primaryEvidence
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims

Run:

npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route222b-product-repair-to-success-report.json

Milestone 1 is complete when the report gate passes while honestly reporting current status.

## Milestone 2: Product failure to repair proposal to confirmation

Drive the frozen task through product runtime or an accepted product composition root until it produces a real verification failure.

Then generate repair proposal from the failure evidence.

Requirements:

- original failure is runtime-derived
- original failure is preserved
- repair proposal is derived from failure evidence or product read evidence
- repair proposal is no-write
- repair proposal does not count as success
- confirmation is separate from initial confirmation
- repair apply is blocked before explicit repair confirmation
- confirmation source is product-approval or explicit-authority-contract

Negative controls:

- verification failure cannot become success
- repair continuation cannot become success
- repair proposal cannot become success
- harness boolean confirmation cannot prove COMPLETE

## Milestone 3: Repair apply and post-repair verification

Apply confirmed repair through existing exact hunk/proof backend.

Requirements:

- no new writer
- no fuzzy apply
- no automatic repair without confirmation
- selected or controlled workspace authority is explicit
- provider-call-during-apply=false
- repair apply records touched files
- post-repair readback runs
- post-repair verification is task-relevant
- original failure remains visible

Verification clarification:

Preferred verification is a task-relevant command dispatched through the product verification route.

If the frozen repair task is intentionally content-level, product-routed runtime readback may count only when all are true:

- it is produced by product verification route or accepted product composition root
- it is tied to the repaired target and original failure
- it is not route-local fixture readback
- report sets verificationSource=product-verification-route, not fixture-readback-only

Never sufficient:

- unrelated command success
- node --version style command proof
- marker-only verification
- route-local fixture readback
- not-run verification

Milestone 3 is complete only when the repaired task reaches verified-success-with-repair or a real product blocker is documented.

## Milestone 4: Report gate, audit, and regression

Finalize the machine report.

Required gate:

npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route222b-product-repair-to-success-report.json

Also run the default gate:

npm run verify:route221-anti-false-success-gate

Add a small route222b verifier only if it protects regression. If added, it is secondary evidence unless it drives the frozen task through the product path.

Required validation:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route222b-product-repair-to-success-report.json
- npm run verify:route222b-product-repair-to-success if added
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Final audit must answer:

- Was the frozen task loaded from file?
- Was the frozen task actually used as the driver?
- Was product runtime or product composition root used?
- Was helper-only composition avoided?
- Was repair proposal derived from failure evidence?
- Was confirmation product approval or explicit authority contract?
- Was repair apply done by existing backend?
- Was post-repair verification task-relevant?
- Did original failure remain visible after final success?
- Did route-local evidence stay secondary?
- Did negative controls pass?
- Did Route221C report gate pass?
- Is COMPLETE, PARTIAL, or BLOCKED justified by weakest evidence?

## Scope

Allowed:

- frozen task loader or adapter
- product repair composition root
- verification failure handling
- repair proposal generation from failure evidence
- repair confirmation and authority contract
- existing exact hunk/proof backend handoff
- product verification route or task-relevant verification command
- result/session/task verdict surface
- route222b machine report
- docs/DOC_STATUS.md if registering a durable artifact is needed

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large CLI refactor
- large SessionManager refactor
- live provider changes
- broad Claim Ledger rewrite

Not allowed:

- new writer
- fuzzy direct apply
- automatic repair without confirmation
- broad arbitrary repair
- provider call by default
- apply by default
- command dispatch by default
- production workspace write by default
- new dependencies
- raw provider output logging
- manual private provider config reads
- route-local hardcoded repair proposal as COMPLETE evidence

## Reference policy

No reference scan by default.

Use references only for concrete blockers.

Reference pool under /home/wang/projects:

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

Useful mapping if blocked:

- repair trajectory: OpenHands, mini-swe-agent
- verdict and eval reporting: inspect_ai
- approval and tool authority: opencode, OpenHands
- verification command handling: mini-swe-agent, OpenHands, inspect_ai

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local Route220/221/221C evidence was sufficient.

## Live provider policy

Live provider is out of scope unless the existing product repair path already requires it.

Prefer deterministic-from-failure-evidence.

If live provider is used:

- explicit opt-in only
- approved config path only
- no retries beyond existing approved policy
- do not print config, keys, raw provider output, oldText, or newText
- no fake live success
- provider-call-during-apply=false

## Required machine report shape

docs/implementation-context/route222b-product-repair-to-success-report.json must include:

- schemaVersion
- route
- routeType
- finalStatus
- independentAuditResult
- independentPassRerun if needed
- primaryEvidence.source
- primaryEvidence.frozenTaskLoadedFromFile
- primaryEvidence.frozenTaskId
- primaryEvidence.frozenTaskPromptHash
- primaryEvidence.executionEntrypoint
- primaryEvidence.productConsumer
- primaryEvidence.routeLocalHarnessUsed
- primaryEvidence.helperOnlyComposition
- primaryEvidence.proposalSource
- primaryEvidence.confirmationSource
- primaryEvidence.verificationSource
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims

If repair is not applied and post-repair verified, finalStatus must remain PARTIAL.

If independent audit returns PARTIAL and no independent PASS rerun exists, finalStatus must remain PARTIAL.

## Final report

Do not paste full stdout.

Do not print secrets, raw provider output, oldText, or newText.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Frozen task load evidence
3. Product entrypoint and productConsumer
4. Original verification failure evidence
5. Repair proposal provenance
6. Repair confirmation provenance
7. Repair apply evidence
8. Post-repair verification evidence
9. Negative controls
10. Route221C report gate result
11. Reference adoption table or not-inspected statement
12. Validation commands with pass/fail
13. Files changed
14. Remaining not-proven claims
15. Recommended next route
