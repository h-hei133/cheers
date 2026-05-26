# Route 227D: Edit Engine Capability Expansion

## Goal

Expand the edit engine from narrow exact update into a stronger controlled edit capability set.

Route227A improves live exact proposals.
Route227B improves context/planning.
Route227C turns planning into validated proposal handoff.

Route227D must make the downstream edit engine capable of handling more realistic proposal operations while preserving the proof-carrying mutation rules.

Target chain:

validated proposal
-> operation classification
-> authority check
-> snapshot / recovery evidence
-> existing or narrowly extended apply backend
-> per-file apply/readback evidence
-> partial failure truthfulness
-> verification handoff
-> final mutation evidence

Expected final status: COMPLETE.

This route should raise edit capability, not merely add another report. It must produce real product-path edit behavior for controlled operations.

## Current gap

The project is strongest at:

- single-file exact update
- selected-workspace exact hunk apply
- small target-set evidence
- per-file evidence accounting
- readback verification

But it is still weak or not proven for:

- create-file product path
- safe delete
- safe move/rename
- controlled 3+ file target set
- partial failure recovery evidence across mixed operations
- preview-first broad refactor decomposition
- transaction-like ordered apply journal
- clear unsupported status for broad/fuzzy edits

Route227D must expand capability without opening unsafe broad mutation.

## Capability to build

Build a controlled edit operation layer over existing exact/proof backend.

Required capabilities:

1. Operation classification
   Classify proposals into:
   - update-existing-file
   - create-file
   - delete-file-preview
   - move-or-rename-preview
   - multi-file-target-set
   - broad-refactor-preview
   - unsupported-operation

2. Update existing file
   Preserve current exact hunk behavior:
   - unique oldText / exact hunk
   - stale-read check
   - selected-workspace authority
   - apply/readback evidence
   - verification handoff

3. Create file
   Add controlled create-file capability:
   - explicit target path
   - selected/controlled workspace only
   - path traversal rejected
   - overwrite protection
   - snapshot/recovery evidence
   - readback evidence
   - verification handoff
   - no production default write

4. Delete file preview
   Implement safe preview first:
   - identify target
   - show impact and authority requirement
   - do not delete by default
   - only allow controlled delete apply if existing project policy already supports it or a narrow safe backend is added with audit
   - otherwise leave as preview/blocked with honest verdict

5. Move/rename preview
   Implement safe preview first:
   - source exists
   - destination safe
   - no overwrite unless explicit policy
   - show import/reference impact candidates
   - do not apply by default
   - controlled apply only if safe backend and audit exist

6. Small multi-file exact apply
   Strengthen target-set apply:
   - at least 3 required files in controlled workspace if feasible
   - per-file apply status
   - per-file readback status
   - aggregate follows weakest file
   - failed/unattempted files remain visible
   - no single-file success hides multi-file failure

7. Snapshot and recovery evidence
   Improve mutation safety:
   - pre-apply snapshot where appropriate
   - ordered apply journal
   - changed / failed / unattempted files
   - recovery availability
   - recovery available is not rollback executed
   - partial apply does not become success

8. Broad refactor decomposition
   Do not implement broad fuzzy apply.
   Instead:
   - split broad requests into candidate operations
   - emit preview and unsupported claims
   - show required future steps
   - block unsafe auto-apply

9. Product path integration
   These operations must be reachable from real product proposal/apply path or accepted product composition roots.
   Route-local scripts are drivers only, not the capability.

## Required subagents

Use focused subagents.

Before implementation:

1. Edit backend subagent
   Inspect existing hunk-set, target-set, workspace write, snapshot, and readback routes.
   Report the smallest safe extension path for update/create/multi-file and preview operations.

2. Operation safety subagent
   Inspect path policy, selected workspace authority, stale-read checks, and partial failure behavior.
   Report safety rules for create/delete/move/multi-file.

3. Product path subagent
   Inspect how Route227C proposal handoff should feed edit operation classification and apply readiness.
   Report how to keep product path evidence primary.

After implementation:

1. Write safety audit subagent
   Check no new unrestricted writer, no path traversal, no production default write, no fuzzy success.

2. Partial failure/recovery audit subagent
   Check ordered journal, per-file evidence, snapshot/recovery, and aggregate verdict truthfulness.

3. Product evidence audit subagent
   Check product path consumes the edit layer and route-local evidence remains secondary.

Each subagent should return short findings, changed seams, risks, and audit result.

## Reference policy

No broad reference scan.

Reference pool under /home/wang/projects:

- opencode
- OpenHands
- mini-swe-agent
- GitNexus
- inspect_ai

Suggested mapping:

- opencode: edit tool boundaries and permission flow
- OpenHands: file operation safety and action trajectory
- mini-swe-agent: simple patch application loop
- GitNexus: impact-aware edit boundary and reference impact ideas
- inspect_ai: evidence/reporting shape for partial tasks

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local Route227C and existing edit backend were sufficient.

## Phases

### Phase 1: Edit operation audit and baseline

Goal:

Map current edit capability and select minimal safe extension seams.

Do:

- inspect proposal hunk-set apply
- inspect target-set edit route
- inspect workspace write route
- inspect snapshot/recovery modules
- inspect path/selected workspace authority
- inspect readback verification
- inspect product proposal/apply handoff from Route227C
- build baseline operation matrix

Baseline operation matrix:

1. update existing file
2. create file
3. two-file target set
4. three-file target set if feasible
5. delete preview
6. move/rename preview
7. broad refactor preview
8. partial failure case

Focused audit:

- no writer expansion before policy
- no fuzzy apply
- product path gaps recorded honestly

### Phase 2: Controlled create-file capability

Goal:

Add controlled create-file product path.

Do:

- accept create-file proposal shape from Route227C
- validate path is inside selected/controlled workspace
- reject path traversal
- reject unsafe overwrite
- require explicit authority
- create through safe existing write boundary or narrow controlled backend
- record snapshot/recovery evidence
- read back created file
- pass verification intent downstream

Product evidence:

- one create-file task succeeds in controlled workspace
- one unsafe path is rejected
- one overwrite attempt is blocked or requires explicit stronger authority

Focused audit:

- create-file is not production default write
- create-file does not create outside workspace
- route-local fixture does not become primary evidence

### Phase 3: Small multi-file exact apply expansion

Goal:

Strengthen target-set apply and per-file evidence.

Do:

- support small multi-file exact target set, preferably 3 files if feasible
- preserve per-file apply/readback/verification status
- record ordered apply journal
- record changed/failed/unattempted files
- enforce aggregate verdict from weakest required file
- preserve recovery evidence for partial failure
- ensure one successful file cannot hide another failed file

Product evidence:

- one multi-file exact apply succeeds with all required files verified or readback-ready
- one partial failure task remains partial/stopped
- report exposes per-file status

Focused audit:

- partial apply cannot success
- recovery available cannot mean rollback executed
- per-file evidence is not flattened

### Phase 4: Delete and move/rename preview

Goal:

Improve upper-bound capability without unsafe apply.

Do:

- classify delete proposal
- classify move/rename proposal
- check source/destination safety
- detect simple impact candidates
- produce preview surface
- require explicit authority for any future apply
- block or leave preview-only if safe apply backend is not implemented
- do not claim unsupported operations as complete

Product evidence:

- delete preview task produces target, impact, authority requirement, and blocked/apply-not-run status
- move/rename preview task produces source/destination, impact candidates, authority requirement, and blocked/apply-not-run status
- broad refactor remains preview/decomposed/blocked

Focused audit:

- preview is not apply
- unsupported operation is not success
- delete/move does not mutate unless safe backend is explicitly implemented and audited

### Phase 5: Broad refactor decomposition

Goal:

Raise perceived capability for broad tasks without unsafe broad apply.

Do:

- classify broad refactor requests
- split into smaller supported candidate operations
- estimate impacted files
- identify unsupported parts
- produce a staged plan
- block automatic broad mutation
- feed supported sub-operations to proposal orchestrator when safe

Product evidence:

- unsupported broad frozen task remains blocked
- one broad-ish task produces a useful decomposition plan
- supported subclaims are separated from not-proven claims

Focused audit:

- decomposition is not implementation
- broad refactor cannot claim COMPLETE from preview
- unsupported claims remain visible

### Phase 6: Route227D report and handoff to Route227E

Create:

docs/implementation-context/route227d-edit-engine-capability-expansion-report.json

Report must include:

- schemaVersion
- route=route227d
- routeType=edit-engine-capability
- finalStatus
- primaryEvidence
- editOperationsAttempted
- productEditTasksAttempted
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- perFileEvidence
- snapshotRecoveryEvidence
- previewEvidence
- notProvenClaims
- referenceAdoption if references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route227d verifier only if useful. It must drive product edit path or remain secondary.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-lower-bound-stable-selected-workspace-authority-case
- frozen-upper-bound-challenge-multi-file-case
- frozen-unsupported-broad-task-negative-control
- frozen-session-continuity-result-truth

Recommended if cheap:

- frozen-command-only-bypass-negative-control

These protect lower-bound truth while edit capability expands.

## Completion criteria

Route227D is COMPLETE only if:

- product path consumes the expanded edit operation layer
- update existing file remains working
- create-file succeeds in controlled workspace with explicit authority and readback
- unsafe create path is rejected
- small multi-file exact apply records per-file evidence and at least one successful target-set task
- partial multi-file failure does not become success
- delete and move/rename are at least classified and previewed safely
- broad refactor is decomposed or blocked without claiming mutation success
- snapshot/recovery evidence is recorded for apply paths
- recovery available is not reported as rollback executed
- no new unrestricted writer is introduced
- no fuzzy apply is reported as success
- route-local demos are not primary evidence
- Route221 report gate passes
- final report justifies COMPLETE from product edit evidence

If create-file or multi-file product apply cannot be safely implemented, final status must be PARTIAL or BLOCKED with exact reason.

## Scope

Allowed:

- edit operation classification
- create-file controlled product path
- small multi-file exact target-set strengthening
- delete preview
- move/rename preview
- broad refactor decomposition preview
- snapshot/recovery evidence
- per-file evidence
- product apply handoff
- report artifact
- focused tests for edit operation classification/apply/preview/partial failure

Avoid unless necessary:

- live provider prompt work owned by Route227A
- planning/proposal orchestration owned by Route227B/C
- verification intelligence owned by Route227E
- large CLI refactor
- large SessionManager refactor
- broad Claim Ledger rewrite
- browser/MCP work

Not allowed:

- new unrestricted writer
- fuzzy apply as success
- production workspace default write
- arbitrary delete/move without preview and authority
- broad refactor auto-apply
- route-local helper success as primary COMPLETE evidence
- apply without readback evidence
- partial failure success
- recovery available as rollback executed
- new dependencies unless already approved by project policy

## Phase commit policy

Codex may commit a green phase to keep worktree readable.

Commit rules:

- commit message starts with route227d:
- do not push
- do not commit failing states
- do not commit audit residue
- final report lists phase commits

Commits are optional, not mandatory.

## Final report

Do not paste full stdout.

Do not print secrets or unsafe patch contents.

Include:

1. Final status
2. Phase commits
3. Baseline operation matrix
4. Create-file behavior
5. Multi-file exact apply behavior
6. Partial failure behavior
7. Delete preview behavior
8. Move/rename preview behavior
9. Broad refactor decomposition behavior
10. Snapshot/recovery evidence
11. Product path evidence
12. Frozen tasks attempted
13. Negative controls
14. Route221 gate result
15. Reference adoption table or not-inspected statement
16. Validation commands with pass/fail
17. Files changed
18. Remaining not-proven claims
19. What capability increased
20. What lower-bound safety was preserved
21. Next route: docs/agent-routes/route227e-verification-intelligence-upgrade.md

## Next route

After Route227D is complete, continue with:

docs/agent-routes/route227e-verification-intelligence-upgrade.md

Route227E will upgrade verification from basic build/command dispatch into focused test selection, test adjacency, build/test/typecheck ladder, failure classification, and stronger repair handoff.
