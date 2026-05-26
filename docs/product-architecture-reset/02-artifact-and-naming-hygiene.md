# Artifact And Naming Hygiene

The reset should separate product architecture from development history without
breaking existing route evidence.

## Product File Naming Policy

Product files should name durable responsibility, not route history. Prefer:

- `agentTurnKernel.ts` over `runMvpIntegratedFlow.ts`.
- `editAuthority.ts` or `workspaceWriteAuthority.ts` over route-specific
  authority names.
- `proposalReview.ts`, `proposalApply.ts`, `verificationDispatch.ts`,
  `repairIteration.ts`, `verdictProjection.ts`.
- `sessionStore.ts`, `sessionTranscript.ts`, `sessionContinuation.ts`.

Product names may keep terms such as `proposal`, `verification`, `receipt`,
`evidence`, `verdict`, `authority`, `policy`, and `projection` when those are
current product concepts.

Avoid product runtime names containing:

- `routeNNN`.
- `mvp`, unless the product literally exposes an MVP compatibility API.
- `capstone`, `closeout`, `cut-through`, `gauntlet`, `seal`, `sprint`,
  `benchmark`, or `candidate` when the file is runtime code.

## Test Naming Policy

Product tests should match the product module name when possible:

- `agentTurnKernel.test.ts`.
- `sessionContinuation.test.ts`.
- `proposalApply.test.ts`.
- `verdictProjection.test.ts`.

Route/frozen evidence tests should live in a dev/eval area and may keep route
or frozen task labels when preserving provenance is important.

## Verifier Naming Policy

Verifier scripts should be grouped by purpose:

- `verify:product:*` for product runtime invariants.
- `verify:release:*` for release gates.
- `verify:evidence:*` for report/evidence schema and anti-false-success gates.
- `verify:provider:*` for explicit opt-in provider gates.
- `verify:route-history:*` for preserved route-era verifiers.

Avoid adding new `verify:routeNNN-*` scripts for structural cleanup routes.
Route229 should not add a verifier.

## Route And History Docs Naming Policy

Existing route docs should remain stable until a dedicated archive migration.
Future docs should avoid putting active architecture under route-numbered names
unless the file is a route plan.

Preferred long-lived docs:

- `docs/product-architecture-reset/*`.
- `docs/architecture/*` for stable module boundaries.
- `docs/evidence/*` for durable evidence/verdict architecture.
- `docs/dev-history/routes/*` for historical route plans after quarantine.

## Package Script Naming Policy

Current root scripts mix product commands, release gates, route benchmarks,
provider smokes, and evidence tooling. Proposed grouping:

- Product: `build`, `build:ts`, `build:rust`, `dev`, `start`, `doctor`.
- Unit and package tests: `test`, `test:ts`, `test:rust`, `test:python`.
- Release: `verify:release:*`.
- Evidence: `verify:evidence:*`, `evidence:inspect`.
- Provider opt-in: `verify:provider:*`, `verify:real-provider:*`.
- Historical route compatibility: `verify:route-history:*`.

Migration should add aliases first, then deprecate route-era names after
downstream references are updated.

## Quarantine Policy For Route-Era Artifacts

Do not delete route artifacts during the reset. Quarantine means moving or
reclassifying them behind a clear dev-history boundary:

- `docs/agent-routes/route*.md` -> future `docs/dev-history/routes/`.
- `docs/design/*.md` -> future `docs/dev-history/design/` or
  `docs/archive/design/`.
- `docs/implementation-context/route*-report.json` -> future
  `docs/evidence/history/route-reports/`.
- `scripts/route*.ts` -> future `scripts/dev-history/routes/` or
  `scripts/evidence/route-history/`.
- `verify:route*` scripts -> compatibility aliases pointing at grouped
  evidence or route-history commands.

Quarantine should preserve provenance and checksums where reports are used as
evidence.

## Handling Route, MVP, Capstone, Cut-Through, And Closeout Names

Classification rules:

- Runtime product file with route-era name: rename only in a behavior-preserving
  migration with characterization tests.
- Historical route runner: move to route-history namespace; keep the route name.
- Machine-checkable report: keep route identity in metadata and file name until
  a durable evidence index owns provenance.
- Package script: add product/evidence alias first, then keep old route script
  as a deprecated compatibility alias.
- Docs: update `DOC_STATUS.md` or replacement index before moving.

Examples:

- `runMvpIntegratedFlow.ts` is a product concentration file with stale naming;
  rename only after an `agentTurnKernel` facade exists.
- `editCapabilityCloseoutManifest.ts` is a product-facing readiness artifact
  with closeout history in the name; migrate behind an edit capability manifest
  API before renaming.
- `route228-live-provider-exact-proposal-success-cut-through-report.json` is
  historical evidence; keep route identity but move under evidence history in a
  later phase.

## Migration Rules

- Add new product names as facades before moving implementations.
- Keep import-compatible shims for at least one release cycle.
- Keep old package scripts as aliases until CI, docs, and user workflows move.
- Never weaken redaction, authority, stale-read, verification, or false-success
  checks while renaming.
- Do not combine rename-only moves with behavior changes.
