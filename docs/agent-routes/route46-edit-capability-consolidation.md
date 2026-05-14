# Route 46: edit capability consolidation and roadmap sync

## Objective

Consolidate the edit capability state after Routes 43-45.

This route is docs/status + validation only.

Update the edit capability roadmap/status to reflect:

- Route 40: exactly-three existing-file update guarded write
- Route 41: non-default exactly-three evidence
- Route 43: single-file move safe-block lane
- Route 44: guarded single-file move writer
- Route 45: guarded single-file delete writer

Do not implement new edit capability.

## Why now

The Route 34 edit roadmap is now stale because it still describes exactly-three as planning/no-write and delete/move as unsupported/no-write. The code now supports:

- single-file update
- single-file create
- exactly-two update
- exactly-three update
- single-file move
- single-file delete

But still does not support:

- broad apply_patch writes
- mixed operation writes
- 4+ writes
- multi-delete/multi-move
- rollback/atomicity
- stale-read recovery
- partial failure recovery

## Validation policy

Use one consolidation validation pass.

Do not run full real-provider execution.

Run:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:real-user-capabilities:single-file-delete-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell

Run verify:release:deterministic only if package.json/scripts/default gate status changed or if the route touches release/readiness wording.

Do not run session/MCP/CLI broad gates unless touched files or failures justify it.

## Boundary check

Before editing, read:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md
- package.json
- scripts/verify-three-file-guarded-write.mjs
- scripts/verify-single-file-move-evidence.mjs
- scripts/verify-single-file-delete-evidence.mjs
- scripts/verify-real-user-capabilities.mjs

Do not restate all old route history.
Just update the map to current truth.

## Allowed scope

Allowed:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md only if it has stale edit-capability references
- PROJECT_STATE.md only if it has stale edit-capability claims
- RUNBOOK.md only if it has stale verifier/script references

Forbidden:

- product code
- tests
- scripts
- package.json
- default gates
- provider/session/CLI/MCP behavior

If code or scripts need changes, stop and report.

## Required roadmap updates

Update docs/design/edit-capability-roadmap.md to include:

### Implemented write capabilities

- selected-workspace single-file update
- selected-workspace single-file create
- selected-workspace exactly-two existing-file update
- selected-workspace exactly-three existing-file update
- selected-workspace guarded single-file move/rename
- selected-workspace guarded single-file delete

### Implemented safety/result infrastructure

- per-file patch plan/result contract
- per-file plan wired into route/result projections
- malformed/unsupported/mixed fixture hardening
- stale-read/read-before-write failure surface
- partial/post-write verification failure surface
- broad/delete/move/mixed no-write classification
- non-default three-file/move/delete evidence

### Still unsupported

- 4+ writes
- broad arbitrary apply_patch writes
- mixed operation writes
- multi-delete
- multi-move
- delete/move mixed with update/create
- rollback/atomicity
- snapshot/revert
- stale-read recovery
- partial failure recovery
- fuzzy patch recovery
- broad release readiness
- default real-provider readiness

### Next route recommendation

Pick exactly one next implementation route.

Recommended default:

- Route 47: mixed operation write readiness evaluation and no-write contract hardening

It should evaluate mixed operation support, not immediately enable mixed writes.

Alternative if the updated roadmap says mixed is too risky:

- Route 47: multi-delete/multi-move planning-only expansion, no write

Do not recommend broad apply_patch writes as the next route.

## Success criteria

Route is complete if:

- roadmap/status reflects Routes 40-45 accurately
- stale non-claims are removed or corrected
- broad/mixed/rollback unsupported boundaries remain explicit
- exactly one next implementation route is recommended
- validation passes
- residue cleaned
- no product code changed
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
5. Updated evidence commands
6. Next recommended route
7. Validation results
8. Residue cleanup
9. Product code touched? yes/no
10. Default gates changed? yes/no
11. Proposed commit message

Do not commit or push.
