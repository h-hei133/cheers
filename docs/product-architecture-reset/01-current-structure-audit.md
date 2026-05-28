# Current Structure Audit

This audit is based on current repository inspection during Route229. It treats
old architecture docs as historical input only.

## Package And Source Layout

Current package boundaries:

- `packages/ts-shell`: TypeScript product runtime/control plane, CLI, session, query,
  orchestration, tools, browser/MCP, model adapter surfaces, tests, harnesses,
  current execution adapters, and many route-era product proof modules.
- `packages/rust-core`: opt-in native executor candidate with `executor.rs`,
  `lib.rs`, and `bin/daemon.rs`.
- `contracts`: cross-runtime schemas, lifecycle states, permission semantics,
  execution events, generated/runtime types, and contract tests.
- `packages/python-eval`: offline evaluation layer, not a runtime orchestration
  owner.

`packages/ts-shell/src` currently has about 1300 TS/TSX files:

- `orchestration`: about 583 files.
- `core`: about 576 files.
- `session`: about 53 files.
- `entrypoints`: about 42 files.
- Smaller areas: `model-adapters`, `sandbox`, `observability`, `tools`,
  `daemon`, `runtime`, `config`, `workflow`, and renderer/test roots.

The rough product runtime exists, but tests, harnesses, route proof modules, and
historical capability slices are interleaved with runtime modules.

`packages/rust-core/src` is structurally small by comparison: `executor.rs`,
`lib.rs`, and `bin/daemon.rs`. It currently fits an opt-in native executor
candidate role; it does not prove Rust is the default execution plane.

`contracts` is a real cross-runtime boundary with TypeScript, Rust, Python,
schema, validator, and tests. One structural concern remains: Rust execution
types also exist locally in `packages/rust-core/src/executor.rs`, so future
contract cleanup should verify whether duplicated shapes are intentional
adapter-local structs or drift-prone parallel contracts.

## Product Runtime Areas

Current product runtime candidates:

- CLI and command entry: `packages/ts-shell/src/entrypoints/cli.tsx`,
  `cliArgs.ts`, `cliRuntimeInvocation.ts`, `cliRuntimeModule.ts`,
  `cliSessionModule.ts`, `cliWorkspaceModule.ts`, `cliCommandExecutionBridge.ts`.
- Shell/session runtime: `core/shell/sessionRuntime.ts`,
  `core/shell/sessionStateSurface.ts`, `core/shell/sessionTerminalState.ts`,
  `core/shell/continueShellActionRuntime.ts`, `session/SessionManager.ts`,
  `session/sessionStore.ts`, `session/sessionReplayBuilder.ts`,
  `session/stoppedSessionContinuity.ts`.
- Agent loop and capability composition:
  `orchestration/runMvpIntegratedFlow.ts`, `flowDispatch.ts`,
  `planningMutationProposalBridge.ts`, `planningRuntimeProduct*`,
  `controlledEditOperationRoute.ts`, `taskRelevantVerificationRoute.ts`,
  `verificationRepairIterationFlow.ts`, `toolEcosystemCapabilityRoute.ts`.
- Result truthfulness: `core/query/resultMapper.ts`,
  `core/query/actionableBlockerModule.ts`,
  `core/query/capabilityResultClassification.ts`,
  `core/query/terminalClassificationProjection.ts`.
- Edit/write policy and execution:
  `orchestration/patchResult/*`, `patchApplication/*`, `patchParsing/*`,
  `patchVerification/*`, `patchRecovery/*`.
- Provider/proposal surfaces:
  `orchestration/contextAwareProvider*`, `providerEditProposal.ts`,
  `providerExactPatchContract.ts`, `anchoredProposal*`,
  `liveProviderSmoke*`, and `model-adapters/providers/*`.
- Tool/browser/MCP/runtime surfaces:
  `core/tools/*`, `core/mcp/*`, `core/context/browser*`,
  `core/runtime/*`, `sandbox/*`, `daemon/*`, `packages/rust-core/src/*`.

## Tests

Tests are colocated with product code in `packages/ts-shell/src`, including
large test files such as:

- `orchestration/runMvpIntegratedFlow.test.ts` at about 8.2k lines.
- `cli-baseline.test.ts` at about 5.7k lines.
- `session/SessionManager.test.ts` at about 3.9k lines.
- `core/shell/sessionRuntime.test.ts` at about 3.5k lines.

Colocation is useful for focused module coverage, but the current tree also
uses tests as route proof, compatibility proof, and release evidence. The reset
should distinguish normal product tests from route/frozen evidence tests.

## Route-Era Artifacts

Route-era artifacts appear in multiple places:

- `docs/agent-routes/route*.md`: 236 historical route documents.
- `scripts/route207-demo.ts` and `scripts/route208*` through
  `scripts/route228*`: route runners and benchmark scripts.
- `package.json` scripts such as `verify:route224-*`, `verify:route227i-*`,
  and `verify:route228-*`.
- `docs/implementation-context/route222*-report.json` through
  `route228*-report.json`.
- Source names that preserve route-era labels, such as
  `runMvpIntegratedFlow.ts`, `editCapabilityCloseoutManifest.ts`,
  `browserRuntimeMvpScenarioFixtures.ts`, and `pwCloseout.test.ts`.
- Runtime-adjacent source content with route markers, such as Route214 markers
  in `providerExactPatchContract.ts`, Route216/217/218 fixtures in
  `planningRuntimeProductProposal.ts`, and `route206:*` evidence markers in
  `controlledMultifileProofChain.ts`.

These files are not wrong merely because of their names. They become a product
architecture problem when new contributors must learn route history to
understand the current product path.

## Evidence And Report Artifacts

Current evidence/report artifacts include:

- `docs/implementation-context/route227-final-capability-reality-map.md`.
- `docs/implementation-context/route227-release-candidate-summary.md`.
- `docs/implementation-context/route227i-final-capstone-release-candidate-report.json`.
- `docs/implementation-context/route228-live-provider-exact-proposal-success-cut-through-report.json`.
- `docs/implementation-context/frozen-capability-tasks-route221.json`.
- `docs/implementation-context/route221*-report-fixtures/*`.

These are valuable proof snapshots. They should remain available, but should
not be mixed with active implementation context in a way that makes old route
reports look like product architecture truth.

## Harness, Eval, And Verifier Infrastructure

Harness and verifier surfaces include:

- `scripts/verify-real-user-capabilities.mjs`.
- `scripts/verify-route221-anti-false-success-gate.mjs`.
- `scripts/verify-release-deterministic.mjs`,
  `verify-release-core.mjs`, and release/regression scripts.
- `scripts/verify/index.mjs`, `scripts/verify/*`,
  `scripts/real-user-capabilities/*`, `scripts/real-provider-smokes/*`.
- `core/harness/*` browser/eval/trajectory tests and helpers.

The product needs this proof infrastructure, but the reset should move it
toward a dev/eval namespace and keep runtime imports independent from route
reports.

## Major Concentration Files

High-risk concentration points:

- `orchestration/runMvpIntegratedFlow.ts`: about 10.7k lines; still composes
  prompt classification, provider/proposal, browser/edit/tool paths, policy
  handoffs, evidence, and result construction.
- `orchestration` overall: about 583 files, including provider, proposal,
  edit, verification, repair, result projection, task lifecycle, tool
  ecosystem, and proof vocabulary.
- `core/context`: a browser/runtime/evidence/cache/tool cluster with hundreds
  of files, including browser execution, evidence, receipt cache, network
  policy, direct Playwright, external runner, replay repair, self-healing patch,
  skill runner, and transaction trace surfaces.
- `session/SessionManager.ts`: about 2.6k lines; owns persistence, metadata,
  transcript, state snapshots, approval memory, compact/replay/continue, and
  CLI-facing summaries.
- `entrypoints/cli.tsx`: about 831 lines; still wires argument/mode dispatch,
  session commands, approval bridge, provider readiness, workspace binding, and
  runtime invocation.
- `scripts/verify-real-user-capabilities.mjs` and `scripts/verify/index.mjs`:
  broad verifier concentration points.

These files should receive only thin compatibility wiring during the reset.

## Dependency Concerns

Observed dependency direction concerns:

- `entrypoints` imports directly from `orchestration`, `session`, and `core`.
- `session` imports orchestration result types.
- `core/context` imports edit closeout/readiness/recovery surfaces from
  `orchestration/patchResult` and `patchRecovery`.
- `orchestration/patchResult/*Result.ts` imports
  `core/query/resultMapper.ts`.
- Scripts import product internals directly, for example
  `runMvpIntegratedFlow`, `SessionManager`, and `workspaceAuthority`.

Some of these are pragmatic and currently validated, but they show that product
facades are not yet the only dependency path.

## Active Docs Vs Historical Docs

Active/default docs:

- `docs/ACTIVE_CONTEXT.md`.
- `docs/DOC_STATUS.md`.
- `docs/architecture/control-plane-atlas.md`.
- `docs/architecture/capability-contract.md`.
- `docs/architecture/module-backlog.md`.
- `docs/implementation-context/README.md`, flow graph, manifest, and recipes.
- `docs/foundation/*` for truthfulness/risk/foundation audits.

Historical or non-default docs:

- `docs/agent-routes/route*.md`.
- `docs/design/*.md`.
- `docs/audits/*`, `docs/manual-checks/*`, `docs/archive/*`.

`DOC_STATUS.md` is useful for default context selection, but it is already
behind recent Route227/228/229 artifacts. Future cleanup should make status
classification cheaper to maintain.
