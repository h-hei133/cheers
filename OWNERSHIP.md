# Ownership & Responsibilities

## Layer Ownership

### ts-shell: CLI Shell & Orchestration
**Primary Responsibilities**:
- [ ] CLI input/output loop and streaming renderer
- [ ] Session state persistence and recovery
- [ ] Multi-agent orchestration (planner/coder/reviewer handoff)
- [ ] Permission policy enforcement (default-deny + explicit escalation)
- [ ] Model provider adapter interface and OpenAI implementation
- [ ] Tool registry and permission-aware dispatch
- [ ] User-facing error messages and recovery prompts

**Does NOT own**:
- Execution of arbitrary commands (Rust core owns this)
- Complex system-level resource management
- Python research utilities (Python eval owns this)

**Testing**:
- Unit tests via Vitest
- Integration tests via interactive CLI scenarios
- Mock provider adapters for deterministic testing

---

### rust-core: Execution Daemon
**Primary Responsibilities** (Phase-2, not MVP):
- [ ] Long-running daemon process lifecycle
- [ ] Command execution with configurable timeout/cancellation
- [ ] Child process resource limits and cleanup
- [ ] Sandbox policy enforcement (mirrors TS path)
- [ ] Structured logging and error propagation
- [ ] IPC bridge for TS↔Rust request/response

**Does NOT own**:
- User-facing CLI interface (TS shell owns this)
- Permission prompts or escalation workflow (TS shell owns this)
- Model decisions or orchestration (TS shell owns this)

**Testing**:
- Unit tests via `cargo test`
- Contract tests against `runtime-protocol.schema.json`
- Functional parity tests with TS fallback path

---

### python-eval: Research & Analysis
**Primary Responsibilities**:
- [ ] Document parsing and analysis
- [ ] Contract schema validation
- [ ] Offline evaluation utilities
- [ ] Research-only helper functions

**Does NOT own**:
- Online execution (never in critical path)
- Model API communication
- User-facing interfaces

**Testing**:
- Unit tests via pytest
- No online/network tests

---

## Ownership Boundaries

### Code Location Rules

**TS Shell** (`packages/ts-shell/src/`):
- Entrypoints, CLI, main.tsx patterns
- Everything in `entrypoints/`, `cli/`, `orchestration/`, `sandbox/`, `session/`
- Service adapters for providers, IPC, session storage
- Types derived from `contracts/types.ts`

**Rust Core** (`packages/rust-core/src/`):
- Daemon entry point and process management
- Executor engine and timeout/cancel logic
- Sandbox enforcement mirroring TS policy
- Types derived from `contracts/mod.rs`

**Python Eval** (`packages/python-eval/src/`):
- Research utilities and helpers
- Schema validators
- Types derived from `contracts/types.py`

### Shared Code (in `contracts/`)

**Never to be modified during T2-T10**:
- `runtime-protocol.schema.json` — versioned RPC schema
- `versioning-policy.md` — compatibility rules
- Type definition files (`types.ts`, `types.py`, `mod.rs`)
- Test fixtures

These files are **source of truth** for all cross-layer communication.

---

## Contract Violations (STRICT)

These are **NOT ALLOWED**:

1. ❌ TS imports Rust modules: `import { x } from '../rust-core'`
2. ❌ Unversioned payloads: `{ command: "...", data: ... }`  (must have `schemaVersion`)
3. ❌ Python in online path: Python may only be used for offline eval
4. ❌ TS calling Python directly: Must use subprocess or skip for MVP
5. ❌ Rust calling TS: Only via IPC bridge with contracts
6. ❌ Hardwired provider logic: All provider-specific code must be in adapters

---

## Decision-Making Across Boundaries

When a feature spans multiple layers:

1. **Design first**: Update `contracts/` with new schema if needed
2. **TS implementation**: Do TS layer work
3. **Feature-gate Rust**: Add Rust feature behind `DAEMON_ENABLED` flag
4. **Contract tests**: Ensure all payloads validate
5. **Integration test**: End-to-end scenario across layers

---

## Review Checklist (Before Committing)

For changes touching multiple layers:

- [ ] All payload changes documented in schema version
- [ ] Types updated in all three language definitions
- [ ] Cross-layer integration tests added
- [ ] No direct imports across layer boundaries
- [ ] Feature flags correct for MVP vs Phase-2
- [ ] Error handling mirrors in both TS and Rust paths (when applicable)

For TS-only changes:

- [ ] No new `rust-core` or `python-eval` dependencies
- [ ] No hardwired provider-specific logic
- [ ] Sandbox policy consistently enforced
- [ ] Session state persistence handles corruption gracefully

For Rust-only changes (Phase-2):

- [ ] Mirrors sandbox policy from TS implementation
- [ ] All error types conform to contract envelope
- [ ] Timeout/cancel semantics deterministic and tested

For Python-only changes:

- [ ] Never called from online path
- [ ] All tests pass without network access
- [ ] Types match contract definitions

---

## Escalation Path

If you need to violate these boundaries for MVP:

1. Document the violation in `.sisyphus/notepads/T2-issues.md`
2. Add a TODO with GitHub issue link
3. Plan for Phase-2 refactor to restore isolation
4. DO NOT merge without explicit acknowledgment

Examples of acceptable "violations":
- Sharing test fixtures between layers (allowed via `contracts/fixtures/`)
- Calling Python offline utilities from Rust (allowed, not in critical path)
- Environment variable sharing via config files (allowed)

Examples of unacceptable violations:
- Circular imports across layers
- Unversioned payload passing
- Python in online execution path

---

## References

- Workspace structure: `WORKSPACE.md`
- Plan task T2 acceptance criteria: `.sisyphus/plans/private-coding-agents-rewrite.md` (lines 193-230)
- Contract definitions: `contracts/runtime-protocol.schema.json`
