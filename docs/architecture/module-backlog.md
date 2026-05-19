# Module Backlog

Route: `docs/agent-routes/route131-module-atlas.md`

Route 136 replaced the earlier conservative ledger queue with fewer,
implementation-ready control-plane routes. Use
`docs/architecture/control-plane-atlas.md` as the current atlas and
`docs/agent-routes/module-route-template.md` before starting any route.

This backlog is not a commitment to implement all routes immediately. Each
route must preserve AGENTS.md boundaries: no provider/auth expansion, no
browser/edit broadening, no schema changes, no broad entrypoint or main-loop
rewrite, and focused validation tied to touched files.

## Completed Consolidation Routes

### Route 135: Real-User Capability Verifier Decomposition

- Module: Harness Engineering
- Result: `scripts/verify-real-user-capabilities.mjs` is now a compatibility
  entrypoint delegating to focused modules under `scripts/verify/`.
- Closeout doc: `docs/design/verifier-decomposition.md`.
- Boundary preserved: flags, markers, report fields, exit codes, redaction,
  dry-run, dirty repo guard, and real-provider opt-in behavior.

### Route 136: Control-Plane Module Atlas

- Modules: Agent Loop, CLI / UX, Session / Continue, Permission / Policy,
  Result Surface, Provider / Model, Tool, Runtime, Harness / Eval.
- Result docs:
  - `docs/architecture/control-plane-atlas.md`
  - `docs/architecture/run-mvp-ledger.md`
  - `docs/architecture/session-manager-boundary.md`
  - `docs/architecture/cli-boundary.md`
  - `docs/architecture/policy-result-boundary.md`
- Source result: one no-behavior-change session projection extraction,
  `packages/ts-shell/src/session/durableStatusProjection.ts`.

## High-Priority Implementation Routes

### Route 137: Agent Loop Projection Extraction

- Modules: Agent Loop Engineering, Result Surface Engineering.
- Goal: reduce `runMvpIntegratedFlow.ts` concentration by extracting one
  projection family with direct tests.
- Best first candidates:
  - intent signal projector
  - provider diagnostic handoff planner
  - mutation target selection projector
  - read-window continuation projector
  - capability result summary projector
- Validation:
  - focused tests for the extracted projector
  - existing runtime route tests covering the touched path
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: provider auth movement, browser/edit expansion, workspace
  write authority movement, terminal behavior drift, schema changes.

### Route 138: Session Codec and Continuation Seam Extraction

- Modules: Session / Continue Engineering, Result Surface Engineering.
- Goal: continue extracting pure codecs/projections from `SessionManager.ts`
  while keeping filesystem state transitions in the class.
- Best first candidates:
  - recovery snapshot terminal summary projector
  - session reentry summary projector/scorer
  - transcript event codec helpers
  - approval/request memory summary projector consolidation
- Validation:
  - focused session helper tests
  - relevant `SessionManager.test.ts` slices
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: `metadata.json`, `state.json`, `transcript.jsonl`, compact,
  replay, or `/continue` semantic changes.

### Route 139: Tool / Policy / Result Contract Unification

- Modules: Tool Engineering, Permission / Policy Engineering, Result Surface
  Engineering.
- Goal: define and adopt a shared projection vocabulary for tool, MCP,
  approval, command allowlist, workspace, browser-policy, and provider opt-in
  outcomes without changing decisions.
- Best first candidates:
  - policy reason normalizer
  - tool lifecycle to capability lifecycle projector
  - MCP safe detail projector
  - capability-result-to-coding-summary projector
- Validation:
  - focused policy/tool/result tests
  - `rtk npm run verify:mcp:error-taxonomy` if MCP surface changes
  - `rtk npm run verify:result-contract`
  - `rtk npm run verify:edit-capability-closeout` if patch/write result
    semantics are touched
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: changing approval decisions, workspace authority,
  provider opt-in, browser policy, MCP readiness claims, or terminal
  classification rules without a dedicated route.

### Route 140: CLI/Core Split Preparation

- Modules: CLI / UX Engineering, Session / Continue Engineering.
- Goal: move display-only and routing-only helpers out of `cli.tsx` while
  preserving every CLI behavior and compatibility branch.
- Best first candidates:
  - permissions list/explain renderer
  - session switch diagnostics helper
  - replay prompt script runner
  - workspace-info prompt detector
  - approval mode materialization projector
- Validation:
  - focused CLI helper tests
  - CLI argument/mode tests when command routing is touched
  - `rtk npm run test:gate:golden-main-path`
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: CLI UX redesign, slash command behavior changes,
  provider credential changes, approval semantic changes, or session schema
  changes.

### Route 141: Capability Lifecycle Adoption Across Edit / Browser / Shell

- Modules: Capability Contract Architecture, Browser Engineering, Edit / Patch
  Engineering, Runtime Engineering, Harness / Eval Engineering.
- Goal: apply `docs/architecture/capability-contract.md` to mature
  capabilities through projection/report alignment only.
- Best first candidates:
  - browser transaction result projection alignment
  - bounded edit/patch result projection alignment
  - shell/tool runtime receipt vocabulary
  - gate/report marker taxonomy for deterministic verifiers
- Validation:
  - `rtk npm run verify:browser-txn-gate` if browser report/result surfaces are
    touched
  - `rtk npm run verify:edit-capability-closeout` if edit/patch surfaces are
    touched
  - `rtk npm run verify:result-contract`
  - focused helper tests
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: public browser expansion, edit engine expansion,
  rollback/snapshot implementation, schema changes, or default release gate
  changes.

## Medium-Priority Follow-Up Routes

### Route 142: Runtime Receipt Contract

- Modules: Runtime Engineering, Tool Engineering.
- Goal: define a shared receipt vocabulary for local shell, daemon, browser,
  timeout/cancel, cleanup, and redaction without moving control-plane semantics
  into Rust.
- Validation: docs/diff/status first; focused runtime tests if code changes.

### Route 143: Harness and Gate Taxonomy

- Modules: Harness Engineering, Eval / Benchmark Engineering.
- Goal: categorize verifier scripts as product path, deterministic gate,
  opt-in real, dry-run, self-test, docs-only, or report-only, then normalize
  report markers where safe.
- Validation: `rtk git diff --check`; touched verifier self-tests only.

### Route 144: Provider Readiness Parity Map

- Modules: Provider / Model Engineering, Harness Engineering.
- Goal: map provider readiness runtime classification to readiness scripts and
  real-provider default-skip behavior.
- Validation:
  - `rtk npm run verify:provider-readiness:real -- --classification-self-test`
  - real-provider live gate only when an explicit task opens that boundary.
- Stop conditions: manually reading provider config, printing secrets, or
  changing default provider gates.

### Route 145: Workspace / File Context Contract

- Modules: Workspace / File Context Engineering, Edit / Patch Engineering.
- Goal: consolidate workspace root, target resolution, file constraints,
  read/write authority, stale-read, and post-write verification vocabulary.
- Validation: workspace/patch focused tests if code changes; docs/diff/status
  otherwise.

## Backlog Ordering

Recommended order:

1. Route 137: Agent Loop Projection Extraction.
2. Route 138: Session Codec and Continuation Seam Extraction.
3. Route 139: Tool / Policy / Result Contract Unification.
4. Route 140: CLI/Core Split Preparation.
5. Route 141: Capability Lifecycle Adoption Across Edit / Browser / Shell.
6. Route 142: Runtime Receipt Contract.
7. Route 143: Harness and Gate Taxonomy.
8. Route 145: Workspace / File Context Contract.
9. Route 144: Provider Readiness Parity Map.

Do not use this backlog to justify broad source refactors. A route is valid
only when it reduces a user-facing runtime blocker or a named cross-layer
concentration point with focused evidence.
