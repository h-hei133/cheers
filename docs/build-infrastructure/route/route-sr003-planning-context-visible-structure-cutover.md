# Structure Route SR003: Planning Context Visible Structure Cutover

## Goal

Implement the second visible structure cutover after SR002.

SR002 moved low-risk surface and runtime infrastructure into nested short-name owner paths.

SR003 must now apply the same visible structure strategy to the Context and Planning capability block.

Target domains:

- context discovery
- context acquisition
- context graph
- context memory
- context projection
- planning runtime
- planning projection
- planning proposal preparation
- planning mutation handoff
- planning verification handoff where locally owned
- Agent Loop feature contracts only as import consumers

Expected final status: COMPLETE.

This is a structure route, not a feature route.

It must not change Context and Planning behavior, truthfulness, provider behavior, edit/apply behavior, verification execution, repair behavior, session schema, product loop behavior, package scripts, or build config.

## Why this route exists

CP002 through CP006 made Context and Planning stronger, but much of the implementation still lives in long-name orchestration files.

Examples of current style to improve over time:

- orchestration/repoIntelligence
- orchestration/contextEngine
- orchestration/contextGraphPlanning
- orchestration/contextAcquisitionProjection
- orchestration/groundedPlanningProjection
- orchestration/contextMemory
- orchestration/planningRuntime
- orchestration/planningRuntimeProductProjection
- orchestration/planningRuntimeProductProposal
- orchestration/planningMutationHandoffProjection
- orchestration/planningMutationProposalBridge

These names are descriptive but visually noisy. They also keep the newest Context and Planning capability block inside a broad orchestration folder instead of clear product domains.

SR003 must move real implementation into nested context and planning owner paths with short local file names.

## Target structure

Preferred target layout:

packages/ts-shell/src/context/
  discovery/
    scan.ts
    ranking.ts if needed
    handoff.ts if needed
  acquisition/
    engine.ts
    graph.ts
    projection.ts
    summary.ts if needed
  memory/
    store.ts or model.ts
    reuse.ts if needed
  rebuild/
    projection.ts if existing rebuild code fits here
  index.ts

packages/ts-shell/src/planning/
  runtime/
    engine.ts
    quality.ts if needed
    projection.ts
    proposal.ts
  handoff/
    mutation.ts
    verification.ts if needed
    bridge.ts
  grounded/
    projection.ts
  index.ts

Use the exact split only where current responsibilities justify it.

Do not over-split just to satisfy the layout.

## Existing file treatment

Existing long-name product files in the selected domains should follow this policy:

1. If safe, move real implementation to the new short-name owner path.
2. Replace old orchestration file with a thin compatibility export.
3. Add a short compatibility comment only if needed.
4. Update project-internal imports to new short paths where safe.
5. Do not keep duplicate implementations.
6. Do not let compatibility files grow logic.

Expected moves if current files exist and are safe:

orchestration/repoIntelligence.ts
-> context/discovery/scan.ts

orchestration/contextEngine.ts
-> context/acquisition/engine.ts

orchestration/contextGraphPlanning.ts
-> context/acquisition/graph.ts

orchestration/contextAcquisitionProjection.ts
-> context/acquisition/projection.ts

orchestration/contextPlanningSummary.ts
-> context/acquisition/summary.ts

orchestration/contextMemory.ts
-> context/memory/model.ts or context/memory/reuse.ts

orchestration/groundedPlanningProjection.ts
-> planning/grounded/projection.ts

orchestration/planningRuntime.ts
-> planning/runtime/engine.ts

orchestration/planningRuntimeProductProjection.ts
-> planning/runtime/projection.ts

orchestration/planningRuntimeProductProposal.ts
-> planning/runtime/proposal.ts

orchestration/planningMutationHandoffProjection.ts
-> planning/handoff/mutation.ts

orchestration/planningMutationProposalBridge.ts
-> planning/handoff/bridge.ts

Only perform moves that can be validated safely in this route.

If a file is too entangled, document it as deferred and keep it unchanged.

## Scope control

SR003 should be visible, but not reckless.

Prioritize the newest Context and Planning block files first:

- repo intelligence
- context engine
- context graph planning
- context acquisition projection
- context planning summary
- context memory
- planning runtime
- planning runtime projection
- planning runtime proposal
- planning mutation handoff projection
- planning mutation proposal bridge

Do not move high-risk runtime coordinator code.

Do not move ShellSessionRuntime.

Do not move SessionManager.

Do not move provider fetch/auth code.

Do not move edit/apply backend.

Do not move verification/repair execution.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- orchestration/repoIntelligence
- orchestration/contextEngine
- orchestration/contextGraphPlanning
- orchestration/contextAcquisitionProjection
- orchestration/contextPlanningSummary if present
- orchestration/contextMemory
- orchestration/groundedPlanningProjection
- orchestration/planningRuntime
- orchestration/planningRuntimeProductProjection
- orchestration/planningRuntimeProductProposal
- orchestration/planningMutationHandoffProjection
- orchestration/planningMutationProposalBridge
- runtime/loop/feature
- runtime/loop/adapter
- presentation surface consumers if CP006 sections import these types
- focused tests importing these files
- import references for selected files
- SR001 and SR002 docs if present

Use targeted repository search to find imports and test references.

Do not inspect external repositories for this route.

If Serena is unavailable, use targeted repository search and report that honestly.

## Implementation requirements

### 1. Move real implementation

Use git mv where possible.

New nested files should own real implementation.

Old orchestration files should become thin compatibility exports only.

Compatibility export files must not contain business logic.

### 2. Update internal imports

Update project-internal imports to the new short paths where safe.

Prioritize:

- tests for moved modules
- current product code
- nearby context and planning owner domains
- runtime loop feature contract imports
- product loop adapter tests
- presentation tests if CP006 facts are imported

Leave compatibility imports only where updating imports would create broad churn.

Document intentionally retained compatibility imports.

### 3. Add index exports

Add local index files where useful:

- context/index.ts
- context/discovery/index.ts
- context/acquisition/index.ts
- context/memory/index.ts
- planning/index.ts
- planning/runtime/index.ts
- planning/handoff/index.ts
- planning/grounded/index.ts

Index files should export stable local surfaces only.

Do not create giant barrels that mix unrelated domains.

### 4. Preserve behavior

No semantic edits.

No output wording changes.

No result truthfulness changes.

No provider calls.

No edit/apply behavior changes.

No verification execution changes.

No repair behavior changes.

No session schema changes.

No feature implementation.

### 5. Keep names local and short

Prefer local short names:

- scan
- ranking
- handoff
- engine
- graph
- projection
- summary
- model
- reuse
- quality
- proposal
- mutation
- bridge

Do not use route, capstone, sprint, MVP, closeout, cut-through, reference, inspired, or external project names in product file names or product content.

### 6. Avoid fake cleanliness

Do not leave two active sources of truth.

Do not move only tests while real implementation stays flat.

Do not create new wrappers with logic.

Do not create helper, utils, common, misc, shared, or support dumping grounds.

## Required tests

Run focused tests covering touched domains:

- repo intelligence tests
- context engine tests
- context graph planning tests
- context acquisition projection tests
- context planning summary tests
- context memory tests
- planning runtime tests
- planning runtime product projection tests
- planning runtime product proposal tests
- planning mutation handoff tests
- planning mutation proposal bridge tests
- product loop adapter tests
- presentation tests if imports are touched

Do not weaken tests.

Do not broad rebaseline snapshots.

## Validation

Required:

- focused tests for touched context and planning domains
- npm run build -w packages/ts-shell
- npm run verify:result-contract if presentation or result-facing output behavior is touched
- git diff --check
- git status --short --branch

Do not claim tests or build passed unless actually run.

## Architecture constraints

Hard rules:

- owner-domain-first
- visible structure cutover, not cosmetic-only rename
- no feature behavior change
- no provider calls
- no edit/apply changes
- no verification or repair execution changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no package script edits
- no build config edits
- no broad workflow coordinator rewrite
- no SessionManager rewrite
- no provider fetch or auth rewrite
- no edit/apply backend move
- no compatibility shim logic growth
- no external-origin product naming
- no route-era product naming
- no helper, utils, common, misc, shared, or support dumping ground

## Stop conditions

Stop and report PARTIAL if:

- import churn becomes too large for one route
- old orchestration compatibility exports require logic
- tests require behavior changes to pass
- result truthfulness behavior changes unexpectedly
- build config must change
- package scripts must change
- provider/session/edit/verification high-risk domains must be modified
- circular imports appear
- source ownership becomes less clear after movement
- moved files create duplicate active truth sources

## Completion criteria

SR003 is COMPLETE only if:

- targeted inspection was performed and reported
- real implementation for selected Context and Planning files moved into nested short-name owner paths
- old orchestration paths are thin compatibility exports or documented as deferred
- internal imports are updated to new paths where safe
- index exports exist where useful
- no behavior change is introduced
- focused tests pass
- build passes
- diff check passes
- status is reported
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic
- remaining structure debt is documented

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files moved
5. Files left as compatibility exports
6. Files intentionally deferred
7. Imports updated
8. Tests and validation pass or fail
9. Behavior preservation notes
10. Architecture constraints preserved
11. Stop conditions encountered if any
12. Remaining structure debt
13. Recommended next route

## Next route

After SR003 is complete, choose based on current project need:

Option A:
Return to Provider Streaming And Model Boundary implementation if PS001 audit is complete.

Option B:
Continue structure cleanup with docs/build-infrastructure/route/route-sr004-provider-tool-visible-structure-cutover.md if provider/tool structure blocks PS002.

SR004 should migrate provider metadata/request and tool policy/result/dispatch into nested short-name owner paths without changing behavior.
