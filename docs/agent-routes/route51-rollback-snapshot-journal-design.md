# Route 51: rollback / snapshot / journal design

## Objective

Design the rollback / snapshot / journal boundary before any broader edit capability expansion.

This is docs-first only.

Do not implement rollback.
Do not implement snapshot.
Do not implement journal.
Do not implement broad apply_patch.
Do not implement 3+ mixed writes.
Do not change product code, tests, scripts, package.json, gates, provider/session/CLI/MCP behavior, or readiness claims.

Write the design to:

- docs/design/rollback-snapshot-journal-design.md

## Why this route

Route 50 concluded that broad apply_patch and 3+ mixed writes should not continue expanding under pure sequential/no-rollback semantics.

The project already supports narrow sequential write lanes, but larger operation sets need an explicit recovery decision.

This route must answer:

- whether rollback is required before broad apply_patch
- whether rollback is required before 3+ mixed writes
- whether recovery should be snapshot-based, journal-based, git/checkpoint-based, or explicit no-rollback
- which plane owns recovery:
  - TS control plane
  - Rust execution plane
  - filesystem journal
  - git/checkpoint layer
  - no implementation yet

## Validation policy

Docs-first route.

Run only:

- rtk git status --short --branch
- rtk git diff --check

Do not run product gates unless product code, scripts, package.json, or gates are touched unexpectedly.

Do not run full real-provider execution.

## Boundary check

Read:

- docs/design/edit-capability-roadmap.md
- docs/design/broad-apply-patch-3plus-readiness-design.md
- docs/design/runtime-module-ownership-map.md
- PROJECT_STATE.md
- RUNBOOK.md

Use them only to confirm current claims and unsupported boundaries.

Do not restate the full route history.

## Narrow reference comparison

Do a narrow read-only comparison.

Reference only:

- opencode:
  - snapshot/index.ts
  - patch/apply_patch areas
  - session processor
  - focus: snapshot/revert ownership, apply ordering, failure boundaries
- Gemini CLI:
  - checkpoint / restore / git service / sandbox / trusted folder areas
  - focus: checkpoint ownership and restore boundary
- Claude Code:
  - FileEditTool and failed tool result surfaces
  - focus: read-first/stale rejection and user-visible failure surface, not rollback implementation

Use references only for design lessons.
Do not copy code.
Keep final report short.

## Required design document

Create:

- docs/design/rollback-snapshot-journal-design.md

The document must include:

1. Executive conclusion
2. Current write capability surface
3. Current no-rollback risk
4. Recovery options compared
5. Option A: explicit no-rollback with stronger failure surfaces
6. Option B: TS control-plane journal
7. Option C: Rust execution-plane journal
8. Option D: git/checkpoint snapshot
9. Option E: filesystem copy snapshot
10. Ownership decision
11. Data model needed
12. Failure lifecycle
13. Session/result surface requirements
14. Security/workspace boundary requirements
15. Validation/evidence requirements
16. What remains unsupported
17. Recommended next route

## Questions to answer

### Required before broad apply_patch?

Answer:

- Is rollback required before broad apply_patch writes?
- If yes, what is the minimum recovery mechanism?
- If no, what hard limits must remain?

### Required before 3+ mixed writes?

Answer:

- Is rollback required before 3+ mixed writes?
- Is exactly-three mixed acceptable without rollback?
- Is 4+ mixed acceptable without rollback?
- Where should the line be drawn?

### Ownership

Answer:

- Should recovery live in TS orchestration?
- Should it live in Rust execution?
- Should it be a git/checkpoint layer?
- Should it be postponed and explicitly not claimed?

### Failure model

Answer:

- What happens when operation 1 succeeds and operation 2 fails?
- What happens when rollback fails?
- What happens when post-write verification fails?
- How are changedFiles / failedFiles / recoveredFiles / unrecoveredFiles represented?
- How is no atomicity claim avoided?

### Evidence

Answer:

- What focused tests are required?
- What non-default evidence commands are required?
- What must never enter default gates until proven?
- What existing gates must remain unchanged?

## Recommendation requirement

Pick exactly one next route.

Allowed recommendations:

### Option A

Route 52: rollback/snapshot prototype design refinement, docs-only

Choose if more design is needed.

### Option B

Route 52: no-rollback larger-write boundary hardening, implementation

Choose only if the design concludes larger writes can continue under strict sequential/no-rollback semantics.

### Option C

Route 52: TS journal prototype, no product capability

Choose if TS-owned journaling is the preferred first prototype.

### Option D

Route 52: Rust execution-plane recovery contract, design/prototype

Choose if recovery must live below TS.

### Option E

Route 52: broad apply_patch remains blocked; improve partial failure/result evidence

Choose if rollback is needed but not ready.

Do not recommend direct broad apply_patch writes as Route 52.

## Allowed scope

Allowed:

- docs/design/rollback-snapshot-journal-design.md
- docs/design/broad-apply-patch-3plus-readiness-design.md only if a small cross-link is needed
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

Route 51 is complete if:

- docs/design/rollback-snapshot-journal-design.md exists
- opencode / Gemini CLI / Claude Code were narrowly compared
- design chooses whether rollback is required before broad/3+
- ownership options are compared
- exactly one next route is recommended
- broad apply_patch writes are not recommended directly
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
5. Is rollback required before broad apply_patch?
6. Is rollback required before 3+ mixed?
7. Ownership recommendation
8. Recommended next route
9. Product code touched? yes/no
10. Scripts/package/default gates changed? yes/no
11. Validation results
12. Residue cleanup
13. Proposed commit message

Do not commit or push.
