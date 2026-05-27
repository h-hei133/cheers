# Phase 3: runMvpIntegratedFlow Full Extraction Planning

## Purpose

Plan the complete extraction of `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`.

This route must not implement the extraction yet.

The goal is to understand the entire file, divide it into ownership zones, decide what stays, what moves, where each moved part belongs, and in what order future extraction should happen.

This must be a full-file plan, not a partial helper extraction plan.

## Output Directory

All planning artifacts for this route must be written under:

docs/product-architecture-reset/runMvp/

Required outputs:

- docs/product-architecture-reset/runMvp/00-runmvp-current-map.md
- docs/product-architecture-reset/runMvp/01-runmvp-ownership-zones.md
- docs/product-architecture-reset/runMvp/02-runmvp-extraction-targets.md
- docs/product-architecture-reset/runMvp/03-runmvp-stay-vs-move.md
- docs/product-architecture-reset/runMvp/04-runmvp-extraction-order.md
- docs/product-architecture-reset/runMvp/05-runmvp-validation-plan.md
- docs/product-architecture-reset/runMvp/06-runmvp-risk-register.md
- docs/product-architecture-reset/runMvp/README.md

## Required Inputs

Read before writing conclusions:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts
- docs/product-architecture-reset/runmvp-baseline-drift-register.md
- docs/product_architecture_reset_routes/phase2-6-a-runmvp-legacy-suite-recovery.md
- docs/product_architecture_reset_routes/phase2-goal1-domain-layout-orchestration-decomposition.md
- docs/product_architecture_reset_routes/phase2-goal2-turn-session-cli-physical-split.md
- docs/product-architecture-reset/phase2-final-physical-audit.md
- docs/product-architecture-reset/03-target-product-architecture.md
- docs/product-architecture-reset/04-module-boundaries-and-dependency-rules.md
- docs/product-architecture-reset/05-product-dataflow-and-lifecycle.md
- existing domain directories under packages/ts-shell/src:
  - turn
  - evidence
  - proposal
  - edit
  - verification
  - repair
  - session
  - cli
  - provider if present
  - policy if present
  - result if present

Use current code as truth.

## Serena Policy

Use Serena if available.

Required Serena-style work, if available:

- symbol overview of runMvpIntegratedFlow.ts
- find symbols for major functions/types/constants
- find references for extracted or candidate symbols
- identify large symbol bodies and ownership clusters
- inspect call graph around runMvp entrypoints and streaming paths

Do not rely only on grep or line ranges if Serena can provide symbol-level structure.

If Serena is unavailable or onboarding requests memory writes, continue without memory writes and record the limitation.

## Planning Requirements

The plan must cover the whole file.

Do not only describe easy extraction points.

For every major region/symbol/cluster, classify:

- current responsibility
- current approximate location or symbol name
- owner domain
- final target file or directory
- whether it should stay in runMvpIntegratedFlow.ts
- whether it should move
- whether it should be deleted/deprecated later
- required compatibility shim
- validation needed
- extraction risk
- extraction phase

## Ownership Domains

Prefer final domain ownership, not generic helpers.

Use specific destinations when justified:

- turn/
- turn/stages/
- provider/
- proposal/
- context/
- planning/
- edit/
- verification/
- repair/
- evidence/
- policy/
- result/
- session/
- cli/
- tools/
- browser/
- mcp/
- runtime/
- shared/

Do not use vague outer names such as helper, utils, misc, common, support, or mvp unless there is a clear reason.

If a new file is proposed, name it as a product/domain concept.

Bad examples:

- runMvpHelpers.ts
- mvpUtils.ts
- flowStuff.ts

Better examples:

- turn/planningStage.ts
- turn/mutationStage.ts
- evidence/terminalVerdictProjection.ts
- provider/providerReadinessGate.ts
- verification/verificationRequestStage.ts
- repair/repairContinuationStage.ts
- policy/mutationAuthorityGate.ts

## What Should Stay

The plan must explicitly define what remains in runMvpIntegratedFlow.ts after all future extraction.

The expected long-term role should be one of:

- compatibility wrapper
- thin turn coordinator
- legacy re-export surface
- deprecated wrapper pending removal

The plan must say which role is preferred and why.

## Extraction Order

The order must be practical and aggressive.

Each extraction phase must include:

- goal
- symbols/regions to move
- destination files
- compatibility strategy
- tests to run
- stop conditions
- expected reduction in runMvp responsibility

The order should avoid mixing unrelated concerns.

Suggested phase families, subject to current inspection:

1. provider/readiness and role-draft surfaces
2. context/read/diagnosis routing
3. planning and proposal handoff
4. mutation authority and edit/apply handoff
5. verification request/result handling
6. repair and continuation handling
7. result/evidence/terminal projection
8. cleanup of remaining glue and compatibility wrapper

Codex must adjust based on actual file structure.

## Validation Plan

The validation plan must include:

- full runMvpIntegratedFlow.test.ts
- focused trusted baseline if still useful
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run verify:product:cli-entry if CLI/session/turn output changes
- build -w packages/ts-shell
- import scan for docs/scripts/dev-history leakage
- focused tests for each target domain

## Non-goals

Do not edit product runtime code.

Do not move source files.

Do not rename symbols.

Do not change package scripts.

Do not run live provider.

Do not rewrite tests.

Do not implement extraction in this route.

This route produces the plan only.

## Completion Criteria

COMPLETE requires:

- all required runMvp docs exist under docs/product-architecture-reset/runMvp/
- whole file is mapped, not only selected sections
- every major responsibility has stay/move/delete classification
- every moved responsibility has a concrete final destination
- vague helper buckets are avoided
- extraction order is phased and executable
- validation plan is concrete
- risks and blockers are explicit
- no runtime behavior changed

PARTIAL if:

- only a high-level overview is produced
- large regions are left unmapped
- destinations are vague
- extraction order is not actionable

BLOCKED if:

- runMvp file cannot be inspected
- symbol structure cannot be recovered enough for planning

## Final Report

Report:

1. Final status
2. Docs created
3. Serena usage
4. Major ownership zones found
5. What stays in runMvp
6. Biggest extraction targets
7. Proposed extraction order
8. Highest risks
9. Validation plan summary
10. Whether it is safe to start implementation route 1
