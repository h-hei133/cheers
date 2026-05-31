# Structure Reorganization Feasibility Audit

## Scope

This is a docs-only audit for SR001. It evaluates whether the repository should
be rewritten, reorganized in place, or migrated through a hybrid shell. It does
not authorize product code edits, file moves, import rewrites, package script
changes, build config changes, provider calls, or a new workspace package.

## Inspection Summary

Targeted Serena inspection was available and used for owner-module orientation:

- `packages/ts-shell/src/session/SessionManager.ts` is a real domain manager
  with session lifecycle, resume, recovery, current-session, approval audit,
  transcript, and cross-session coordination methods.
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts` is an import
  hotspot and route-level coordinator for integrated flow execution and product
  loop projection.
- `packages/ts-shell/src/runtime/execution/executionService.ts` owns the
  explicit command/file execution boundary, execution authority metadata, and
  structured execution events.
- `packages/ts-shell/src/runtime/loop/agentLoopContract.ts` owns the local Agent
  Loop contract and truthfulness-preserving projection.
- `packages/ts-shell/src/planning/workflowTaskPlan.ts`,
  `packages/ts-shell/src/context/readIntentPlanning.ts`, and
  `packages/ts-shell/src/presentation/productSurface.ts` show that planning,
  context, and presentation are already distinct owner domains, even when some
  files remain large.

Targeted repository inspection found:

- Top-level packages are `packages/ts-shell`, `packages/rust-core`, and
  `packages/python-eval`, with `contracts`, `scripts`, `docs`, and
  `agent-rules` at repository root.
- `packages/ts-shell/src` already has domain folders for `runtime`, `context`,
  `planning`, `provider`, `tools`, `session`, `evidence`, `result`,
  `presentation`, `policy`, `edit`, `verification`, `repair`, `turn`,
  `resources` under runtime, and compatibility or host-facing folders such as
  `entrypoints`, `cli`, `core`, and `orchestration`.
- File counts are concentrated in `orchestration` and `core`, with targeted
  inspection showing about 585 files under `orchestration`, about 577 under
  `core`, and about 142 under `session`. Most smaller owner folders are already
  tractable.
- Tests are colocated with source files inside `packages/ts-shell/src`; this
  supports focused Vitest runs but makes large folders visually noisy.
- The largest files include `orchestration/runMvpIntegratedFlow.test.ts`,
  `cli-baseline.test.ts`, `session/SessionManager.test.ts`,
  `core/shell/sessionRuntime.test.ts`, and
  `runtime/workflowExecutionCoordinator.ts`.
- Long filenames are especially dense in
  `orchestration/patchResult` and `core/harness`, often encoding scenario,
  route, compatibility, or process history.
- Import hotspot checks found `runtime/workflowExecutionCoordinator.ts`,
  `planning/workflowTaskPlan.ts`, and `runtime/events/runtimeEventProjection.ts`
  as high fan-in/fan-out files for cross-domain coordination.
- Root package scripts are broad and historically layered, including product
  gates, route-history verifiers, real-provider opt-in gates, and release gates.
  This audit does not modify them.

Reference repositories were inspected only for structure, read-only:

- `/home/wang/projects/pi` has package-local `src`, `test`, `scripts`, and
  docs-like boundaries under packages such as `agent`, `ai`, `coding-agent`,
  and `tui`. This is useful evidence that short names can work when folder
  context is strong, but it should not be copied as a product layout.
- `/home/wang/projects/GitNexus` has a broad repository-intelligence structure,
  including `gitnexus/src/core/graph`, `core/ingestion`, `core/search`,
  `core/tree-sitter`, `storage`, `mcp`, `server`, and `types`. This supports
  the value of nested capability folders for graph/context work, but its product
  vocabulary must not be imported into this repository.

## Current Structure Inventory

### Repository Layers

| Layer | Current shape | Structural note |
| --- | --- | --- |
| Product runtime | `packages/ts-shell/src` | Primary TypeScript runtime and control plane. |
| Candidate native executor | `packages/rust-core` | Separate package; not current default execution owner. |
| Offline evaluation | `packages/python-eval` | Offline eval only. |
| Cross-runtime contracts | `contracts` | Schemas and type surfaces only when real consumers exist. |
| Root scripts | `scripts` | Mixes bootstrap, verification, route-history, real-provider smoke, and support modules. |
| Durable docs | `docs/build-infrastructure`, `agent-rules` | Active planning and rule surfaces. |
| Historical docs | `docs/dev-history`, route docs | Historical and route context; should not drive product naming. |

### Product Domains

| Domain | Current location | Current condition |
| --- | --- | --- |
| Runtime boundary | `packages/ts-shell/src/runtime` | Strong owner folder; `workflowExecutionCoordinator.ts` is broad. |
| Runtime loop | `packages/ts-shell/src/runtime/loop` | Strong contract/projection owner; should remain cautious. |
| Execution | `packages/ts-shell/src/runtime/execution` | Clear side-effect boundary. |
| Events | `packages/ts-shell/src/runtime/events` | Clear event projection owner; imports are broad. |
| Turn | `packages/ts-shell/src/turn` | Clear owner folder with focused files. |
| Context | `packages/ts-shell/src/context` plus older `orchestration/context*` | Split between newer owner folder and historical orchestration context files. |
| Planning | `packages/ts-shell/src/planning` plus older orchestration planning files | New owner exists; older process-heavy names remain. |
| Provider | `packages/ts-shell/src/provider` plus CLI/core provider surfaces | Clear registry/model boundary, with host surfaces elsewhere. |
| Tools | `packages/ts-shell/src/tools` plus `core/tools` | Product tool contracts exist; core registry/runtime remains host-coupled. |
| Session | `packages/ts-shell/src/session` | Real domain manager plus many extracted subdomains. |
| Evidence | `packages/ts-shell/src/evidence` | Clear owner with projection and compatibility subfolders. |
| Result | `packages/ts-shell/src/result` | Clear owner with terminal subfolder. |
| Presentation | `packages/ts-shell/src/presentation` | Small and clear, but product surface file is large. |
| Policy | `packages/ts-shell/src/policy` | Small and clear. |
| Resources | `packages/ts-shell/src/runtime/resources` | Clear runtime metadata owner. |
| Extensions | `packages/ts-shell/src/runtime/extensions` | Clear lifecycle/hook contract owner. |
| Verification | `packages/ts-shell/src/verification` | Clear owner with some route-era names. |
| Repair | `packages/ts-shell/src/repair` | Clear owner with focused files. |
| Edit | `packages/ts-shell/src/edit`, `edit/result`, `edit/multifile` | Current owner exists; old patch-result routes remain elsewhere. |
| Compatibility shims | `entrypoints`, `orchestration/runMvpIntegratedFlow.ts`, selected legacy route files | Need freeze-and-delegate strategy. |

## Structural Pain Classification

| Pain | Severity | Evidence | Why it matters |
| --- | --- | --- | --- |
| `orchestration` and `core` file-count concentration | Slows development, context-window risk | Hundreds of files in each folder | Agents and humans must scan too much unrelated context. |
| Long scenario and process filenames | Cosmetic to context-window risk | Many `singleFileApplyPatch...`, `browser...ScenarioExamples`, and `...Route...` names | Long names are not inherently wrong, but dense clusters hide owner boundaries. |
| Route/process vocabulary in product filenames | Historical artifact, compatibility debt | `runMvpIntegratedFlow`, `*Route`, `*Seam`, closeout/route names | Makes product modules look like route artifacts and obscures stable ownership. |
| Large coordinator files | Import graph risk | `workflowExecutionCoordinator.ts`, `workflowTaskPlan.ts`, event projection, product surface | Cross-domain import concentration increases migration risk. |
| Tests mixed with source in large folders | Test ownership risk, context-window risk | Hundreds of colocated tests in `orchestration` and `core` | Colocation helps focused runs but makes broad folders noisy. |
| Compatibility and rightful managers not always distinguished | Compatibility debt | `runMvpIntegratedFlow.ts` is compatibility; `SessionManager.ts` is a real manager | Treating all large files as shims would damage domain ownership. |
| Root script sprawl | Slows development | Many root scripts and route-history verifiers | Harder to discover the right validation gate, but not a product blocker. |
| Existing owner domains are partially duplicated by old orchestration files | Import graph risk | Context/planning/edit/verification owners exist while older orchestration files remain | Future behavior can accidentally land in old buckets. |

No inspected pain proves that current structure blocks product development. The
dominant problems are discoverability, import churn risk, compatibility debt,
and context efficiency.

## Rewrite Versus Reorganize Versus Hybrid

| Option | Benefit | Cost and risk | Rollback | Verdict |
| --- | --- | --- | --- | --- |
| A: In-place reorganization | Preserves current tests, evidence/truthfulness rules, Agent Loop contract, and provider/session/result behavior; allows focused migrations. | Requires discipline to avoid endless compatibility layers; import churn must be phased. | Revert one migration route at a time while old exports remain. | Recommended. |
| B: New clean project rewrite | Cleanest tree and naming from day one. | Highest risk of losing evidence boundaries, false-success discipline, session behavior, route-history validation knowledge, and test parity; likely duplicates product code. | Old repo can be oracle, but parity gap would be large. | Reject unless structure begins blocking product development. |
| C: Hybrid shell | Can introduce a clean future-facing module shell while keeping old behavior stable. | Risks two truth sources if old and new shells both implement behavior; can become a hidden rewrite. | Keep old source authoritative and remove shell if it creates duplication. | Use only as a limited tactic inside in-place migration, not as the primary strategy. |

## Recommendation

Choose Option A: in-place reorganization with limited hybrid tactics.

This is simpler and more effective because the current repository already owns
valuable behavior: the Agent Loop contract, Context and Planning block,
ExecutionService boundary, provider/tool/session/result/presentation domains,
focused tests, and evidence/truthfulness semantics. Rewriting would spend most
of its effort recreating proven contracts and tests while increasing false
success and provider/session regression risk.

The right migration is not aesthetic cleanup. It is a sequence of owner-domain
migrations that:

- freezes compatibility shims,
- moves only concrete subdomain implementation details,
- preserves old import paths through thin exports during transition,
- validates each domain with focused tests and build gates,
- avoids creating a parallel truth source.

## Decision Criteria

Rewrite becomes justified only if all of these become true:

- current structure demonstrably blocks product development,
- migration cost exceeds rebuilding cost,
- evidence and result truthfulness contracts can be preserved,
- feature parity has a concrete migration plan,
- the old project remains available as an oracle,
- a product freeze is acceptable.

In-place reorganization is justified now because:

- current behavior is valuable and test-backed,
- most pain is structure, naming, and context efficiency,
- owner domains already exist,
- compatibility exports can protect imports,
- migration can happen one domain at a time.

Hybrid tactics are justified only when:

- a new internal folder shell absorbs future work without duplicating behavior,
- the old public path delegates to the new owner,
- the target owner remains authoritative,
- the route deletes or freezes compatibility growth instead of expanding it.

## Risks

- Moving a high-fan-in coordinator too early could break the product loop.
- Treating `SessionManager.ts` as a hollow facade would remove rightful session
  lifecycle coordination from its owner.
- Moving edit/result code out of old `patchResult` routes without a compatibility
  plan could break guarded write behavior.
- Moving tests separately from source could reduce focused validation fidelity.
- Updating imports in bulk could create hard-to-review churn with no behavior
  signal.
- A new package or project shell could create two sources of truth.

## Reference Observations

Reference repositories support structural principles, not product decisions:

- Pi shows package-local `src`, `test`, `scripts`, and examples/docs boundaries.
  It supports short local names under meaningful folders, but its package layout
  should not be copied wholesale.
- GitNexus shows nested capability folders for graph, ingestion, search, server,
  storage, and MCP surfaces. It supports nested domain boundaries for repository
  intelligence, but exact useful parts must be determined by targeted inspection
  for each future task.

When a reference repository groups behavior differently from this repository,
preserve the target repository's post-reset owner module unless current code
inspection proves that the owner is wrong.
