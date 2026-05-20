# CLI Core Split Preparation

Route: `docs/agent-routes/route153-cli-core-split-prep.md`

## Scope

Route 153 prepares the CLI / UX module for a future CLI/core split without
changing CLI behavior. The route extracts pure startup, session, provider, and
display projections from `packages/ts-shell/src/entrypoints/cli.tsx` while
leaving mode control flow, session mutation, approval prompting, provider
credential resolution, and runtime invocation in their existing owners.

No provider live calls, real-provider config reads, CLI UX/flag/mode changes,
approval/session schema changes, result behavior changes, browser/edit/runtime
expansion, dependencies, commits, or pushes are part of this route.

## Responsibility Map

| `cli.tsx` responsibility | Route 153 decision | Owner |
|---|---|---|
| argument parsing | keep existing helper | `cliArgs.ts` |
| mode dispatch | keep existing helper; consume in startup plan | `cliModeDispatch.ts`, `cliStartupPlan.ts` |
| print/stdin/interactive runtime invocation | keep in existing runners and runtime bridge | `cliPrintModeRunner.ts`, `cliStdinModeRunner.ts`, `cliRuntimeInvocation.ts` |
| slash command bridge | keep current routing and mutation sites | `cli.tsx`, `slashCommandRegistry.ts`, command bridge helpers |
| session create/resume/switch/current | keep mutations in CLI/session owners; extract switch text facts | `SessionManager.ts`, `cliSessionProjection.ts` |
| approval bridge | keep prompting/persistence in existing bridge; extract only startup summary | `approvalPromptBridge.ts`, `cliStartupPlan.ts` |
| non-interactive policy surface | consume existing CLI option; do not decide policy | `cliStartupPlan.ts` |
| workspace binding | keep binding/mutation logic in CLI/runtime context; extract display facts | `runtimeContext.ts`, `cliDisplayProjection.ts`, `cliWorkspaceSurface.ts` |
| provider readiness snapshot | keep credential/readiness gates in core/runtime bridge; extract redacted CLI summary | `providerCredentials.ts`, `cliRuntimeInvocation.ts`, `cliProviderProjection.ts` |
| result/status rendering | preserve existing result surfaces; extract only simple display strings | core shell surfaces, `cliDisplayProjection.ts` |
| compatibility fallbacks | keep in CLI and existing helpers | `cli.tsx` |

## Extracted Helpers

- `packages/ts-shell/src/entrypoints/cliStartupPlan.ts`
  - projects requested mode, prompt source, session startup mode, workspace
    binding summary, approval summary, provider summary, runtime invocation
    shape, stdin transport mode, prompt count, and max turns
  - does not execute runtime, resolve credentials, or decide provider/auth
- `packages/ts-shell/src/entrypoints/cliSessionProjection.ts`
  - owns existing session switch usage, success, failure, not-found, and
    ambiguous-target message facts
  - does not select, resume, mutate, or serialize sessions
- `packages/ts-shell/src/entrypoints/cliProviderProjection.ts`
  - projects provider mode, readiness label, credential source/auth mode,
    expected env var, model, and base-url presence
  - does not include API keys, account-auth payloads, provider config paths, or
    readiness execution
- `packages/ts-shell/src/entrypoints/cliDisplayProjection.ts`
  - owns simple workspace info, view mode, agent mode, and permission-list
    display facts already emitted by the CLI
  - does not route slash commands or mutate approval/session state
- `packages/ts-shell/src/entrypoints/cliCoreSplit.test.ts`
  - characterizes startup, session, provider, approval, and display projection
    facts for the split boundary

## Integrated Call Sites

`cli.tsx` now delegates these behavior-preserving facts:

- startup surface provider/model/max-turns/stdin inputs are read through
  `projectCliStartupPlan`
- `/pwd`-style workspace info text is read through `formatWorkspaceInfoLines`
- interactive and print-mode `/sessions switch` message strings are read
  through `cliSessionProjection`
- view and agent-mode status/update strings are read through
  `cliDisplayProjection`
- empty permissions-list text is read through `projectPermissionListDisplay`

The following remain in place:

- top-level CLI mode control flow
- `SessionManager` calls and runtime-context mutation
- approval trust policy evaluation, prompting, audit persistence, and cache
  updates
- provider credential resolution and real-provider readiness checks
- runtime invocation via `runCliRuntimeInvocation`
- result/session schema and transcript behavior

## Preservation

Preserved:

- CLI flags, modes, and slash command semantics
- print/stdin/interactive path selection
- session selection, switch, resume, current-session, and panel behavior
- provider default/real/synthetic behavior and readiness gate ownership
- approval bridge behavior and trust policy decisions
- result rendering and transcript/session schema
- browser, edit, runtime, and dependency boundaries

Not changed:

- no provider/model live calls
- no real-provider home reads or config printing
- no browser/edit/runtime capability expansion
- no broad `cli.tsx` rewrite
- no package script or dependency changes

## Validation Plan

Tier 2 validation is the intended route shape:

- focused CLI helper tests for the new projection boundary
- affected entrypoint/slash/baseline tests for touched surfaces
- build
- diff/status and package-file sweep

`runMvpIntegratedFlow.test.ts` is not required unless runtime invocation is
touched beyond consuming startup facts. `verify:result-contract` is not required
unless result surface semantics change.

## Remaining Risks

- `cli.tsx` remains a large composition root. This route only extracts stable
  facts; deeper slash-command control-flow decomposition should be a separate
  route.
- Session/workspace mutation code is still inline by design, because moving it
  now would risk session selection and root-binding behavior.
- Approval prompting remains intentionally centralized in the current CLI
  bridge. A future split should first define an approval-core interface rather
  than moving prompt behavior opportunistically.

## Route 154 Recommendation

Recommended Route 154: CLI/core split implementation phase 2.

The next safe step is to extract one narrow slash-command action boundary, most
likely session or workspace command execution, behind a tested CLI-owned helper
while preserving the existing `SessionManager`, runtime-context mutation,
approval, provider, result, and transcript contracts.
