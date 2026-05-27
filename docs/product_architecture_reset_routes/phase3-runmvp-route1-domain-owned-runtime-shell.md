# Phase 3 runMvp Route 1: Domain-Owned Runtime Shell And Handoff Extraction

## Purpose

Start implementing the full extraction of:

packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

This route replaces any vague "turn bucket" interpretation.

The goal is not to move code into `turn/` by default.

The goal is to move code into the module that actually owns the responsibility.

`turn/` may exist only as a thin coordinator / entrypoint layer. It must not become a new `orchestration` or `product` dumping ground.

## Required Reading

Read before editing:

- docs/product-architecture-reset/runMvp/README.md
- docs/product-architecture-reset/runMvp/00-runmvp-current-map.md
- docs/product-architecture-reset/runMvp/01-runmvp-ownership-zones.md
- docs/product-architecture-reset/runMvp/02-runmvp-extraction-targets.md
- docs/product-architecture-reset/runMvp/03-runmvp-stay-vs-move.md
- docs/product-architecture-reset/runMvp/04-runmvp-extraction-order.md
- docs/product-architecture-reset/runMvp/05-runmvp-validation-plan.md
- docs/product-architecture-reset/runMvp/06-runmvp-risk-register.md
- docs/product-architecture-reset/runmvp-baseline-drift-register.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts
- current domain directories under packages/ts-shell/src

Use current code as truth.

## Core Rule: Destination By Ownership

Before moving any code, decide its real owner.

Do not choose a destination because it is convenient.

Do not create vague buckets:

- helper
- helpers
- utils
- misc
- common
- support
- mvp
- stages as a dumping ground

Allowed destinations must be domain-owned:

- runtime/
- provider/
- proposal/
- planning/
- context/
- edit/
- verification/
- repair/
- evidence/
- result/
- policy/
- browser/
- mcp/
- tools/
- session/
- cli/
- shared/

`turn/` is allowed only for thin request/turn coordination, not for provider logic, planning logic, edit logic, verification logic, repair logic, browser logic, evidence projection, or policy ownership.

If Codex proposes a `turn/` destination, it must justify:

1. why the code is coordination rather than domain logic
2. why no domain module is the real owner
3. how the file avoids becoming a second orchestration bucket

## Goal

Make `runMvpIntegratedFlow.ts` visibly smaller by moving outer runtime shell and first handoff surfaces into owner modules.

This route may combine the safe parts of the planned Phase 1 and Phase 2, but only when ownership is clear.

Expected ownership direction, subject to inspection:

- public legacy run/stream compatibility wrapper stays in orchestration path
- runtime config / dispatcher / environment setup -> runtime/ or a thin coordinator only if truly request-level
- MCP snapshot setup -> mcp/
- browser status / browser execution adapter -> browser/
- sandbox / escalation / authority glue -> policy/
- explicit apply_patch runtime bridge -> edit/ or policy/
- bounded workspace read helper -> policy/ or edit/
- provider draft branch -> provider/
- planning runtime handoff -> planning/
- anchored proposal handoff / current content adapter -> proposal/
- task lifecycle activation -> planning/ or policy/
- result/evidence adaptation -> evidence/ or result/ only if touched

## Strict Non-Goals

Do not split `buildWorkflowTaskPlan` in this route.

Do not split `executeWorkflowTaskPlan` deeply in this route.

Do not move logic into `turn/stages/*` unless it is genuinely coordination-only.

Do not add feature behavior.

Do not run live provider.

Do not change provider defaults.

Do not change write/apply/verification/repair semantics.

Do not weaken evidence/verdict truthfulness.

Do not change production write defaults.

Do not move route docs/reports/package scripts.

Do not split SessionManager or CLI.

Do not mass-format unrelated code.

## Required Checkpoints

### Checkpoint A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- symbol or region
- current responsibility
- real owner domain
- target file
- why not `turn/`
- compatibility strategy
- tests

No edits before this table exists.

### Checkpoint B: Runtime Shell Extraction

Move safe outer runtime shell responsibilities to owner modules.

Candidates, subject to ownership audit:

- runtime environment assembly
- runtime config lookup composition
- dispatcher construction
- MCP snapshot setup
- browser status setup
- sandbox / escalation bridge
- explicit apply_patch runtime bridge
- bounded workspace read policy

`runMvpIntegratedFlow.ts` should delegate or import these owner modules.

### Checkpoint C: First Handoff Extraction

Move at least two owner-specific handoff surfaces, such as:

- provider draft branch -> provider/
- planning runtime handoff -> planning/
- anchored proposal branch -> proposal/
- lifecycle activation -> planning/ or policy/
- browser branch -> browser/

Do not move them into a generic turn stage.

### Checkpoint D: Validation And Audit

Run full validation and report remaining local responsibilities.

## Compatibility Requirements

Old imports must keep working:

- orchestration/runMvpIntegratedFlow.js
- runMvpIntegratedFlow
- streamMvpIntegratedFlow
- MvpIntegratedFlowOptions
- ApplyPatchRuntimeRouteOptions

If old paths need shims, add them.

The legacy orchestration file may remain as compatibility wrapper, but it must not keep owning newly extracted responsibility.

## Validation

Required:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- focused tests for moved owner modules
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Also run when relevant:

- turn facade tests if public run/stream entrypoint changes
- browser harness/gate tests if browser wiring changes
- apply_patch/fenced edit tests if apply_patch bridge moves
- provider no-write tests if provider setup moves

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership audit table completed before edits
- visible code movement out of runMvpIntegratedFlow.ts
- extracted code placed in real owner modules, not generic `turn/` buckets
- at least one runtime shell responsibility moved
- at least two handoff surfaces moved to owner domains
- public legacy imports remain compatible
- full runMvp suite passes
- result contract and Route221 gate pass
- no truthfulness/redaction weakening
- remaining runMvp responsibilities listed

PARTIAL if:

- only docs/comments change
- code only moves to vague coordinator buckets
- fewer than two handoff surfaces move
- full runMvp suite fails

BLOCKED if:

- safe extraction requires splitting buildWorkflowTaskPlan or executeWorkflowTaskPlan first
- ownership cannot be determined safely
- compatibility exports cannot be preserved

## Serena Policy

Use Serena if available for:

- symbol overview
- find symbol
- find references
- impact analysis
- ownership clustering

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit if green.

Suggested prefix:

phase3-runmvp-route1:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Symbols/regions moved
4. Target owner modules
5. Why `turn/` was or was not used
6. Compatibility shims/exports
7. Remaining runMvp responsibilities
8. Product behavior changed yes/no
9. Truthfulness impact
10. Validation results
11. Serena usage
12. Commit hash if committed
13. Whether it is safe to start route 2
