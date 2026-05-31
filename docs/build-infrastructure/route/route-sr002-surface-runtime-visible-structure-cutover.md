# Structure Route SR002: Surface Runtime Visible Structure Cutover

## Goal

Implement the first visible structure cutover after SR001.

SR001 concluded that the project should not be rewritten. It should be reorganized in place with limited hybrid tactics.

SR002 must prove that the repository can become visibly cleaner without changing product behavior.

This route should migrate a low-risk but visible module group into a cleaner multi-level short-name structure:

- presentation
- runtime/events
- runtime/loop
- runtime/resources

Expected final status: COMPLETE.

This is a structure route, not a feature route.

## Why this route exists

The project still looks messy even after architecture cleanup because many product files remain long, flat, and process-like.

Examples of current style that should be improved over time:

- productSurface
- terminalMessageRenderer
- runtimeEventProjection
- jsonEventStream
- agentLoopContract
- trajectoryProjection
- staticResourceDescriptor
- staticResourceProjection
- packageInventory

The goal is not to hide old files behind wrappers forever. The goal is visible structure cutover:

- move real implementation into clearer nested owner folders
- use short local file names
- keep old paths only as thin compatibility exports where necessary
- update internal imports to new paths where safe
- prove tests and build still pass

## Target domains

This route may touch only these owner domains unless a test import requires a narrow update:

- presentation
- runtime/events
- runtime/loop
- runtime/resources
- tests importing those modules

Do not touch provider fetch, SessionManager, workflowExecutionCoordinator, edit/apply, verification/repair execution, CLI behavior, result truthfulness, or package scripts.

## Target structure

Preferred target layout:

packages/ts-shell/src/presentation/
  index.ts
  surface/
    model.ts
    sections.ts
    summary.ts if needed
  terminal/
    renderer.ts

packages/ts-shell/src/runtime/events/
  index.ts
  model.ts
  projection.ts
  stream.ts

packages/ts-shell/src/runtime/loop/
  index.ts
  contract.ts
  feature.ts
  trajectory.ts
  infrastructure.ts
  adapter.ts if needed

packages/ts-shell/src/runtime/resources/
  index.ts
  descriptor.ts
  projection.ts
  inventory.ts
  package.ts if needed

Use the exact file split only where it matches current responsibilities.

Do not over-split just to satisfy the layout.

## Existing file treatment

Existing long-name product files in these domains should be handled with this policy:

1. If safe, move the real implementation to the new short-name path.
2. Replace the old file with a thin compatibility export.
3. Add a short compatibility comment only if needed.
4. Update internal imports to new short-name paths where safe.
5. Do not keep duplicate implementations.
6. Do not let compatibility files grow logic.

Examples:

presentation/productSurface.ts
-> presentation/surface/model.ts
-> old file re-exports from new path

presentation/terminalMessageRenderer.ts
-> presentation/terminal/renderer.ts
-> old file re-exports from new path

runtime/events/runtimeEventProjection.ts
-> runtime/events/projection.ts
-> old file re-exports from new path

runtime/events/jsonEventStream.ts
-> runtime/events/stream.ts
-> old file re-exports from new path

runtime/loop/agentLoopContract.ts
-> runtime/loop/contract.ts
-> old file re-exports from new path

runtime/loop/trajectoryProjection.ts
-> runtime/loop/trajectory.ts
-> old file re-exports from new path

runtime/loop/infrastructureMap.ts
-> runtime/loop/infrastructure.ts
-> old file re-exports from new path

runtime/loop/featureContract.ts
-> runtime/loop/feature.ts
-> old file re-exports from new path

runtime/resources/staticResourceDescriptor.ts
-> runtime/resources/descriptor.ts
-> old file re-exports from new path

runtime/resources/staticResourceProjection.ts
-> runtime/resources/projection.ts
-> old file re-exports from new path

runtime/resources/packageInventory.ts
-> runtime/resources/inventory.ts
-> old file re-exports from new path

Only perform these moves if the current files exist and imports can be updated safely.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- presentation/productSurface
- presentation/terminalMessageRenderer
- presentation tests
- runtime/events/runtimeEventProjection
- runtime/events/jsonEventStream
- runtime/events tests
- runtime/loop/agentLoopContract
- runtime/loop/trajectoryProjection
- runtime/loop/infrastructureMap
- runtime/loop/featureContract
- runtime/loop/productLoopAdapter
- runtime/loop tests
- runtime/resources/staticResourceDescriptor
- runtime/resources/staticResourceProjection
- runtime/resources/packageInventory
- runtime/resources tests
- import references for these files
- SR001 docs if present

Use repository search to find imports and test references.

Do not inspect external repositories for this route.

If Serena is unavailable, use targeted repository search and report that honestly.

## Implementation requirements

### 1. Move real implementation

Use git mv where possible.

The new nested files should own the real implementation.

Old paths should become thin compatibility exports only.

Compatibility export files must not contain business logic.

### 2. Update internal imports

Update project-internal imports to the new short paths where safe.

Do not update every historical compatibility import if doing so creates large churn.

Prioritize:

- tests for touched modules
- current product code
- nearby owner domains
- new code paths

Leave old paths only for compatibility, not primary internal usage.

### 3. Add index exports

Add local index files where they improve import clarity.

Index files should only export stable local module surfaces.

Do not create giant barrel files that mix unrelated domains.

### 4. Preserve behavior

This route must not change runtime behavior.

No output wording changes unless required by import movement.

No result truthfulness changes.

No provider/tool/session/edit/verification behavior changes.

No feature implementation.

### 5. Keep names local and short

Prefer local short filenames such as:

- model
- sections
- renderer
- projection
- stream
- contract
- feature
- trajectory
- infrastructure
- descriptor
- inventory

Do not use route, capstone, sprint, MVP, closeout, cut-through, reference, inspired, or external project names in product file names or product content.

### 6. Document compatibility policy

If old files remain, they must be clearly treated as compatibility surfaces.

Do not leave old paths looking like primary implementation files.

## Required tests

Add tests only if imports or exports require small coverage updates.

Run focused tests covering touched domains:

- presentation tests
- runtime events tests
- runtime loop tests
- runtime resources tests
- core shell or product surface tests if imports are touched
- product loop adapter tests if feature contract imports are touched

Do not weaken tests.

Do not broad rebaseline snapshots.

## Validation

Required:

- focused tests for touched domains
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
- no verification/repair execution changes
- no session schema migration
- no SDK/RPC/TUI/MCP/browser/plugin/package-loading surfaces
- no new dependencies
- no package script edits
- no build config edits
- no broad workflow coordinator rewrite
- no SessionManager rewrite
- no compatibility shim logic growth
- no external-origin product naming
- no route-era product naming
- no helper/utils/common/misc dumping ground

## Stop conditions

Stop and report PARTIAL if:

- import churn becomes too large for one route
- compatibility exports require business logic
- tests require behavior changes to pass
- result truthfulness behavior changes unexpectedly
- build config must change
- package scripts must change
- provider/session/edit/verification high-risk domains must be modified
- circular imports appear

## Completion criteria

SR002 is COMPLETE only if:

- targeted inspection was performed and reported
- real implementation for selected surface/runtime files moved into nested short-name owner paths
- old long-name paths are thin compatibility exports or documented as deferred
- internal imports are updated to new paths where safe
- index exports exist where useful
- no behavior change is introduced
- focused tests pass
- build passes
- diff check passes
- status is reported
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files moved
5. Files left as compatibility exports
6. Imports updated
7. Tests and validation pass or fail
8. Behavior preservation notes
9. Architecture constraints preserved
10. Stop conditions encountered if any
11. Remaining structure debt
12. Recommended next route

## Next route

After SR002 is complete, continue with either:

docs/build-infrastructure/route/route-sr003-planning-context-visible-structure-cutover.md

or return to the Provider Streaming block if PS001 audit says structure is no longer blocking.

SR003 should migrate planning and context into nested short-name owner paths without changing behavior.
