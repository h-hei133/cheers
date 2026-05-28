# Build Infrastructure Route BI002: Runtime Turn Snapshot And Save Point

## Goal

Implement the first Pi-inspired build-infrastructure route.

This route introduces a local Runtime / Turn boundary inspired by Pi AgentHarness, but adapted to this project architecture.

Target capabilities:

- frozen turn snapshot
- explicit runtime phase vocabulary
- evidence-only save point
- narrow runtime integration
- session/result consumption without terminal status inflation

This is product architecture work, not route-era harness work.

Expected final status: COMPLETE.

## Why this route comes first

BI001 concluded that the highest-value adopt-now patterns are:

- AgentHarness-style boundary above the low-level loop
- frozen turn snapshot
- save point after tool/result batch
- explicit phase model
- result-style low-level error discipline
- tool content/details split later

BI002 only implements the first boundary group:

- turn snapshot
- phase vocabulary
- evidence-only save point

Execution error taxonomy and tool content/details are deferred to BI003.

## Owner domains

Primary owners:

- runtime
- turn
- session or continue
- result
- evidence

Allowed target areas:

- packages/ts-shell/src/runtime
- packages/ts-shell/src/turn
- packages/ts-shell/src/session
- packages/ts-shell/src/result
- packages/ts-shell/src/evidence

Do not put new behavior into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol/file inspection:

- runtime workflow coordinator
- turn owner area
- session continuation or session runtime surfaces
- result terminal truthfulness surfaces
- evidence projection surfaces
- ExecutionService only if needed for boundary awareness

Inspect Pi reference repo only for targeted comparison:

- AgentHarness
- createTurnState
- createLoopConfig or prepareNextTurn
- phase type
- flushPendingSessionWrites
- save point related event or contract

Do not broad dump either repo.

Record inspected symbols/files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Frozen turn snapshot

Add a local turn snapshot type that captures report-safe inputs for one turn.

It should include only safe structural facts such as:

- turn id or equivalent stable id
- phase at snapshot creation
- prompt or task intent summary if already redacted
- provider mode and provider opt-in status, not secrets
- model safe label if already available
- active capability flags
- workspace/project root safe identity
- planning or mutation mode flags
- execution boundary mode
- session continuation identity if safe
- evidence correlation ids if available

It must not include:

- API keys
- raw provider output
- raw oldText or newText
- private provider config
- unredacted command output
- hidden reasoning
- full transcript dump
- arbitrary file contents

The snapshot is not a success claim.

### 2. Explicit runtime phase vocabulary

Add or consolidate a small phase vocabulary for runtime structural operations.

Recommended initial phases:

- idle
- prompt
- turn
- tool_result_batch
- save_point
- compact
- retry
- continue
- aborted

Use only phases that fit the local runtime.

The phase model must prevent obvious structural conflicts, but this route should not redesign the whole agent loop.

Minimum behavior:

- snapshot creation records the phase
- save point has a phase or phase transition
- invalid structural transitions are rejected or classified in focused tests
- phase state does not alter terminal truthfulness by itself

### 3. Evidence-only save point

Add a save-point projection after a tool/result/evidence batch or equivalent local runtime boundary.

The save point may collect:

- turn snapshot id
- safe evidence ids
- session persistence status if available
- result projection status
- pending next-turn refresh facts
- not-proven claims
- redaction status

The save point must not imply:

- provider success
- proposal success
- apply success
- verification success
- repair success
- terminal success

Terminal status remains owned by Result Surface and evidence/verdict rules.

### 4. Narrow runtime integration

Wire the snapshot and save point at the narrowest practical runtime seam.

Preferred integration:

- current runtime workflow coordination seam
- turn boundary seam
- session/result projection seam

Avoid:

- large workflowExecutionCoordinator rewrite
- provider behavior changes
- tool execution behavior changes
- edit or verification behavior changes
- browser or MCP work
- session schema migration

## Required tests

Add focused tests only.

Test categories:

1. Snapshot immutability
   A snapshot should not change when later runtime options or phase changes occur.

2. Redaction
   Snapshot and save point must not contain provider secrets, raw provider output, oldText, newText, or unredacted command output.

3. Phase transition
   At least one invalid structural transition is blocked or classified.

4. Save point truthfulness
   Save point cannot upgrade stopped, blocked, partial, not-run, or not-proven into success.

5. Product integration
   A real local product seam consumes or emits snapshot/save-point evidence without route-local-only proof.

Run focused tests for touched modules.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no broad runtime rewrite
- no provider default enablement
- no session schema migration
- no tool execution behavior change
- no edit, verification, browser, or MCP expansion
- no Python runtime
- no contracts business logic
- no direct side-effect bypass outside ExecutionService or sanctioned owner
- no success outside evidence/verdict/result truthfulness

## What not to do

Do not:

- copy Pi names directly if local owner names are better
- introduce a Pi package structure
- create AgentHarness as a foreign product island if local runtime/turn owners are more appropriate
- create a route runner
- create a verify route script
- create JSON capability reports
- move many files just to look like Pi
- add dynamic resources
- add extension loading
- change provider execution
- enable live provider
- change CLI UX except minimal evidence display if already necessary

## Validation

Required:

- focused tests for touched modules
- npm run verify:result-contract if result/session terminal behavior is touched
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Do not claim tests or build passed unless actually run.

## Completion criteria

BI002 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- a local frozen turn snapshot type exists in the proper owner domain
- a local runtime phase vocabulary exists or is consolidated
- an evidence-only save point projection exists
- integration occurs at a narrow product runtime seam
- no compatibility shim grows business logic
- no route-era product naming is introduced
- snapshot and save point are redacted
- save point does not imply terminal success
- focused tests pass
- required validation is reported honestly

If implementation would require broad runtime rewrite or session schema migration, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Snapshot design
6. Phase vocabulary
7. Save point design
8. Integration seam
9. Redaction behavior
10. Truthfulness behavior
11. Tests and validation pass/fail
12. Architecture constraints preserved
13. What was deliberately deferred to BI003
14. Recommended next route

## Next route

After BI002 is complete, continue with:

docs/build-infrastructure/route/route-bi003-execution-receipt-tool-details.md

BI003 should combine ExecutionService error taxonomy, runtime receipt projection, and tool result content/details separation.
