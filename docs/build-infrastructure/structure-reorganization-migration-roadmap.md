# Structure Reorganization Migration Roadmap

## Migration Principle

Migrate in place, one owner domain at a time. The goal is better ownership,
reviewability, and Codex context efficiency without changing runtime behavior.
Each route must be reversible, focused, and validated against the behavior it
could affect.

## Phase 0: Freeze Compatibility Growth

Before moving files:

- Identify compatibility paths such as `entrypoints/cli.tsx`,
  `orchestration/runMvpIntegratedFlow.ts`, and legacy route/process files.
- Document which paths are executable entrypoints, compatibility exports, or
  rightful domain managers.
- Forbid new behavior in compatibility shims.
- Keep product runtime forbidden from importing docs, scripts, dev-history, or
  route reports.
- Confirm current owner modules before moving implementation.

Validation:

- `git diff --check`
- `git status --short --branch`
- No build/tests are required for docs-only freeze documentation.

## Phase 1: Establish Owner-Domain Skeletons

Add only internal folder structure and `index.ts` exports when a specific
migration route needs them. Do not add a new package, path alias, package script,
or build config.

Preferred skeleton rules:

- Use domain folders already present under `packages/ts-shell/src`.
- Add subfolders only when moving concrete implementation details.
- Keep old files as thin delegates during transition.
- Keep tests with the domain they prove.

Validation:

- TypeScript build for any export/import change.
- Focused tests for the touched domain.
- `git diff --check`.
- `git status --short --branch`.

## Phase 2: First Implementation Candidate

Recommended first migration candidate: `presentation`.

Why:

- It is small: current inspection found only `productSurface.ts`,
  `productSurface.test.ts`, and `terminalMessageRenderer.ts`.
- It has clear fact-consumer boundaries: presentation renders or projects facts
  but must not create runtime truth.
- It exercises the naming pattern safely by splitting a large file into local
  short names such as `surface/model.ts`, `surface/sections.ts`, and
  `terminal/renderer.ts`.
- It can be validated with focused presentation tests and result-contract gates
  only if output/result semantics are touched.

Do not change output semantics in the first migration. Move shape only, preserve
old exports, and keep tests equivalent.

Candidate route title:

```text
Presentation Domain Layout Migration
```

Route constraints:

- no behavior change,
- no terminal success semantics change,
- no result truthfulness change,
- old import paths remain compatible,
- focused presentation tests must pass,
- build must pass if imports are rewritten.

## Phase 3: Low-Risk Follow-Up Candidates

After presentation proves the pattern, consider:

1. `runtime/resources`
   - Clear metadata owner.
   - Good candidate for `descriptor.ts`, `projection.ts`, and `trust.ts`.
   - Avoid dynamic resource loading.

2. `provider/providerRegistry.ts`
   - Clear registry owner.
   - Keep provider calls and auth defaults unchanged.
   - Preserve not-proven provider capability semantics.

3. `runtime/events`
   - Clear owner with high import usage.
   - Migrate only after import strategy is proven.
   - Keep event serialization compatibility.

4. `runtime/loop`
   - Valuable contract owner.
   - Delay until after smaller migrations because Agent Loop semantics are
     central to truthfulness.

5. Context and planning summaries
   - Move older orchestration context/planning helpers only when there is a
     concrete owner-domain target.
   - Preserve Context and Planning block semantics.

## Delayed High-Risk Domains

Delay these until several low-risk migrations have passed:

- `session/SessionManager.ts`
  - It may retain real session lifecycle coordination, public API compatibility,
    dependency assembly, transaction ordering, and cross-session coordination.
  - Move only concrete subdomain implementation details to existing session
    subfolders.

- `runtime/workflowExecutionCoordinator.ts`
  - It is an import hotspot and product-loop coordinator.
  - Move only after runtime loop, events, result, session, and presentation
    dependencies are stable.

- Provider fetch/auth surfaces
  - Provider/auth core and defaults require explicit task scope.
  - Live provider behavior must remain opt-in and isolated.

- Edit/apply backend and `orchestration/patchResult`
  - Current owners are `edit`, `edit/result`, `edit/multifile`,
    `verification`, `repair`, `evidence`, `result`, and `policy`.
  - Use `orchestration/patchResult` only for legacy compatibility or justified
    route-level coordination while migrating.

- Verification/repair execution
  - These interact with command execution, repair handoff, and truthfulness
    claims.
  - Require focused tests and result/evidence gates.

## Validation Gates For Future Routes

Each implementation migration route must choose validation based on touched
surfaces:

| Touched surface | Required validation |
| --- | --- |
| Any TypeScript import/export move | `npm run build -w packages/ts-shell` or an equivalent focused TypeScript build gate |
| Domain behavior | Focused Vitest files for that domain |
| Result or output semantics | `npm run verify:result-contract` plus focused result/presentation tests |
| CLI entrypoint or command routing | CLI smoke or entrypoint verifier |
| Execution boundary | Execution service tests and execution-boundary verifier |
| Provider registry/model boundary | Provider registry/model-boundary tests; no live provider unless explicitly scoped |
| Session lifecycle | SessionManager and focused session subdomain tests |
| Edit/write behavior | Edit/result/multifile tests plus permission/truthfulness gates relevant to the route |
| All routes | `git diff --check` and `git status --short --branch` |

Do not claim build or tests passed unless the command actually ran and passed.

## Stop Conditions

Stop a migration route if:

- compatibility exports start accumulating new behavior,
- two modules become authoritative for the same runtime fact,
- import rewrites become broad enough that review cannot isolate behavior risk,
- focused tests fail for unclear reasons,
- any change risks provider/auth defaults or package scripts outside explicit
  scope,
- session schema migration becomes necessary,
- a behavior change is discovered in a docs-only or shape-only route,
- result/evidence truthfulness semantics become ambiguous.

## Rollback Strategy

Rollback must remain simple:

- Keep the old public import path until migration is proven.
- Move implementation in small batches so `git revert` can restore one domain.
- Avoid package-level build changes that would require multi-route rollback.
- Preserve tests with each domain so regression evidence stays local.
- Do not delete old compatibility exports in the same route that introduces the
  new owner path unless all consumers are proven migrated and focused tests pass.

## Recommended First Route

Recommended first implementation route after this audit:

```text
Structure Route SR002: Presentation Domain Layout Migration
```

Goal:

- Split presentation internals into a short-name local folder structure.
- Preserve old exports and terminal output semantics.
- Demonstrate the compatibility export and focused validation pattern.

Required constraints:

- no product behavior change,
- no package script or build config edits,
- no provider calls,
- no result truthfulness change,
- no route-numbered product filenames,
- no external-origin product naming,
- old import paths remain valid.

Expected validation:

- focused presentation tests,
- result-contract verification only if output/result semantics are touched,
- TypeScript build if imports are rewritten,
- `git diff --check`,
- `git status --short --branch`.
