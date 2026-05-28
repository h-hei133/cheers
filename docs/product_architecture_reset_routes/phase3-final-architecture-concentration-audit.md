# Phase 3 Final Architecture Concentration Audit

## Purpose

Audit the repository after the Phase 3 large-file cleanup.

Already cleaned or reduced:

- runMvpIntegratedFlow.ts
- workflowExecutionCoordinator.ts
- workflowTaskPlan.ts
- SessionManager.ts
- cli.tsx

This route determines whether the architecture reset can be considered complete for Phase 3, or whether the cleanup only moved complexity into new owner files.

This is audit-only.

Do not edit runtime code.
Do not move source files.
Do not rewrite tests.
Do not change package scripts.
Do not run live provider.
Do not change product behavior.

## Output Directory

Write all audit artifacts under:

docs/product-architecture-reset/finalConcentrationAudit/

Required outputs:

- docs/product-architecture-reset/finalConcentrationAudit/README.md
- docs/product-architecture-reset/finalConcentrationAudit/00-file-size-and-fanin-map.md
- docs/product-architecture-reset/finalConcentrationAudit/01-new-owner-concentration-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/02-import-boundary-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/03-runtime-dev-history-leakage-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/04-package-script-and-entrypoint-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/05-remaining-architecture-debt-register.md
- docs/product-architecture-reset/finalConcentrationAudit/06-final-reset-verdict.md
- docs/product-architecture-reset/finalConcentrationAudit/07-next-implementation-routes.md

## Required Reading

Read before conclusions:

- docs/product-architecture-reset/runMvp/README.md
- docs/product-architecture-reset/workflowExecutionCoordinator/README.md
- docs/product-architecture-reset/workflowTaskPlan/README.md
- docs/product-architecture-reset/sessionManager/README.md
- docs/product-architecture-reset/cliEntrypoint/README.md
- docs/product-architecture-reset/*/06-next-implementation-routes.md where present
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
- packages/ts-shell/src/planning/workflowTaskPlan.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- major new owner modules created during Phase 3 under:
  - runtime/
  - planning/
  - context/
  - edit/
  - verification/
  - repair/
  - evidence/
  - result/
  - session/
  - cli/
  - provider/
  - proposal/
  - policy/
  - mcp/
- root package.json
- packages/ts-shell/package.json
- scripts/
- docs/product-architecture-reset/
- docs/dev-history/
- docs/implementation-context/

Use current code as truth. Older docs are context only.

## Core Questions

Answer all:

1. Did the old monoliths become genuine facades/coordinators?
2. Did any new owner file become a replacement monolith?
3. Are imports directionally clean?
4. Do product/runtime files import docs, scripts, route history, or dev-history?
5. Do package scripts still mix product commands, route-history commands, evidence gates, and dev demos in a confusing way?
6. Are route/dev-history artifacts still leaking into product architecture?
7. Is Phase 3 architecture cleanup complete enough to return to feature development?
8. If not complete, what exact files/routes must be handled next?

## Audit Scope

### 1. File Size And Fan-in Map

Produce a current map of the largest and most connected files under:

packages/ts-shell/src

Include:

- top large files by line count
- high import fan-in files
- high import fan-out files
- files created in Phase 3 that are now large
- whether each is an acceptable owner, facade, coordinator, or likely new monolith

Must explicitly inspect likely concentration points such as:

- cli/bootstrap/cliProcessRunner.ts
- cli/runtime/cliSessionRuntimeFactory.ts
- cli/interactive/interactiveCommandRouter.ts
- cli/interactive/interactiveLoop.ts
- session/continuation/sessionContinuitySnapshot.ts
- runtime/workflowExecutionCoordinator.ts
- planning/workflowTaskPlan.ts
- result/workflowRuntimeProjection.ts
- verification/verificationStage.ts
- edit/mutationRuntimeStage.ts
- repair/crossFileRepairStage.ts if present

Codex must discover current files rather than relying only on this list.

### 2. New Owner Concentration Audit

For each suspicious large/new owner file, classify:

- acceptable owner
- acceptable coordinator
- compatibility facade
- partial new monolith
- unacceptable new monolith
- needs future route
- safe to leave

For every partial/new monolith, provide:

- exact problematic responsibilities
- proposed owner destinations
- required validation
- whether it blocks Phase 3 completion

### 3. Import Boundary Audit

Check:

- product runtime imports from docs/scripts/dev-history/route reports
- cli/* importing entrypoints/cli.tsx
- session owner modules importing SessionManager.ts
- runtime/planning/edit/verification/repair/result owners importing orchestration compatibility files unnecessarily
- circular or suspicious dependency direction
- compatibility shims that are still needed vs removable later

Do not change imports in this audit.

### 4. Dev-History / Route Leakage Audit

Check whether runtime/product architecture still exposes route-era or development artifacts.

Look for:

- route names in product source
- route reports imported by product source
- dev-history imports in runtime source
- docs/implementation-context used by runtime
- scripts/route* used as product commands
- package aliases that make route history appear as product surface

Do not move docs/scripts in this audit.

### 5. Package Script And Entrypoint Audit

Inspect root package.json and packages/ts-shell/package.json.

Classify scripts into:

- product commands
- product verification
- evidence gates
- route-history compatibility
- dev demos
- live-provider opt-in
- deprecated or confusing aliases

Answer whether script cleanup should be next, and whether it can be done safely without changing behavior.

### 6. Final Architecture Debt Register

Create a debt register with:

- debt item
- file/module
- severity: blocker / major / minor / acceptable
- owner
- why it matters
- proposed route
- validation
- safe to defer yes/no

### 7. Final Reset Verdict

Give one of:

- COMPLETE: Phase 3 architecture cleanup can stop and feature work can resume.
- COMPLETE_WITH_NOTES: Phase 3 can stop, but known non-blocking cleanup remains.
- PARTIAL: one or more new monoliths must be handled before feature work.
- BLOCKED: architecture state cannot be trusted without deeper audit or failed validation cleanup.

Do not exaggerate. If new monoliths exist, say so.

## Required Outputs

### README.md

Summarize purpose, status, artifact list, and final verdict.

### 00-file-size-and-fanin-map.md

Current largest files, fan-in/fan-out, likely concentration points, and classification.

### 01-new-owner-concentration-audit.md

Detailed audit of new owner modules and whether complexity was moved correctly.

### 02-import-boundary-audit.md

Import direction and forbidden import findings.

### 03-runtime-dev-history-leakage-audit.md

Route/dev-history/docs/scripts leakage findings.

### 04-package-script-and-entrypoint-audit.md

Package script and executable surface classification.

### 05-remaining-architecture-debt-register.md

Prioritized debt register.

### 06-final-reset-verdict.md

Final verdict with clear reasoning.

### 07-next-implementation-routes.md

Only if further cleanup is needed. Provide grouped routes, not tiny routes.

## Validation For This Audit Route

Required:

- all required docs exist
- git diff --check
- git status --short --branch

Recommended read-only checks:

- line count scan for packages/ts-shell/src
- import scan for docs/scripts/dev-history/route leakage
- import scan for new owner modules importing old compatibility entrypoints
- package script classification
- no source file changes

No build/tests required because source code must not change.

## Strict Non-Goals

Do not edit source code.
Do not move source files.
Do not rewrite tests.
Do not change package scripts.
Do not move docs/reports/scripts.
Do not run live provider.
Do not claim completion if evidence is missing.
Do not ignore new concentration points.

## Serena Policy

Use Serena if available for:

- symbol overview
- find references
- import ownership review
- concentration clustering

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory writes are not needed, skip onboarding and continue.

## Completion Criteria

COMPLETE requires:

- all required docs exist
- current largest/fan-in files are mapped
- new owner concentration points are classified
- import boundary audit completed
- dev-history/route leakage audit completed
- package script/entrypoint audit completed
- final debt register completed
- clear final verdict produced
- no runtime/product behavior changed

PARTIAL if:

- large files are unmapped
- import scan is incomplete
- verdict is vague
- next routes are generic

BLOCKED if:

- repo cannot be inspected
- current structure cannot be classified
- audit cannot distinguish product code from route/dev-history artifacts

## Final Report

Include:

1. Final status
2. Docs created
3. Serena usage
4. Top concentration findings
5. Import/leakage findings
6. Package script findings
7. Final verdict
8. Remaining blocker/major debts
9. Whether Phase 3 can stop
10. If not, next grouped implementation route
