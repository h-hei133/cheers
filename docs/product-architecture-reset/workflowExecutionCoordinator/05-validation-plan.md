# Validation Plan

This audit route only requires document existence, `git diff --check`, and `git status --short --branch`. The commands below are for future implementation routes that move runtime behavior.

## Always Required After Runtime Extraction

```text
npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
npm test -w packages/ts-shell -- src/runtime/workflowExecutionCoordinator.test.ts
npm run verify:result-contract
npm run verify:route221-anti-false-success-gate
npm run build -w packages/ts-shell
git diff --check
git status --short --branch
```

Use `rtk` for substantive local commands in this repository.

## Route-Specific Validation

| Future route | Focused validation |
| --- | --- |
| Edit activation and write authority | `src/orchestration/fencedEditRuntimeActivation.test.ts`, targeted legacy cases for discovery edit, target-set edit, fenced replacement, approval denied, aborted, and no-write surfaces. |
| Context read/inspect/repo-explain | `src/context/readDeliveryProjection.test.ts`, `src/context/readWindowContinuation.test.ts`, `src/context/repoExplainStage.test.ts`, targeted legacy read/repo-explain/inspect cases. |
| Mutation and repair | `src/edit/mutationInstructionPlanner.test.ts`, `src/edit/mutationTargetSelection.test.ts`, `src/repair/crossFileRepairPlanning.test.ts`, targeted legacy stale-read, patch failure, partial, cross-file continuation, and degraded repair cases. |
| Verification and result handoff | `src/verification/commandStage.test.ts`, `src/result/workflowRuntimeProjection.test.ts`, `src/evidence/verdictFacade.test.ts`, targeted legacy verify retry/content/unchanged/consistency cases, result contract, Route221 gate. |
| Continuation residue cleanup | `src/planning/workflowTaskPlan.test.ts`, continuation-focused legacy cases, build. |

## Import Boundary Checks

After any extraction, scan touched product runtime modules for forbidden imports:

```text
rg -n "(\\.\\./)+docs|(\\.\\./)+scripts|dev-history|product_architecture_reset_routes|product-architecture-reset" packages/ts-shell/src
```

Expected behavior: product runtime must not import docs, route reports, scripts, or dev-history artifacts.

## Truthfulness Regression Focus

Keep explicit assertions for:

- `not-requested`, `skipped`, `blocked`, `failed`, `partial`, and `not-proven` not becoming success.
- Verification approval denied not becoming command success.
- Changed files without verification remaining unverified.
- Stale-read failures preventing writes.
- Multi-file partial failures preserving failed and remaining target evidence.
- Read-only tasks not requesting write or bash approval.
- Provider-free no-write inspect behavior.
- Redaction/report-safe projections remaining owned by evidence/result modules.

## What This Audit Did Not Run

No build or test suite was required for this audit-only route because runtime code was not changed. Future implementation routes should run focused tests before broader gates and should broaden only when touched behavior crosses result/session/tool/permission boundaries.

