# Structure Route SR005: Visible Tree Pressure And Compatibility Isolation

## Goal

Implement the next structure route after SR004.

SR002 through SR004 moved real implementations into cleaner nested owner paths, but the repository may still look visually messy because:

- old compatibility exports remain in primary directories
- many tests still live under old broad folders
- some directories still have too many direct files
- long-name compatibility files still appear in the main tree
- orchestration and core still look crowded
- structure improvements are not measured by before and after tree pressure

SR005 must reduce visible tree pressure, not just move implementations.

Expected final status: COMPLETE.

This is a structure route, not a feature route.

## Core objective

Make the repository visibly cleaner.

This route must produce a measurable before and after tree pressure summary.

The route should reduce visual pressure in the current product tree by:

- identifying crowded directories
- identifying long-name files
- identifying compatibility-only files
- relocating tests that can safely move beside new owner domains
- isolating compatibility surfaces where feasible
- removing or documenting compatibility files that cannot safely move
- updating internal imports away from compatibility paths
- preserving behavior

## Important reality constraint

Old import paths cannot be deleted unless all internal imports are updated and no required compatibility surface depends on them.

If deleting or relocating a compatibility export would break existing imports or public compatibility, do not delete it.

Instead:

- update internal imports away from it
- mark it as compatibility-only
- document deletion criteria
- reduce its visibility where safely possible
- move test files and active implementation first

Do not fake cleanliness by breaking compatibility.

## Target domains

Prioritize domains already cut over in SR002 to SR004:

- presentation
- runtime/events
- runtime/loop
- runtime/resources
- context
- planning
- provider
- tools
- runtime/execution

Also audit but do not aggressively rewrite:

- orchestration
- core
- session
- result
- evidence
- verification
- repair
- edit

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- current package tree under packages/ts-shell/src
- direct file counts by directory
- longest file names
- compatibility-only export files from SR002 to SR004
- tests still located under old broad folders
- imports that still point to compatibility paths
- orchestration root contents
- core root contents
- presentation tree
- runtime tree
- context tree
- planning tree
- provider tree
- tools tree
- runtime/execution tree
- SR001 to SR004 docs if present

Use targeted repository search for imports.

Do not inspect external repositories.

If Serena is unavailable, use targeted repository search and report that honestly.

## Required measurements

Before editing, compute a tree pressure snapshot.

The snapshot should include:

- top crowded directories by direct file count
- direct file count for orchestration
- direct file count for core if applicable
- direct file count for presentation root
- direct file count for runtime/events root
- direct file count for runtime/loop root
- direct file count for runtime/resources root
- direct file count for context root and subfolders
- direct file count for planning root and subfolders
- direct file count for provider root and subfolders
- direct file count for tools root and subfolders
- number of compatibility-only export files
- number of old long-name files still visible
- number of tests still in old broad folders for moved implementations
- internal imports still using old compatibility paths

After editing, compute the same snapshot.

The final report must include before and after comparison.

## Allowed work

### 1. Test file relocation

Move tests for already-moved implementations beside their new owner files where safe.

Examples:

orchestration/contextEngine.test.ts
-> context/acquisition/engine.test.ts

orchestration/contextGraphPlanning.test.ts
-> context/acquisition/graph.test.ts

orchestration/contextPlanningSummary.test.ts
-> context/acquisition/summary.test.ts

orchestration/contextMemory.test.ts
-> context/memory/model.test.ts

orchestration/planningRuntime.test.ts
-> planning/runtime/engine.test.ts

orchestration/planningRuntimeProductProjection.test.ts
-> planning/runtime/projection.test.ts

orchestration/planningRuntimeProductProposal.test.ts
-> planning/runtime/proposal.test.ts

orchestration/planningMutationHandoffProjection.test.ts
-> planning/handoff/mutation.test.ts

orchestration/planningMutationProposalBridge.test.ts
-> planning/handoff/bridge.test.ts

presentation/productSurface.test.ts
-> presentation/surface/model.test.ts

presentation/terminalMessageRenderer.test.ts
-> presentation/terminal/renderer.test.ts

runtime/events/runtimeEventProjection.test.ts
-> runtime/events/projection.test.ts

runtime/events/jsonEventStream.test.ts
-> runtime/events/stream.test.ts

runtime/loop/agentLoopContract.test.ts
-> runtime/loop/contract.test.ts

runtime/loop/trajectoryProjection.test.ts
-> runtime/loop/trajectory.test.ts

runtime/resources/staticResourceProjection.test.ts
-> runtime/resources/projection.test.ts

runtime/resources/packageInventory.test.ts
-> runtime/resources/inventory.test.ts

Only move tests that can be updated without behavior changes.

### 2. Internal import cleanup

Update internal imports away from old compatibility paths where safe.

Prioritize:

- tests
- current product code in touched owner domains
- nearby consumers
- product surface consumers
- runtime loop consumers
- provider and tools consumers

Do not force import rewrites in high-risk files if it creates broad churn.

Document retained compatibility imports.

### 3. Compatibility isolation policy

Classify all compatibility-only files into:

- safe to keep temporarily in old location
- safe to move to compat only if no imports depend on old path
- unsafe to move because old path compatibility is still required
- candidate for deletion after internal imports reach zero

If a compatibility file can be safely removed because no imports depend on it and no compatibility requirement is documented, remove it.

If a compatibility file must remain, add a short comment only if needed and make sure it contains no business logic.

Do not create a fake compat directory that breaks old imports.

### 4. Crowded folder pressure reduction

Reduce direct file count where safe by moving tests and active files into subfolders.

Priority folders:

- orchestration
- presentation root
- runtime/events root
- runtime/loop root
- runtime/resources root
- provider root
- tools root

Do not touch high-risk behavior files solely to reduce file count.

### 5. Structure pressure document

Create or update:

docs/build-infrastructure/structure-tree-pressure-report.md

It must include:

- before snapshot
- after snapshot
- directories improved
- directories still crowded
- compatibility files kept
- compatibility files removed or moved if any
- tests relocated
- imports updated
- remaining old paths
- deletion criteria for compatibility exports
- next structure target if any

## Forbidden work

Do not:

- implement features
- change behavior
- change output semantics
- change result truthfulness
- call providers
- change provider opt-in
- change provider config loading
- change provider auth
- change fallback behavior
- change tool execution
- change command allowlists
- change edit or apply behavior
- change verification or repair execution
- migrate session schema
- rewrite workflow coordinator
- rewrite SessionManager
- move provider fetch behavior if it changes semantics
- move core tool runtime or registry if authority behavior changes
- edit package scripts
- edit build config
- add dependencies
- add workspace packages
- create route runners
- create verify scripts
- create JSON reports
- create helper, utils, common, misc, shared, or support dumping grounds

## Naming rules

New product file names must be short and local.

Allowed examples:

- model
- renderer
- projection
- stream
- contract
- feature
- trajectory
- infrastructure
- descriptor
- inventory
- engine
- graph
- summary
- mutation
- bridge
- scan
- split
- dispatcher
- service
- receipt
- error

Do not use:

- route
- reference
- learning
- inspired
- capstone
- sprint
- closeout
- cut-through
- MVP
- external project names
- process-origin words

Commit messages must follow the same rule.

## Commit policy

Committing is allowed after validation passes.

Codex may choose the commit message.

The commit message must not contain:

- route
- reference
- learning
- external project names
- sprint
- capstone
- closeout
- cut-through
- MVP

Do not push.

Do not commit failing states.

## Required tests

Run focused tests for any moved tests and touched domains.

Likely suites:

- presentation tests
- runtime events tests
- runtime loop tests
- runtime resources tests
- context tests
- planning tests
- provider tests if provider imports are touched
- tools tests if tools imports are touched
- runtime execution tests if execution imports are touched
- product surface and product loop adapter tests if imports are touched

Do not weaken tests.

Do not broad rebaseline.

## Validation

Required:

- focused tests for touched domains
- npm run build -w packages/ts-shell
- npm run verify:result-contract if presentation, result-facing output, or terminal behavior is touched
- git diff --check
- git status --short --branch
- git status after optional commit

Do not claim tests or build passed unless actually run.

## Stop conditions

Stop and report PARTIAL if:

- moving compatibility exports would break imports
- test relocation creates broad churn
- import rewrites become too large
- circular imports appear
- compatibility files require logic
- tests require behavior changes to pass
- result truthfulness changes unexpectedly
- build config must change
- package scripts must change
- high-risk domains must be modified
- tree pressure does not improve measurably

## Completion criteria

SR005 is COMPLETE only if:

- targeted inspection was performed and reported
- before tree pressure snapshot was recorded
- after tree pressure snapshot was recorded
- at least one crowded visible area was measurably improved
- tests for moved modules were relocated where safe
- internal imports were updated away from compatibility paths where safe
- compatibility-only files were classified
- no behavior change was introduced
- focused tests passed
- build passed
- diff check passed
- status was reported
- optional commit was created only after validation passed
- commit message follows the naming policy if committed
- structure-tree-pressure-report.md was created or updated

## Final report

Include:

1. Final status
2. Inspection summary
3. Before tree pressure snapshot
4. After tree pressure snapshot
5. Directories improved
6. Tests relocated
7. Compatibility files kept, removed, or deferred
8. Imports updated
9. Validation pass or fail
10. Optional commit hash and commit message if committed
11. Behavior preservation notes
12. Stop conditions encountered if any
13. Remaining visible structure debt
14. Recommended next step

## Next step

After SR005 is complete, decide based on the pressure report.

If visible pressure is now acceptable for provider work, return to Provider Streaming And Model Boundary implementation.

If visible pressure is still dominated by tests or compatibility files, do one more tightly scoped structure cleanup.

Avoid making structure cleanup an endless mainline.
