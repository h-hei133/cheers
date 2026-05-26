# Architecture Debt Register

Severity levels: `high`, `medium`, `low`.

## RESET-DEBT-001: Route-Grown Artifact Surface

- Evidence/path examples: `docs/agent-routes/route*.md` has 236 files;
  `docs/design/*.md` has 83 files; `scripts/route208*` through
  `scripts/route228*`; `verify:route*` package scripts.
- Product architecture problem: the active product shape is obscured by route
  history and proof naming.
- Affected modules: docs, scripts, package scripts, evidence/reporting.
- Severity: high.
- Migration target: dev-history and evidence-history quarantine.
- Suggested phase: Phase 1 and Phase 6.
- Risk if ignored: future work continues to optimize for route proof instead
  of product runtime clarity.

## RESET-DEBT-002: Oversized Agent Loop Concentration

- Evidence/path examples: `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
  is about 10.7k lines.
- Product architecture problem: planning, dispatch, provider/proposal, edit,
  browser/tool, evidence, and result construction remain too concentrated.
- Affected modules: turn, context, provider, proposal, edit, result, session.
- Severity: high.
- Migration target: product turn kernel plus capability facades.
- Suggested phase: Phase 5 after evidence/verdict and capability facades exist.
- Risk if ignored: every new capability increases cross-layer coupling.

## RESET-DEBT-003: Session Manager Concentration

- Evidence/path examples: `packages/ts-shell/src/session/SessionManager.ts`
  is about 2.6k lines and its test is about 3.9k lines.
- Product architecture problem: persistence, transcript, compact, replay,
  approval memory, continuity, and summaries are hard to reason about
  independently.
- Affected modules: session, CLI, result, continuation.
- Severity: high.
- Migration target: session store, transcript, continuation, compact, and
  approval memory facades.
- Suggested phase: Phase 5.
- Risk if ignored: schema and continuation changes become high-risk.

## RESET-DEBT-004: CLI Composition Root Still Owns Too Much Wiring

- Evidence/path examples: `entrypoints/cli.tsx` is about 831 lines and imports
  core, session, and orchestration surfaces.
- Product architecture problem: CLI remains both application shell and runtime
  composition point.
- Affected modules: CLI, session, policy, provider, turn.
- Severity: medium-high.
- Migration target: app/cli facade with product turn invocation.
- Suggested phase: Phase 5.
- Risk if ignored: CLI feature changes can accidentally affect runtime policy.

## RESET-DEBT-005: Evidence And Verdict Spread Across Reports And Runtime

- Evidence/path examples: `claimLedgerProjection.ts`, `resultMapper.ts`,
  Route221 report gates, Route227/228 reports, and route runner assertions.
- Product architecture problem: false-success prevention exists but is spread
  across runtime, tests, and route reports.
- Affected modules: evidence, result, harness/eval, session.
- Severity: high.
- Migration target: product evidence/verdict facade.
- Suggested phase: Phase 2.
- Risk if ignored: future reports may pass without matching product truth.

## RESET-DEBT-006: Provider/Proposal Classification Spread

- Evidence/path examples: `contextAwareProvider*`, `providerEditProposal.ts`,
  `providerExactPatchContract.ts`, `anchoredProposal*`,
  `liveProviderSmoke*`, Route227A and Route228 reports.
- Product architecture problem: provider call, proposal exactness, review,
  fallback, and failure classification are too dispersed.
- Affected modules: provider, proposal, result, evidence.
- Severity: high.
- Migration target: provider receipt facade and proposal contract facade.
- Suggested phase: Phase 3.
- Risk if ignored: provider success may be confused with proposal/apply success.

## RESET-DEBT-007: Edit/Verification/Repair Boundary Spread

- Evidence/path examples: `controlledEditOperationRoute.ts`,
  `patchResult/*`, `taskRelevantVerificationRoute.ts`,
  `verificationRepairIterationFlow.ts`, route runners for 222/227D/227E/227F.
- Product architecture problem: apply, verification, and repair are coupled
  through route-era proof flows instead of a stable lifecycle API.
- Affected modules: edit, verification, repair, evidence.
- Severity: high.
- Migration target: edit, verification, and repair public facades.
- Suggested phase: Phase 4.
- Risk if ignored: repair or verification can drift from write authority rules.

## RESET-DEBT-008: Local Vs External Tool Evidence Ambiguity

- Evidence/path examples: `toolEcosystemCapabilityRoute.ts`,
  `core/mcp/*`, `core/context/browser*`, Route227G report limitations.
- Product architecture problem: local deterministic fixtures, browser
  unavailable, external-live MCP, and tool receipts need one evidence
  vocabulary.
- Affected modules: tools, browser, MCP, evidence, result.
- Severity: medium-high.
- Migration target: receipt-to-evidence facade for tools/browser/MCP.
- Suggested phase: Phase 2 and Phase 4.
- Risk if ignored: local fixture proof may be overclaimed as external readiness.

## RESET-DEBT-009: Docs Status Confusion

- Evidence/path examples: `DOC_STATUS.md` is active but does not list recent
  Route227/228/229 artifacts as a complete current map.
- Product architecture problem: the docs index helps, but maintaining it by
  hand does not scale with route-generated artifacts.
- Affected modules: docs, implementation context, route history.
- Severity: medium.
- Migration target: active docs index plus generated or grouped history index.
- Suggested phase: Phase 1 and Phase 6.
- Risk if ignored: future agents read stale or irrelevant history by default.

## RESET-DEBT-010: Package Script Sprawl

- Evidence/path examples: 120 root package scripts, 82 `verify:*`, 32
  `verify:route*`, and 39 provider/real-related script names.
- Product architecture problem: product commands and proof commands share one
  flat namespace.
- Affected modules: scripts, release, provider gates, developer UX.
- Severity: medium-high.
- Migration target: grouped product/release/evidence/provider/route-history
  command namespace.
- Suggested phase: Phase 6.
- Risk if ignored: users run the wrong gate or mistake route proof for product
  readiness.

## RESET-DEBT-011: Tests, Harnesses, And Product Code Colocated Without Role Labels

- Evidence/path examples: `core/harness/*`, `cli-baseline.test.ts`,
  route proof tests under `orchestration`, browser scenario fixtures under
  `core/context` and `core/harness`.
- Product architecture problem: focused product tests, route proof, harness
  scenarios, and fixtures are hard to distinguish.
- Affected modules: harness/eval, tests, browser, CLI, session.
- Severity: medium.
- Migration target: dev/harness and evidence-fixture namespaces.
- Suggested phase: Phase 6.
- Risk if ignored: test coverage may look broader than the product path it
  proves.

## RESET-DEBT-012: Deep Cross-Module Imports

- Evidence/path examples: session imports orchestration types; core context
  imports edit closeout/readiness; patch result files import result mapper;
  scripts import product internals directly.
- Product architecture problem: module boundaries are responsibility-based in
  docs but not fully enforced physically.
- Affected modules: all product modules.
- Severity: high.
- Migration target: public facade and contract imports.
- Suggested phase: Phases 2-5.
- Risk if ignored: refactors keep requiring broad edits across unrelated
  modules.

## RESET-DEBT-013: Core Context Has Become A Mixed Browser/Runtime Cluster

- Evidence/path examples: `packages/ts-shell/src/core/context` contains browser
  execution, evidence safety, receipt cache, network policy, direct Playwright,
  external runner, replay repair, self-healing patch, skill-managed runner, and
  transaction trace files.
- Product architecture problem: a directory named `context` now owns far more
  than context acquisition, so browser/runtime/evidence/tool responsibilities
  are hard to discover.
- Affected modules: browser, runtime, tools, evidence, context.
- Severity: high.
- Migration target: split browser, runtime receipt, evidence, and context
  ownership behind public facades.
- Suggested phase: Phases 2, 4, and 5.
- Risk if ignored: browser/runtime changes continue to land in an overloaded
  namespace and obscure policy/evidence boundaries.

## RESET-DEBT-014: Contract Boundary Duplication Risk

- Evidence/path examples: `contracts/typescript/types.ts`,
  `contracts/rust/mod.rs`, and `contracts/runtime-protocol.schema.json` exist,
  while `packages/rust-core/src/executor.rs` separately defines command
  execution request/result/status structures.
- Product architecture problem: duplicated cross-runtime shapes can become
  parallel contracts unless their adapter role is explicit and tested.
- Affected modules: contracts, Rust execution plane, TS daemon/runtime bridge.
- Severity: medium.
- Migration target: contract conformance audit and adapter-local type policy.
- Suggested phase: final compatibility audit or a dedicated contracts route.
- Risk if ignored: TS/Rust payload semantics drift during execution-plane
  cleanup.
