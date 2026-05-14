# Route 50: broad apply_patch / 3+ mixed readiness design

## Objective

Design the next edit-capability expansion boundary after Route 48/49.

This is docs-first only.

Do not implement broad apply_patch.
Do not implement 3+ mixed writes.
Do not implement rollback/snapshot/recovery.
Do not modify product code, tests, scripts, package.json, default gates, provider/session/CLI/MCP behavior, or readiness claims.

Write the design to:

- docs/design/broad-apply-patch-3plus-readiness-design.md

The design must decide the next implementation direction:

1. Continue with sequential/no-rollback semantics for a bounded 3+ route, or
2. Build rollback/snapshot/journal design first, or
3. Keep 3+ and broad apply_patch blocked and improve evidence/surfaces only.

Pick exactly one recommended next route.

## Context

Current implemented edit capabilities include:

- single-file update
- single-file create
- exactly-two update
- exactly-three update
- single-file move
- single-file delete
- exactly-two mixed operation writes:
  - update + add
  - update + move
  - add + move
  - update + delete
  - add + delete
  - move + delete

Still unsupported:

- 3+ mixed writes
- broad arbitrary apply_patch writes
- 4+ writes
- multi-delete / multi-move beyond current exactly-two mixed lanes
- unified diff broad writer
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

## Validation policy

Docs-first route.

Run only:

- rtk git status --short --branch
- rtk git diff --check

Do not run product gates unless you unexpectedly touch product code, scripts, package.json, or gates.

Do not run full real-provider execution.

## Boundary check

Read:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md
- PROJECT_STATE.md
- RUNBOOK.md

Use them only to confirm current claims and unsupported boundaries.

Do not restate the full route history.

## Narrow reference comparison

Because this route decides broad patch / 3+ direction, do a narrow read-only comparison.

Reference only:

- opencode:
  - apply_patch / patch parser / snapshot / session processor
  - focus: broad patch representation, apply ordering, snapshot/revert boundary, permission metadata
- Gemini CLI:
  - file tools / checkpoint / sandbox / trusted folders
  - focus: checkpoint boundary, safe filesystem operations, restore as separate capability
- Claude Code:
  - FileEditTool and failed tool result surfaces
  - focus: read-first/stale rejection, failed edit visibility, user-facing failure surface

Use references only for design lessons.
Do not copy code.
Keep final report concise.

## Required design content

Create:

- docs/design/broad-apply-patch-3plus-readiness-design.md

It must include:

1. Executive conclusion
2. Current implemented edit surface
3. Current unsupported surface
4. Broad apply_patch risk analysis
5. 3+ mixed write risk analysis
6. Sequential/no-rollback tradeoff
7. Rollback/snapshot/journal tradeoff
8. Per-operation authority requirements
9. Operation ordering model options
10. Partial failure model
11. User-visible result surface requirements
12. Evidence/gate requirements
13. Reference comparison summary
14. Recommended next route
15. Explicit non-goals

## Design questions to answer

### Broad apply_patch

Answer:

- What is the smallest broad apply_patch subset that could ever be safe?
- Can broad apply_patch be split into planning-only, 3+ update, 3+ mixed, delete/move, and unified diff lanes?
- Which broad shapes must remain permanently blocked until rollback/snapshot exists?
- Does broad apply_patch need its own parser/evaluator separate from current perFilePatchPlan?
- Can broad writes be allowed without making arbitrary mutation claims?

### 3+ mixed writes

Answer:

- Should 3+ mixed be implemented before rollback?
- Is sequential/no-rollback acceptable for 3 operations? 4 operations? more?
- Should there be a hard max such as exactly-three mixed only?
- What operation combinations are too risky without rollback?
- How should changedFiles / failedFiles be represented on partial failure?

### Rollback / snapshot

Answer:

- Is rollback required before broad apply_patch?
- Is rollback required before 3+ mixed?
- If rollback is needed, should it live in:
  - TS control plane
  - Rust execution plane
  - filesystem journal
  - git/snapshot/checkpoint layer
- What is the minimal docs-first design needed before implementation?

### Evidence

Answer:

- What non-default evidence is required before enabling any new lane?
- Which existing gates must remain unchanged?
- What new evidence names would be needed?
- What should remain outside default release gates?

## Required recommendation

Pick exactly one next route.

Allowed recommendations:

### Option A

Route 51: rollback/snapshot/journal design, docs-first

Choose this if broad/3+ cannot honestly proceed without rollback semantics.

### Option B

Route 51: exactly-three mixed write lane, implementation

Choose this only if sequential/no-rollback is acceptable for exactly-three mixed and the scope is narrow.

### Option C

Route 51: broad apply_patch planning/evidence hardening, no write

Choose this if more structured evidence is needed before any new writer.

### Option D

Route 51: partial failure UX/result surface hardening

Choose this if current result surface is insufficient for larger writes.

Do not recommend broad apply_patch writes directly as Route 51.

## Allowed scope

Allowed:

- docs/design/broad-apply-patch-3plus-readiness-design.md
- docs/design/edit-capability-roadmap.md only if a small cross-link is needed
- PROJECT_STATE.md only if a small cross-link is needed
- RUNBOOK.md only if a small cross-link is needed

Prefer only the new design doc.

## Forbidden scope

Forbidden:

- product code
- tests
- scripts
- package.json
- default gates
- provider/session/CLI/MCP behavior
- readiness claim expansion

If implementation appears necessary, stop and report.

## Success criteria

Route 50 is complete if:

- design doc exists
- design compares opencode, Gemini CLI, and Claude Code narrowly
- design decides whether rollback/snapshot is required before broad/3+
- design states current unsupported boundaries clearly
- design picks exactly one next route
- no product code changed
- no scripts/package/default gates changed
- validation passes
- residue cleaned
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
3. Design conclusion
4. Reference comparison summary
5. Whether rollback/snapshot is required before broad/3+
6. Recommended next route
7. Product code touched? yes/no
8. Scripts/package/default gates changed? yes/no
9. Validation results
10. Residue cleanup
11. Proposed commit message

Do not commit or push.
