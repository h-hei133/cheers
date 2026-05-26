# Next Restructure Routes

These routes continue structural migration only. They are not feature routes.

## Reset Route A: Artifact Inventory And Index

- Goal: create a current artifact index that classifies product docs, route
  history, evidence reports, harnesses, scripts, and package commands.
- Scope: docs indexes and inventory docs only.
- Likely affected: `docs/DOC_STATUS.md`, a new evidence/history index, no
  product code.
- Non-goals: moving, deleting, archiving, renaming, or changing scripts.
- Validation: docs path check, diff check, status.
- Stop conditions: any source move or package script behavior change.
- Depends on: Route229.

## Reset Route B: Evidence/Verdict Facade

- Goal: introduce a product-owned evidence/claim/verdict facade and migrate
  report consumers through adapters.
- Scope: evidence types, verdict projection, report-safe redaction and cleanup
  status, compatibility adapters.
- Likely affected: result/evidence modules, Route221 report gate consumers,
  Route227/228 report adapters.
- Non-goals: changing capability behavior, changing provider calls, changing
  write authority.
- Validation: focused evidence/verdict tests, anti-false-success gate,
  result mapper tests.
- Stop conditions: any not-proven/partial state becomes success.
- Depends on: Reset Route A.

## Reset Route C: Provider/Proposal Boundary Facade

- Goal: separate provider receipts from proposal exactness, review, fallback,
  and redaction.
- Scope: provider/proposal facades and compatibility adapters for current
  planning mutation paths.
- Likely affected: `contextAwareProvider*`, `providerEditProposal.ts`,
  `providerExactPatchContract.ts`, `anchoredProposal*`,
  `planningMutationProposalBridge.ts`.
- Non-goals: provider expansion, auth-core changes, live-provider default
  behavior, apply behavior.
- Validation: focused provider/proposal tests, deterministic no-provider checks,
  result contract.
- Stop conditions: provider-called implies proposal/apply success.
- Depends on: Reset Route B.

## Reset Route D: Edit/Verification/Repair Facades

- Goal: make edit, verification, and repair communicate through stable product
  facades.
- Scope: edit operation facade, verification receipt facade, repair iteration
  facade, compatibility for existing controlled edit and repair routes.
- Likely affected: `controlledEditOperationRoute.ts`, `patchResult/*`,
  `taskRelevantVerificationRoute.ts`, `verificationRepairIterationFlow.ts`.
- Non-goals: broad edit expansion, fuzzy apply, rollback, production default
  write.
- Validation: workspace write tests, verification tests, repair tests,
  mutation rejection, result contract.
- Stop conditions: stale-read, authority, or verification semantics weaken.
- Depends on: Reset Route B and preferably Route C.

## Reset Route E: Turn Kernel Compatibility Extraction

- Goal: add a product turn facade that lets `runMvpIntegratedFlow.ts` shrink
  without a route-title rename first.
- Scope: thin turn kernel facade, capability execution handoff, result/evidence
  handoff.
- Likely affected: `runMvpIntegratedFlow.ts`, `flowDispatch.ts`,
  planning/runtime projection files, focused tests.
- Non-goals: behavior change, broad refactor, provider/edit expansion.
- Validation: focused runMvp tests, product path smokes, result/session tests.
- Stop conditions: needing session schema changes or new persistence.
- Depends on: Reset Routes B-D.

## Reset Route F: Session And CLI Presentation Split

- Goal: reduce CLI/session coupling through product facades and session-owned
  transcript/continuation APIs.
- Scope: `cli.tsx`, `cliRuntimeModule.ts`, `sessionRuntime.ts`,
  `SessionManager.ts`, session facade files.
- Likely affected: entrypoints, core/shell, session.
- Non-goals: UI redesign, session schema migration without plan, provider/edit
  behavior.
- Validation: CLI entry tests, session lifecycle, session durability,
  result/session parity.
- Stop conditions: terminal truthfulness changes without result contract
  coverage.
- Depends on: Reset Route E.

## Reset Route G: Scripts And Package Surface Grouping

- Goal: introduce grouped command aliases for product, release, evidence,
  provider, and route-history commands.
- Scope: package scripts, scripts directory shims, docs updates.
- Likely affected: `package.json`, `scripts/*`, docs command indexes.
- Non-goals: deleting old route scripts, changing gate semantics, running live
  provider by default.
- Validation: old aliases, new aliases, focused script checks; release
  deterministic if release command routing changes.
- Stop conditions: old route evidence becomes unreachable.
- Depends on: Reset Route A and preferably B.

## Reset Route H: Route History Quarantine Move

- Goal: move route/history artifacts behind dev-history/evidence-history
  namespaces with compatibility links or aliases.
- Scope: docs and scripts moves only after command/index aliases exist.
- Likely affected: `docs/agent-routes`, `docs/design`, route report locations,
  route runner script locations.
- Non-goals: product behavior changes, report field changes.
- Validation: docs path aliases, old command aliases, evidence report discovery.
- Stop conditions: broken provenance or missing old route report references.
- Depends on: Reset Routes A, B, and G.

## Reset Route I: Final Architecture Compatibility Audit

- Goal: prove the new structure preserved current capability claims and did not
  promote unproven claims.
- Scope: audit only plus any narrow fixes needed for broken compatibility.
- Likely affected: docs, evidence gates, focused test selectors.
- Non-goals: feature development.
- Validation: product path smoke, focused capability regressions,
  evidence/report gates, release deterministic if product/script behavior
  changed.
- Stop conditions: audit finds unclassified baseline drift.
- Depends on: Reset Routes B-H.
