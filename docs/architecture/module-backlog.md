# Module Backlog

Route: `docs/agent-routes/route131-module-atlas.md`

This backlog proposes future module routes. It is not a commitment to implement all routes immediately. Each route should use `docs/agent-routes/module-route-template.md` before work starts.

## High-Priority Module Consolidation Routes

### Route 132: Agent Loop Responsibility Ledger

- Module: Agent Loop Engineering
- Goal: Produce a no-behavior-change ownership ledger for `runMvpIntegratedFlow.ts` and identify projection-only extraction candidates.
- Expected files: `docs/architecture/run-mvp-responsibility-ledger.md`, maybe route doc only.
- Reference projects: ClaudeCode `query.ts`, opencode `session/processor.ts`, mini-swe-agent `DefaultAgent`.
- Validation: `rtk git diff --check`, source/package diff guards.
- Risk: turning the ledger into a broad refactor.

### Route 133: CLI Entrypoint Responsibility Ledger

- Module: CLI / UX Engineering
- Goal: Map `cli.tsx` responsibilities and define which command/runtime bridges should own future changes.
- Expected files: docs only.
- Reference projects: gemini-cli CLI/core split, ClaudeCode commands.
- Validation: doc/diff/status only.
- Risk: editing entrypoint behavior during an architecture route.

### Route 134: SessionManager Projection / Codec Boundary Map

- Module: Session / Continue Engineering
- Goal: Identify pure codecs, projection builders, replay builders, and persistence operations inside `SessionManager.ts`.
- Expected files: docs only.
- Reference projects: opencode session/compaction/revert, OpenHands conversation/event service, ClaudeCode compact/session restore.
- Validation: doc/diff/status only.
- Risk: changing schema or replay semantics.

### Route 135: Real-User Capability Verifier Decomposition

- Module: Harness Engineering
- Goal: Behavior-preserving decomposition of `scripts/verify-real-user-capabilities.mjs` into focused support modules.
- Expected files: `scripts/verify-real-user-capabilities.mjs`, `scripts/real-user-capabilities/*`.
- Must preserve: flags, output markers, report fields, exit codes, redaction, dirty repo guard, dry-run, real-provider opt-in boundaries.
- Validation:
  - `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
  - `rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test`
  - `rtk npm run verify:real-user-capabilities:two-file-cli-evidence`
  - `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e`
  - `rtk npm run verify:real-user-capabilities:three-file-planning-no-write`
  - `rtk npm run verify:real-user-capabilities:planned-files-continuity`
  - `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run`
  - `rtk npm run verify:real-user-capabilities -- --tier=mvp`
  - `rtk npm run verify:release:deterministic`
- Risk: accidental readiness claim drift.

### Route 136: Permission / Policy Contract Inventory

- Module: Permission / Policy Engineering
- Goal: Inventory approval, workspace, provider opt-in, MCP, browser, and command policy states into one contract doc.
- Expected files: docs first; no source unless a later route approves.
- Reference projects: opencode permission, Inspect AI approval, ClaudeCode filesystem permissions.
- Validation: doc/diff/status only.
- Risk: inventing new taxonomy instead of documenting current states.

## Medium-Priority Module Cleanup Routes

### Route 137: Tool Lifecycle Contract Alignment

- Module: Tool Engineering
- Goal: Align tool lifecycle projection, tool execution provenance, registry metadata, and MCP taxonomy around one contract table.
- Expected files: docs first; later focused tests if behavior changes.
- Reference projects: opencode tool context, ClaudeCode tool orchestration.
- Validation: `rtk npm run verify:mcp:error-taxonomy`, focused tool tests if code changes.
- Risk: registry refactor without behavior need.

### Route 138: Runtime Receipt Contract

- Module: Runtime Engineering
- Goal: Define a shared receipt vocabulary for shell/local/daemon/browser execution: status, exit code, timeout/cancel, cleanup, redaction.
- Expected files: docs first.
- Reference projects: opencode pty/snapshot, OpenHands sandbox services, mini-swe-agent environments.
- Validation: doc/diff/status only unless code changes.
- Risk: moving TS control-plane semantics into Rust.

### Route 139: Browser Module Internal Atlas

- Module: Browser Engineering
- Goal: Split browser responsibilities conceptually into planner, policy, runtime adapter, transaction, evidence, cache, eval, and CLI bridge.
- Expected files: docs only.
- Reference projects: Stagehand, Playwright MCP, gemini-cli browser MCP wrapper.
- Validation: doc/diff/status only.
- Risk: treating physical folder moves as architecture progress.

### Route 140: MCP Claim Boundary Manifest

- Module: Tool Engineering
- Goal: Define exact claims for local deterministic MCP, external MCP, user-configured MCP, protocol errors, and tool isError behavior.
- Expected files: docs and maybe verifier README.
- Reference projects: Playwright MCP, opencode MCP/config, gemini-cli MCP auth.
- Validation: `rtk npm run verify:mcp:local-execution`, `rtk npm run verify:mcp:error-taxonomy`.
- Risk: overclaiming external MCP readiness.

### Route 141: Result Surface Ownership Table

- Module: Result Surface Engineering
- Goal: Map terminal/session/result fields and identify duplicated success/stopped/error logic.
- Expected files: docs only initially.
- Reference projects: ClaudeCode tool UI, opencode projectors, Inspect AI logs.
- Validation: doc/diff/status only.
- Risk: changing result behavior without exhaustive gates.

## Low-Priority Polish Routes

### Route 142: Gate Taxonomy and Ownership Manifest

- Module: Harness Engineering
- Goal: Categorize all `verify:*` scripts as product path, deterministic gate, opt-in real, dry-run, self-test, or docs-only.
- Expected files: docs and maybe `RUNBOOK.md` update if needed.
- Validation: `rtk git diff --check`.
- Risk: editing package scripts unnecessarily.

### Route 143: Memory-to-Session Handoff Contract

- Module: Memory Engineering
- Goal: Document how project memory, compact checkpoints, and future-turn injection enter session continuity.
- Expected files: docs only.
- Reference projects: ClaudeCode SessionMemory, gemini memory service, Inspect state/store events.
- Validation: doc/diff/status only.
- Risk: changing compact trigger or schema.

### Route 144: Eval Report Schema

- Module: Eval / Benchmark Engineering
- Goal: Define a common report shape for browser eval, release deterministic, edit capability, MCP, and session durability gates.
- Expected files: docs first.
- Reference projects: Inspect AI logs/report/view, Stagehand evals.
- Validation: doc/diff/status only.
- Risk: forcing one schema onto all gates prematurely.

### Route 145: Provider Readiness Parity Map

- Module: Provider / Model Engineering
- Goal: Map provider readiness runtime classification to readiness scripts and real-provider default-skip behavior.
- Expected files: docs only unless a parity gap is proven.
- Reference projects: opencode provider/auth, gemini core auth/provider, Stagehand LLM clients.
- Validation:
  - `rtk npm run verify:provider-readiness:real`
  - `rtk npm run verify:provider-readiness:real -- --classification-self-test`
- Risk: touching real-provider config or changing default opt-in behavior.

## Cross-Module Contract Routes

### Route 146: Capability Contract Adoption Pilot

- Module: Capability Contract Architecture
- Goal: Apply `capability-contract.md` to one mature capability, likely edit/patch or browser transaction, without changing runtime behavior.
- Expected files: docs only.
- Validation: doc/diff/status and existing capability gate.
- Risk: turning a documentation pilot into implementation churn.

### Route 147: Workspace / File Context Module Contract

- Module: Workspace / File Context Engineering
- Goal: Generalize workspace root, target resolution, file constraints, and read/write authority into one responsibility map.
- Expected files: docs only first.
- Validation: doc/diff/status only.
- Risk: weakening write authority by moving concepts too early.

### Route 148: Session Event Vocabulary Proposal

- Module: Session / Continue Engineering
- Goal: Propose typed transcript event vocabulary for tool, mutation, browser, provider, approval, compact, and result events.
- Expected files: docs only.
- Reference projects: Inspect AI event union, OpenHands event service, opencode message parts.
- Validation: doc/diff/status only.
- Risk: changing persistence schema too soon.

## Eval / Gate Routes

### Route 149: Browser Eval Gate Report Consolidation

- Module: Eval / Benchmark Engineering
- Goal: Align browser transaction eval and benchmark reports with cleanup/redaction/result fields from the capability contract.
- Expected files: docs first; code only in a later approved route.
- Validation: `rtk npm run verify:browser-txn-gate`.
- Risk: conflating deterministic local browser readiness with public web readiness.

### Route 150: Release Deterministic Gate Claim Audit

- Module: Eval / Benchmark Engineering
- Goal: Audit `verify:release:deterministic` markers against `capability-contract.md` and current allowed claims.
- Expected files: docs and maybe `PROJECT_STATE.md`/`RUNBOOK.md` if stale.
- Validation: `rtk npm run verify:release:deterministic`.
- Risk: broad/general release overclaim.

## Backlog Ordering

Recommended order:

1. Route 135: Real-user capability verifier decomposition.
2. Route 132: Agent loop responsibility ledger.
3. Route 134: SessionManager projection/codec boundary map.
4. Route 133: CLI entrypoint responsibility ledger.
5. Route 136: Permission/policy contract inventory.
6. Route 139: Browser module internal atlas.
7. Route 137: Tool lifecycle contract alignment.
8. Route 140: MCP claim boundary manifest.
9. Route 141: Result surface ownership table.
10. Route 145: Provider readiness parity map.
11. Route 142: Gate taxonomy and ownership manifest.
12. Route 143: Memory-to-session handoff contract.
13. Route 144: Eval report schema.
14. Route 146: Capability contract adoption pilot.
15. Route 147: Workspace/file context module contract.

Do not use this backlog to justify broad source refactors. Each item must be bounded by the route template.
