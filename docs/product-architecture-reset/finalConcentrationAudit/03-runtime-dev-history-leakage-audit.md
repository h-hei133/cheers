# Runtime Dev-history Leakage Audit

## Summary

No product runtime import from dev-history, docs, implementation-context, route
reports, or scripts was found. Runtime leakage is mostly naming and string
surface leakage:

- route IDs in product strings
- route IDs in provider/proposal/evidence request IDs
- route IDs in browser harness fixtures
- route-history verification commands in product command planning
- package script aliases that expose route history as top-level commands

This does not prove false success or behavior drift, but it does keep product
architecture tied to route-era vocabulary.

## Product Runtime Route-name Findings

Non-test route-name matches were found in files including:

- `verification/taskRelevantVerificationRoute.ts`
- `verification/verificationCommandPlan.ts`
- `orchestration/planningRuntimeProductProposal.ts`
- `orchestration/planningMutationHandoffProjection.ts`
- `orchestration/controlledMultifileProofChain.ts`
- `orchestration/planningMutationProofVerification.ts`
- `orchestration/contextGraphPlanning.ts`
- `orchestration/realTaskLoopRuntime.ts`
- `orchestration/capabilityBoundaryProjection.ts`
- `orchestration/taskLifecycleActivation.ts`
- `orchestration/anchoredProposalRuntime.ts`
- `orchestration/anchoredProviderSmoke.ts`
- `orchestration/liveProviderSmokeCalibration.ts`
- `orchestration/toolEcosystemCapabilityRoute.ts`
- `orchestration/planningRuntimeProductProjection.ts`
- `orchestration/providerExactPatchContract.ts`
- `evidence/verdictFacade.ts`
- `core/context/browser*`
- `core/harness/browser*`

Judgment: this is historical naming leakage. It is currently used in evidence,
fixtures, compatibility reports, and gate labels, so it should be migrated only
through a route that preserves report compatibility and truthfulness.

## Dev-history Imports

Forbidden non-test product imports from dev-history or route reports: none
found.

This means the runtime is not loading route documents or historical reports as
truth. The leakage is naming and command-surface exposure, not direct runtime
dependency on docs.

## Evidence Compatibility Leakage

`evidence/verdictFacade.ts` explicitly mentions Route221/227/228 compatibility.
That is intentional compatibility debt: the product evidence facade must
preserve anti-false-success and historical report adapter behavior until report
consumers migrate.

Judgment: safe to defer. Do not remove route names here without running the
Route221 anti-false-success gate and report compatibility checks.

## Harness Leakage

`core/harness` contains route-era fixture IDs such as `route100`, `route103`,
`route106`, `route115`, `route118`, `route123`, `route124`, `route125`, and
`route126`.

Judgment: not a Phase 3 blocker for runtime concentration, but this belongs in
a future harness/evidence namespace cleanup. The cleanup must preserve
redaction tests that intentionally include route-scoped fake secrets.

## Script Leakage

Root package scripts still expose many `verify:route*` commands and route
history aliases. This is the most visible route-history leakage for developers.

Judgment: major but safely deferrable if grouped as script taxonomy cleanup.
Do not remove aliases without compatibility shims or an explicit deprecation
route.

