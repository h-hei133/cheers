# Build Infrastructure Roadmap

This roadmap follows BI001. It is a planning artifact, not product
implementation.

## Roadmap Principles

- Owner-domain-first. Every implementation route must name the owner domain
  before touching code.
- No route-numbered product files.
- No process words such as route, sprint, MVP, closeout, capstone, or cut-through
  in product code names.
- Compatibility shims remain thin delegate/re-export surfaces.
- No `helpers`, `utils`, `common`, `misc`, or support dumping grounds for product
  behavior.
- Side effects go through `ExecutionService` or a sanctioned owner.
- Evidence and verdict remain separate. Evidence does not equal success.
- Provider remains explicit opt-in.
- Python remains offline eval only.
- Rust remains a native executor candidate until execution pressure justifies a
  bounded route.
- Contracts are only for real cross-runtime consumers.

## Recommended Implementation Sequence

### Phase 1: Runtime / Turn Snapshot and Save Point

Owner domains:

- Runtime / Turn
- Session / Continue
- Result Surface
- Evidence

Allowed changes:

- Add a local turn snapshot type in the existing `turn` or `runtime` owner area.
- Add a phase vocabulary for prompt/turn/compact/retry/continue style structural
  operations.
- Add an evidence-only save-point projection that can be consumed by session and
  result surfaces.
- Wire the snapshot at a narrow runtime seam without moving provider, browser,
  edit, tool, or verification semantics.

Forbidden changes:

- No provider default enablement.
- No session schema migration.
- No compatibility-shim logic growth.
- No tool execution behavior change.
- No broad `workflowExecutionCoordinator` rewrite.
- No route-numbered product names.

Validation:

- Focused tests for snapshot immutability and redaction.
- Focused tests for phase transition blocking.
- Focused tests proving save point does not upgrade terminal status.
- Existing result-contract gate if terminal/result behavior is touched.

Expected first implementation route:

- `Runtime Turn Snapshot And Save Point`

### Phase 2: Runtime / Execution Error Taxonomy

Owner domains:

- Runtime / Execution
- Result Surface
- Tool / Runtime

Allowed changes:

- Normalize low-level command/file/daemon failure classes through
  `ExecutionService` outputs and runtime receipt projection.
- Keep existing execution behavior unchanged.
- Add structured, redacted failure details for result/session consumption.

Forbidden changes:

- No direct child process or filesystem side-effect path outside
  `ExecutionService`.
- No Rust daemon default change.
- No allowlist or approval weakening.
- No provider/browser/edit expansion.

Validation:

- Focused `ExecutionService` tests.
- Runtime receipt projection tests.
- Result Surface tests for stopped/error classification.

### Phase 3: Tool Result Content/Details Projection

Owner domains:

- Tool
- Runtime
- Result Surface
- Session / Continue

Allowed changes:

- Define a local result projection that separates model-facing content from
  structured redacted details.
- Consume the projection from existing tool/runtime receipt surfaces.
- Keep Result Surface as the only terminal truthfulness owner.

Forbidden changes:

- No hook that can rewrite success without Result Surface verdict.
- No parallel mutation execution.
- No new dynamic tool discovery.

Validation:

- Tool registry tests.
- Session terminal surface tests.
- Result mapper tests.

### Phase 4: Session Tree Projection

Owner domains:

- Session / Continue
- Result Surface

Allowed changes:

- Add a schema-neutral projection for parent/branch/leaf concepts if derivable
  from current session data.
- Document gaps before any persistence migration.
- Keep replay, recovery, compact, and continuation semantics stable.

Forbidden changes:

- No session schema migration in the first route.
- No branch summary as terminal success evidence.
- No CLI behavior change unless explicitly scoped.

Validation:

- Session projection tests.
- Replay/recovery focused tests.
- Compact continuity tests if touched.

### Phase 5: Host-Neutral Event Stream

Owner domains:

- Runtime Events
- CLI / UX
- Session / Continue
- Result Surface

Allowed changes:

- Clarify event stream fields consumed by CLI.
- Keep CLI as one host over a runtime event contract.
- Preserve transcript and terminal output compatibility.

Forbidden changes:

- No broad CLI redesign.
- No SDK/RPC surface unless the route explicitly scopes it.
- No terminal truthfulness change without result-contract validation.

Validation:

- CLI runtime bridge tests.
- Session runtime event tests.
- Terminal output compatibility tests.

### Phase 6: Resource Contract Experiment

Owner domains:

- Runtime / Resources
- Policy
- CLI / UX
- Provider / Model
- Tool

Allowed changes:

- Design a static, explicit, opt-in resource manifest for skills/prompts/tools.
- Keep discovery off by default.
- Keep resources redacted and report-safe.
- Run only offline deterministic experiments.

Forbidden changes:

- No automatic startup injection.
- No dynamic MCP/skills discovery by default.
- No provider/model calls from resource loading.
- No package/plugin execution without explicit policy.

Validation:

- Resource manifest parser tests.
- Policy tests for disabled/default state.
- Result/evidence tests showing resources are not success evidence.

## Expected First Implementation Route

Name:

`Runtime Turn Snapshot And Save Point`

Scope:

- local turn snapshot
- phase vocabulary
- evidence-only save point
- no behavior expansion

Owner domains:

- Runtime / Turn
- Session / Continue
- Result Surface
- Evidence

Stop condition:

- The snapshot records current turn inputs without secrets/raw content leakage.
- Save point flushes only safe evidence/session projections.
- Terminal success/stopped/error remains governed by Result Surface.
- Focused tests pass.
- `git diff --check` is clean.

## Deferred Routes

- Resource and extension loader adoption.
- Session tree persistence migration.
- SDK/RPC host separation.
- Parallel tool execution.
- Provider registry/auth changes.
- Rust executor expansion.

These are deferred because they carry higher risk of route-grown relapse,
provider boundary weakening, schema drift, or side-effect bypass.
