# Route 168: Fenced replacement activation

## Goal

Activate the Route 167 exact fenced replacement lane through the real runtime selection path.

Route 167 added the narrow Edit / Patch owner lane:

- explicit in-workspace target
- exact old/new fenced mapping
- one match only
- workspace authority
- final stale-read
- post-write verification
- Result Surface truthfulness
- continuation-safe evidence

But the lane is not yet reachable from the default prompt / CLI / agent-loop path.

Route 168 should make the capability user-reachable without expanding edit scope.

This route owns:

- Agent Loop selection for exact fenced replacement
- CLI / print path coverage for the activated lane
- Edit / Patch facade dispatch from runtime prompt handling
- stopped-path mapping for missing target, missing mapping, multiple matches, stale-read, and unsupported fuzzy requests
- terminal result truthfulness
- Session / Continue evidence for activated fenced replacement
- focused verifier coverage through real command paths

This is a runtime activation route, not a broad edit route.

## Expected outcome

By the end of Route 168:

1. A normal prompt can trigger exact fenced replacement when target and mapping are explicit.
2. The activated path uses the Route 167 Edit / Patch owner lane, not a duplicate writer.
3. Agent Loop delegates to Edit / Patch facade instead of embedding fenced edit details.
4. CLI print / subprocess path can demonstrate success and stopped outcomes.
5. Result Surface reports success/stopped truthfully.
6. Session / Continue receives safe fenced replacement evidence.
7. Verifier coverage proves the lane is reachable from user-facing execution paths.
8. Unsupported fuzzy / discovery / broad edit requests still stop actionably.

## Required docs

Read only the route-relevant docs first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect current code and tests.

Do not load browser/provider/history docs unless a touched file proves they are needed.

## Reference scan

Use references only for edit activation, tool routing, permission, and user-facing result behavior.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`

Budget:

- opencode: max 8 files
- ClaudeCode: max 8 files
- gemini-cli: max 6 files
- Inspect AI: max 4 files

Focus:

- how exact file-edit tools become selectable from the agent loop
- how permission / stale state is represented before write
- how terminal summaries distinguish success from stopped edit
- how CLI / print tests prove user-facing edit paths
- how eval/verifier cases assert reachable behavior

Do not adopt broad patch engines, fuzzy edit recovery, rollback, or generated-content edit behavior.

## Owner modules

Start in Edit / Patch.

Use or strengthen:

- `packages/ts-shell/src/orchestration/editPatchModule.ts`
- `packages/ts-shell/src/orchestration/fencedEditPlanner.ts`
- `packages/ts-shell/src/orchestration/fencedEditRoute.ts`
- `packages/ts-shell/src/orchestration/fencedEditResult.ts`
- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/workspaceFileContract.ts`
- `packages/ts-shell/src/orchestration/workspaceTargetProjection.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts`
- `packages/ts-shell/src/orchestration/patchResult/mutationVerificationProjection.ts`

Touch Agent Loop only as a composition point:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/resultSurfaceModule.ts`
- `packages/ts-shell/src/orchestration/continuationModule.ts`

Touch CLI only for user-facing path tests or thin routing surface, not redesign.

## Implementation tasks

### 1. Audit current reachability

Before changing behavior, determine:

- how Route 167 fenced lane is callable today
- whether any prompt path already recognizes exact fenced replacement
- whether CLI print path can reach it
- which stopped outcomes already project correctly
- where the current path stops as future-only unsupported edit

Document the audit briefly in the final report.

### 2. Add runtime selection

Teach Agent Loop classification to route exact fenced replacement prompts to the Edit / Patch facade.

Supported prompt shape:

- explicit target file
- exact old fenced block
- exact new fenced block
- no discovery request
- no fuzzy wording
- one target only

The Agent Loop should not parse or execute fenced replacement itself. It should identify the capability and delegate to Edit / Patch.

### 3. Preserve unsupported future edit stops

These must still stop before mutation:

- find the file and replace the block
- replace similar block
- update all fenced blocks
- replace every matching block
- broad refactor inside fenced regions
- generate new implementation for this block
- ambiguous target
- missing target
- missing old block
- missing new block
- multiple exact matches

Stopped results must carry safe reason and do-next text.

### 4. Wire execution through existing lane

Activated execution must reuse Route 167 lane.

Required preconditions:

- workspace target is explicit
- workspace authority passes
- final stale-read runs immediately before mutation
- exact old/new mapping has exactly one match
- post-write verification projection runs
- Result Surface owns terminal truthfulness
- Session / Continue receives safe evidence only

Do not create a second writer or bypass existing mutation lane.

### 5. CLI / print path coverage

Add focused coverage proving user-facing execution paths.

Required scenarios:

- CLI/print exact fenced replacement success
- CLI/print missing target stopped
- CLI/print missing mapping stopped
- CLI/print multiple match stopped
- CLI/print unsupported fuzzy fenced replacement stopped
- CLI/print stale-read stopped if feasible through existing harness

Keep CLI behavior stable. Do not redesign CLI commands.

### 6. Result Surface integration

Ensure terminal outcomes distinguish:

- success with changed file and verification summary
- stopped: missing target
- stopped: missing mapping
- stopped: multiple matches
- stopped: stale-read
- stopped: unsupported fuzzy/discovery/broad edit
- failed: unexpected writer or verification hard failure

Do not let a dry-run, future-only plan, or stopped edit appear as success.

### 7. Session and continue

Activated fenced replacement should produce continuation-safe evidence.

`/continue` should be able to say:

- fenced replacement succeeded on target file
- fenced replacement stopped and why
- verification summary
- what the next actionable step is

Do not persist raw file content, full fenced block content, or secrets.

### 8. Verifier coverage

Add or update focused verifier cases.

Prefer a real CLI subprocess-style verifier case over module-only tests.

Required coverage:

- activated exact fenced replacement success
- activated unsupported fuzzy stopped
- activated missing mapping stopped
- activated multiple matches stopped
- activated session/continue-safe evidence marker
- result-contract compatibility

Keep verifier flags, report fields, dry-run, and dirty-repo behavior stable.

### 9. Docs update

Update only long-lived docs affected by activation:

- implementation manifest if ownership/facade/validation changed
- capability recipe if activation guidance changed
- future edit contract to mark exact fenced replacement as reachable through runtime selection
- module backlog if route status is tracked there

Do not create a new large architecture doc.

## Boundaries

Hard boundaries:

- no provider/model calls
- no browser work
- no broad/fuzzy replacement execution
- no file discovery execution
- no multi-file edit execution
- no generated-content edit
- no rollback/snapshot execution
- no workspace authority weakening
- no stale-read bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- fenced edit planner/route/result tests
- Agent Loop routing tests for activated lane
- CLI/print path tests if touched
- Result Surface tests if touched
- Session / Continue tests if touched
- focused verifier case
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard for capability manifest if changed
- `rtk git diff --check`
- `rtk git status --short --branch`

If package files changed unexpectedly, stop and report.

## Final report

Include:

1. What changed
2. Reachability audit result
3. Runtime selection behavior
4. Exact supported prompt shape
5. Unsupported stopped prompt shapes
6. Execution preconditions
7. Result / terminal behavior
8. Session and continue behavior
9. Verifier coverage
10. Validation
11. Remaining risks
12. Next route recommendation
