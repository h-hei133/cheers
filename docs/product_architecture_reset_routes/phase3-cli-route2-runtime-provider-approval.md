# Phase 3 CLI Route 2: Runtime Invocation, Provider Bridge, And Approval Bridge

## Purpose

Continue reducing:

packages/ts-shell/src/entrypoints/cli.tsx

Route 1 extracted bootstrap context, startup surface, print, replay, and stdin mode routing.

Route 2 extracts the next high-impact and safety-sensitive CLI block:

1. ShellSessionRuntime construction.
2. Provider credential/runtime refresh bridge.
3. Approval escalation and approval audit bridge.
4. Runtime invocation and planning mutation option wiring.

This route is implementation work.

It must preserve provider default-off behavior, approval policy semantics, redaction, result truthfulness, apply_patch opt-in, and stopped/partial/not-proven distinctions.

## Required Reading

Read before editing:

- docs/product-architecture-reset/cliEntrypoint/README.md
- docs/product-architecture-reset/cliEntrypoint/00-current-map.md
- docs/product-architecture-reset/cliEntrypoint/01-ownership-audit.md
- docs/product-architecture-reset/cliEntrypoint/02-stay-vs-move.md
- docs/product-architecture-reset/cliEntrypoint/03-extraction-targets.md
- docs/product-architecture-reset/cliEntrypoint/04-risk-register.md
- docs/product-architecture-reset/cliEntrypoint/05-validation-plan.md
- docs/product-architecture-reset/cliEntrypoint/06-next-implementation-routes.md
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/cliRuntimeModule.ts
- packages/ts-shell/src/entrypoints/cliPlanningMutationExecution.ts
- packages/ts-shell/src/entrypoints/cliApprovalModule.ts
- packages/ts-shell/src/entrypoints/approvalPromptBridge.ts if present
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
- packages/ts-shell/src/turn/turnFacade.ts if present
- Route 1 CLI owner modules and tests

Use current code as truth.

## Core Rule

Destination by ownership.

Do not create generic buckets:

- helper
- helpers
- utils
- misc
- common
- support
- cliUtils
- entrypointHelpers

Use named owners:

- cli/runtime/
- cli/provider/
- cli/approval/
- policy/
- runtime/
- provider/
- session/

Expected destinations, subject to inspection:

- packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts
- packages/ts-shell/src/cli/runtime/cliRuntimeInvocationBridge.ts
- packages/ts-shell/src/cli/runtime/cliPlanningMutationBridge.ts
- packages/ts-shell/src/cli/provider/cliProviderRuntimeBridge.ts
- packages/ts-shell/src/cli/approval/cliApprovalAuditBridge.ts
- packages/ts-shell/src/cli/approval/cliApprovalEscalationBridge.ts

If files already exist, integrate into them instead of duplicating.

## Goal

Make cli.tsx delegate runtime/provider/approval closure logic to named CLI owners.

cli.tsx should keep:

- executable shim
- process argv/cwd handoff
- bootstrap result usage
- high-level mode dispatch
- interactive loop call site until later route

cli.tsx should stop deeply owning:

- provider credential snapshot closure
- runtime config refresh for provider credentials
- CLI provider/api-key override application
- approval escalation handler construction
- approval audit payload shaping
- active non-interactive approval mode wiring
- apply_patch runtime opt-in projection
- planning mutation execution options
- provider-smoke environment projection
- streamOrchestratedResponse invocation wiring
- ShellSessionRuntime runPrompt closure body

## Required Scope

Complete all categories unless safety blocks:

1. Provider runtime bridge extraction.
2. Approval escalation/audit bridge extraction.
3. Runtime invocation bridge extraction.
4. ShellSessionRuntime factory extraction.
5. Planning mutation bridge extraction if it is still local to cli.tsx.

If a category cannot be safely moved, stop and report PARTIAL. Do not hide by only moving a small wrapper.

## Checkpoint A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- region/symbol
- current responsibility
- owner domain
- target file
- why not cli.tsx executable shim
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Checkpoint B: Provider Runtime Bridge

Move provider credential snapshot and runtime config refresh logic to a provider-owned CLI bridge.

Candidates:

- resolveCredentialSnapshot closure
- runtime config refresh used for provider credentials
- CLI provider and API key overrides
- provider-smoke env projection if provider-related

Must preserve:

- provider default-off behavior
- no live provider unless explicitly opted in by existing gates
- no new credential read path
- no API key/base auth leakage
- redaction behavior
- provider readiness output semantics

## Checkpoint C: Approval Bridge And Audit Mapping

Move approval escalation and audit payload mapping to approval-owned CLI bridge.

Candidates:

- approval escalation handler construction
- approval prompt bridge wiring
- ApprovalAuditMemoryState payload shaping
- inputKey filtering
- activeNonInteractiveApprovalMode state adapter

Must preserve:

- deny/allow-once/allow-always behavior
- trust cache behavior
- approval audit memory field names
- inputKey filtering/redaction
- approval memory as evidence only, not authority
- non-interactive approval mode behavior

## Checkpoint D: Runtime Invocation And Planning Mutation Bridge

Move runtime invocation wiring into cli/runtime owners.

Candidates:

- streamOrchestratedResponse call construction
- apply_patch runtime opt-in projection
- planning mutation execution option construction
- workspace-controlled apply_patch inputs
- provider smoke env forwarding
- result/output callback wiring

Must preserve:

- apply_patch no-write/write opt-in distinction
- controlled workspace behavior
- denied/stopped/interrupted/partial/not-proven states
- result truth classification
- existing SessionManager audit recording behavior
- no output wording change

## Checkpoint E: ShellSessionRuntime Factory

Move ShellSessionRuntime construction and runPrompt closure body into a CLI runtime factory.

Candidates:

- new ShellSessionRuntime(...)
- runPrompt closure
- injected renderer/session/logger/runtimeContext dependencies
- active approval mode setter
- provider credential resolver
- approval handler
- runtime invocation bridge

Must preserve:

- public runtime behavior
- print/stdin/interactive callers
- interrupted error suppression behavior
- non-interactive and interactive parity
- existing session runtime result surfaces

## Strict Non-Goals

Do not move interactive readline loop.

Do not move slash command router.

Do not move session/workspace/MCP command routing.

Do not move print/stdin/replay routing again.

Do not change provider defaults.

Do not run live provider.

Do not change approval policy semantics.

Do not change package scripts or executable path.

Do not change output wording intentionally.

Do not change result truth classification.

Do not weaken redaction.

Do not move route docs/reports.

Do not mass-format unrelated files.

## Compatibility

Keep entrypoints/cli.tsx as executable path.

Keep existing entrypoints compatibility modules where used.

New cli/* modules must not import entrypoints/cli.tsx.

Avoid import cycles between cli/runtime, cli/provider, cli/approval, entrypoints compatibility modules, runtime, provider, session, and policy owners.

## Validation

Required after provider/approval extraction:

- npm test -w packages/ts-shell -- src/entrypoints/cliRuntimeInvocation.test.ts src/entrypoints/cliPlanningMutationExecution.test.ts src/entrypoints/cliModuleBoundary.test.ts src/entrypoints/approvalPromptBridge.test.ts
- focused tests for new provider/approval bridge modules
- focused cli-baseline cases for provider readiness, approval deny, approval allow, apply_patch no-write route, apply_patch workspace write opt-in, stopped/continue behavior if available
- npm run build -w packages/ts-shell
- git diff --check

Required final validation:

- npm test -w packages/ts-shell -- src/entrypoints/cliRuntimeInvocation.test.ts src/entrypoints/cliPlanningMutationExecution.test.ts src/entrypoints/cliModuleBoundary.test.ts src/entrypoints/approvalPromptBridge.test.ts
- focused tests for new cli/runtime/provider/approval modules
- node scripts/verify-cli-entry.mjs or npm run verify:product:cli-entry if available
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- import scan ensuring new cli modules do not import entrypoints/cli.tsx
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- provider runtime bridge extracted
- approval escalation/audit bridge extracted
- runtime invocation bridge extracted
- ShellSessionRuntime factory extracted
- cli.tsx visibly smaller and remains executable shim
- no generic helper/cliUtils bucket movement
- provider default-off behavior preserved
- approval behavior and audit shape preserved
- apply_patch opt-in behavior preserved
- result truth and redaction preserved
- focused tests/build/result-contract/Route221 pass
- remaining cli.tsx responsibilities listed

PARTIAL if:

- only provider or only approval bridge moves
- ShellSessionRuntime closure remains deeply local without reason
- tests fail
- behavior compatibility is uncertain

BLOCKED if:

- extraction would change provider default behavior
- extraction would weaken approval/redaction/result truth
- import cycles cannot be avoided

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoint if useful.

Suggested prefix:

phase3-cli-route2:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Runtime factory files moved/created
4. Provider bridge files moved/created
5. Approval bridge files moved/created
6. Runtime invocation bridge files moved/created
7. Compatibility strategy
8. Product behavior changed yes/no
9. Provider/default impact
10. Approval/redaction impact
11. Result truth impact
12. Validation results
13. Serena usage
14. Remaining cli.tsx responsibilities
15. cli.tsx line count
16. Commit hash if committed
17. Whether safe to start next CLI route
