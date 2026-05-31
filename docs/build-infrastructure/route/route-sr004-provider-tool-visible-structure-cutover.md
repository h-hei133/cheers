# Structure Route SR004: Provider Tool Visible Structure Cutover

## Goal

Implement the next visible structure cutover after SR003.

SR002 cleaned presentation, runtime events, runtime loop, and runtime resources.

SR003 cleaned Context and Planning implementation paths.

SR004 must now clean the provider and tool-adjacent structure before the Provider Streaming and Model Boundary implementation block continues.

Target domains:

- provider registry metadata
- provider readiness metadata
- provider request and prompt preparation surfaces if low risk
- provider failure classification surfaces if low risk
- tool interception
- tool result split
- tool dispatch boundary
- core tool registry only where needed for imports
- execution receipt and ExecutionService adjacency only where needed for imports

Expected final status: COMPLETE.

This is a structure cutover, not a feature route.

It must not change provider behavior, provider opt-in gates, provider config loading, live provider execution, fallback execution, tool execution, command allowlists, edit/apply behavior, verification/repair behavior, session schema, product loop behavior, package scripts, or build config.

## Why this route exists

Provider Streaming implementation is the next major capability block, but the current provider and tool files still include long or flat names and mixed adjacency.

If Provider Streaming is implemented before this cleanup, new code will likely harden old structure.

SR004 should make provider and tool surfaces look like product-owned modules:

- provider registry
- provider request
- provider readiness
- provider failure
- tool policy
- tool result
- tool dispatch
- execution receipt adjacency

The goal is visible structure improvement, not behavioral change.

## Target structure

Preferred target layout:

packages/ts-shell/src/provider/
  index.ts
  registry/
    provider.ts
    model.ts
    auth.ts if justified
    failure.ts if justified
    fallback.ts if justified
  request/
    prompt.ts
    draft.ts
    readiness.ts
    fetch.ts only if safe and low churn
  response/
    classification.ts if existing logic fits
    boundary.ts if existing logic fits

packages/ts-shell/src/tools/
  index.ts
  policy/
    before.ts
    after.ts
    interception.ts
  result/
    content.ts
    details.ts
    split.ts
  dispatch/
    runtime.ts
    plan.ts if existing logic fits
    dispatcher.ts

packages/ts-shell/src/runtime/execution/
  index.ts
  service.ts if safe
  receipt.ts if safe
  error.ts if safe

Use the exact split only where current responsibilities justify it.

Do not over-split just to satisfy the layout.

## Existing file treatment

Existing long-name product files in selected domains should follow this policy:

1. If safe, move the real implementation to the new short-name owner path.
2. Replace the old file with a thin compatibility export.
3. Add a short compatibility comment only if needed.
4. Update project-internal imports to new short paths where safe.
5. Do not keep duplicate implementations.
6. Do not let compatibility files grow logic.

Expected moves if current files exist and are safe:

provider/providerRegistry.ts
-> provider/registry/provider.ts or provider/registry/model.ts if split is safe

core/shell/providerReadiness.ts
-> provider/request/readiness.ts if it is truly provider readiness metadata and not shell-owned display

provider/contextAwareProviderPrompt.ts
-> provider/request/prompt.ts

provider/providerDraftStage.ts
-> provider/request/draft.ts

provider/providerFetch.ts
-> provider/request/fetch.ts only if moving does not touch config, auth, or live execution behavior

provider/providerReadiness.ts
-> provider/request/readiness.ts if present and safe

tools/interception.ts
-> tools/policy/interception.ts

tools/resultSplit.ts
-> tools/result/split.ts

tools/dispatcher.ts
-> tools/dispatch/dispatcher.ts if safe

core/tools/runtime.ts
-> tools/dispatch/runtime.ts only if this is not a risky core ownership move

core/tools/registry.ts
-> tools/dispatch/registry.ts only if safe; otherwise leave deferred

runtime/execution/executionService.ts
-> runtime/execution/service.ts

runtime/execution/executionReceipt.ts
-> runtime/execution/receipt.ts

runtime/execution/executionErrorTaxonomy.ts
-> runtime/execution/error.ts

Only perform moves that can be validated safely in this route.

If a file is too entangled, document it as deferred and keep it unchanged.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- provider/providerRegistry
- provider/contextAwareProviderPrompt
- provider/providerDraftStage
- provider/providerFetch
- provider/providerReadiness if present
- core/shell/providerReadiness
- provider tests
- tools/interception
- tools/resultSplit
- tools/dispatcher
- core/tools/runtime
- core/tools/registry
- tools tests
- runtime/execution/executionService
- runtime/execution/executionReceipt
- runtime/execution/executionErrorTaxonomy
- execution tests
- provider streaming audit docs if present
- SR001 to SR003 docs if present
- import references for selected files

Use targeted repository search to find imports and test references.

Do not inspect external repositories for this route.

If Serena is unavailable, use targeted repository search and report that honestly.

## Implementation requirements

### 1. Move real implementation

Use git mv where possible.

New nested files should own real implementation.

Old long-name paths should become thin compatibility exports only.

Compatibility export files must not contain business logic.

### 2. Update internal imports

Update project-internal imports to the new short paths where safe.

Prioritize:

- tests for moved modules
- current product code
- nearby provider and tool owner domains
- runtime loop and product surface imports if they consume provider/tool metadata
- provider streaming planning code if present

Leave compatibility imports only where updating imports would create broad churn.

Document intentionally retained compatibility imports.

### 3. Add index exports

Add local index files where useful:

- provider/index.ts
- provider/registry/index.ts
- provider/request/index.ts
- provider/response/index.ts if created
- tools/index.ts
- tools/policy/index.ts
- tools/result/index.ts
- tools/dispatch/index.ts
- runtime/execution/index.ts

Index files should export stable local module surfaces only.

Do not create giant barrels that mix unrelated domains.

### 4. Preserve behavior

No semantic edits.

No output wording changes.

No result truthfulness changes.

No provider opt-in changes.

No provider config loading changes.

No live provider calls.

No fallback behavior changes.

No tool execution behavior changes.

No command allowlist changes.

No feature implementation.

### 5. Keep names local and short

Prefer local short names:

- provider
- model
- auth
- failure
- fallback
- prompt
- draft
- readiness
- fetch
- classification
- boundary
- interception
- before
- after
- split
- content
- details
- dispatcher
- runtime
- service
- receipt
- error

Do not use route, capstone, sprint, MVP, closeout, cut-through, reference, inspired, or external project names in product file names or product content.

### 6. Commit policy

Committing is allowed after validation passes.

Use a concise commit message chosen by Codex.

The commit message must not contain:

- route
- reference
- learning
- external repository names
- process words such as sprint, capstone, closeout, cut-through, MVP

Good examples:

- organize provider and tool modules
- reorganize provider tool boundaries
- clean provider tool structure

Do not push.

Do not commit failing states.

## Required tests

Run focused tests covering touched domains:

- provider registry tests
- provider readiness tests
- provider request or prompt tests if touched
- provider fetch tests only if fetch is moved
- tool interception tests
- tool result split tests
- tool dispatcher tests
- core tool tests if touched
- execution service tests
- execution receipt tests
- runtime event tests if imports are touched
- product surface tests if imports are touched

Do not weaken tests.

Do not broad rebaseline snapshots.

## Validation

Required:

- focused tests for touched provider/tool/execution domains
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result-facing output behavior is touched
- git diff --check
- git status --short --branch
- git status after optional commit

Do not claim tests or build passed unless actually run.

## Architecture constraints

Hard rules:

- owner-domain-first
- visible structure cutover, not cosmetic-only rename
- no feature behavior change
- no provider calls
- no provider default enablement
- no provider config or auth behavior change
- no fallback execution change
- no tool execution behavior change
- no command allowlist broadening
- no edit/apply changes
- no verification or repair execution changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no package script edits
- no build config edits
- no broad workflow coordinator rewrite
- no SessionManager rewrite
- no edit/apply backend move
- no compatibility shim logic growth
- no external-origin product naming
- no route-era product naming
- no helper, utils, common, misc, shared, or support dumping ground

## Stop conditions

Stop and report PARTIAL if:

- import churn becomes too large for one route
- old compatibility exports require logic
- tests require behavior changes to pass
- result truthfulness behavior changes unexpectedly
- provider config or auth behavior would change
- live provider execution would be needed
- build config must change
- package scripts must change
- provider/session/edit/verification high-risk domains must be modified
- circular imports appear
- source ownership becomes less clear after movement
- moved files create duplicate active truth sources

## Completion criteria

SR004 is COMPLETE only if:

- targeted inspection was performed and reported
- real implementation for selected provider/tool/execution files moved into nested short-name owner paths
- old long-name paths are thin compatibility exports or documented as deferred
- internal imports are updated to new paths where safe
- index exports exist where useful
- no behavior change is introduced
- focused tests pass
- build passes
- diff check passes
- status is reported
- optional commit is created only after validation passes
- commit message follows the naming policy if committed
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
9. Optional commit hash and commit message if committed
10. Behavior preservation notes
11. Architecture constraints preserved
12. Stop conditions encountered if any
13. Remaining structure debt
14. Recommended next route

## Next route

After SR004 is complete, choose based on current project need:

Option A:
Return to Provider Streaming And Model Boundary implementation if the provider path is now clean enough.

Option B:
Continue structure cleanup with a session result evidence structure cutover only if those domains block the next product capability.

Avoid making structure cleanup an endless mainline.
