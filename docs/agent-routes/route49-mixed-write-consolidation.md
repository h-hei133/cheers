# Route 49: mixed write consolidation and roadmap sync

## Objective

Consolidate state after Route 48 exactly-two mixed write support.

This is docs/status + validation only.

Do not implement new capability.

Update current docs/status to reflect that Route 48 now supports exactly-two mixed write lanes:

- Update + Add
- Update + Move
- Add + Move
- Update + Delete
- Add + Delete
- Move + Delete

Also preserve explicit non-claims:

- no 3+ mixed writes
- no broad apply_patch writes
- no 4+ writes
- no rollback / atomicity
- no recovery / retry / merge
- no broad release readiness
- no default real-provider readiness

## Why now

Route 48 opened six exactly-two mixed write lanes. Before expanding further, the project needs:

- roadmap/status sync
- deterministic release check
- evidence command inventory
- explicit sequential/no-rollback risk statement
- one next bounded route recommendation

## Validation policy

Use consolidation validation only.

Run:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run verify:real-user-capabilities:mixed-operation-evidence
- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:real-user-capabilities:single-file-delete-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

Do not run full real-provider execution.
Do not run session/MCP/CLI broad gates unless validation points to a cross-cutting failure.

## Boundary check

Read:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- scripts/verify-mixed-operation-evidence.mjs
- scripts/verify-real-user-capabilities.mjs

Use them only to update stale edit-capability status.

Do not restate the full route history.

## Allowed scope

Allowed:

- docs/design/edit-capability-roadmap.md
- PROJECT_STATE.md
- RUNBOOK.md
- docs/design/runtime-module-ownership-map.md only if it contains stale edit-capability references

Forbidden:

- product code
- tests
- scripts
- package.json
- default gates
- provider/session/CLI/MCP behavior

If code/scripts/package changes are required, stop and report.

## Required updates

Update docs/status to reflect:

### Implemented write capabilities

- selected-workspace single-file update
- selected-workspace single-file create
- selected-workspace exactly-two update
- selected-workspace exactly-three update
- selected-workspace single-file move/rename
- selected-workspace single-file delete
- selected-workspace exactly-two mixed write lanes:
  - update + add
  - update + move
  - add + move
  - update + delete
  - add + delete
  - move + delete

### Implemented safety/result infrastructure

- per-file patch plan/result contract
- per-file plan wired into route/result projections
- malformed/unsupported/mixed fixture hardening
- stale-read / read-before-write failure surface
- partial/post-write verification failure surface
- broad/delete/move/mixed no-write planning
- mixed-operation readiness projection
- non-default evidence for exactly-three, move, delete, and mixed operation writes

### Still unsupported

- 3+ mixed writes
- broad arbitrary apply_patch writes
- 4+ writes
- multi-delete / multi-move beyond exactly-two mixed lanes
- broad unified diff writer
- directory delete/move
- overwrite
- outside-workspace operations
- rollback / atomicity
- snapshot / revert
- stale-read recovery
- partial failure recovery
- fuzzy patch recovery
- broad release readiness
- default real-provider readiness

### Risk statement

Explicitly document:

- mixed writes are sequential
- no rollback or atomicity is claimed
- partial failure may leave verified changed files and failed files
- result surfaces must report changedFiles / failedFiles accurately
- future 3+ mixed or broad apply_patch requires a separate route

## Next route recommendation

Recommend exactly one next route.

Preferred recommendation:

- Route 50: broad apply_patch / 3+ mixed write readiness design, docs-first

Reason:

- Route 48 significantly expanded write capability.
- The next jump, 3+ mixed or broad apply_patch, raises ordering, rollback, destructive confirmation, and partial failure risks.
- A docs-first route should decide whether to build rollback/snapshot first or continue sequential/no-rollback semantics.

Do not recommend directly enabling broad apply_patch writes as the next route.

## Success criteria

Route is complete if:

- docs/status reflect Route 48 accurately
- stale non-claims are corrected
- broad/mixed/rollback unsupported boundaries remain explicit
- exactly one next route is recommended
- consolidation validation passes
- residue cleaned
- no product code changed
- no scripts/package/default gates changed
- no commit/push

## Residue cleanup

Clean generated residue when safe:

- permissions.jsonl changes
- history.db changes
- undefined/
- temporary logs
- /tmp/private-agents-test/test-results/real-user-capabilities-report.json

## Final report

Report:

1. Route
2. Files changed
3. Current implemented edit capabilities
4. Current unsupported capabilities
5. Evidence commands verified
6. Deterministic release result
7. Next recommended route
8. Product code touched? yes/no
9. Scripts/package/default gates changed? yes/no
10. Residue cleanup
11. Proposed commit message

Do not commit or push.
