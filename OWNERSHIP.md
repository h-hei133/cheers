# Ownership & Responsibilities

## Layer Ownership

### ts-shell: CLI Shell & Orchestration

The product. One package owns the control plane and the execution plane alike.

**Primary Responsibilities**:
- [ ] CLI input/output loop and streaming renderer
- [ ] Session state persistence and recovery
- [ ] Multi-agent orchestration (planner/coder/reviewer handoff)
- [ ] Permission policy enforcement (default-deny + explicit escalation)
- [ ] Model provider adapter interface and its implementations
- [ ] Tool registry and permission-aware dispatch
- [ ] User-facing error messages and recovery prompts
- [ ] Command execution: spawn, stream, timeout, cancellation, process-tree cleanup
- [ ] Sandbox policy enforcement (`sandbox/`)

**Does NOT own**:
- Nothing in this repository. There is no second layer to hand work to.

**Testing**:
- Unit tests via Vitest
- Integration tests via interactive CLI scenarios
- Mock provider adapters for deterministic testing

---

## Ownership Boundaries

### Code Location Rules

**Product** (`packages/ts-shell/src/`):
- Entrypoints, CLI, and the interactive surface
- `entrypoints/`, `cli/`, `turn/`, `session/`, `runtime/`, `sandbox/`
- Service adapters for providers, session storage, and execution
- Types derived from `contracts/typescript/types.ts`

### Shared Code (in `contracts/`)

- `runtime-protocol.schema.json` — versioned protocol schema
- `versioning-policy.md` — compatibility rules
- Type definition files (`typescript/types.ts`)
- Test fixtures

These files are the **source of truth** for the serialized protocol.

---

## Contract Violations (STRICT)

These are **NOT ALLOWED**:

1. ❌ Unversioned payloads: `{ command: "...", data: ... }` (must have `schemaVersion`)
2. ❌ Hardwired provider logic: all provider-specific code belongs in the provider adapters
3. ❌ A declared enum value that no producer can emit — it advertises a state that cannot occur
4. ❌ Direct `child_process`, writable `fs`, shell/PTY, browser-process, MCP-process, or runtime-network side effects scattered into unrelated product modules. They go through the owning boundary (`runtime/execution/`, `sandbox/`).

---

## Decision-Making Across Boundaries

When a feature spans several modules:

1. **Design first**: update `contracts/` with a new schema only when there is a real serialized consumer
2. **Implement in the owning module**: not in an entrypoint, a shim, or a vague helper bucket
3. **Contract tests**: ensure every payload still validates
4. **Integration test**: end-to-end scenario through the real boundary

---

## Review Checklist (Before Committing)

For changes touching the execution boundary:

- [ ] The change does not weaken containment: a model-supplied path stays inside the workspace
- [ ] `timeout`, `cancelled`, and `failed` remain distinguishable, and each is reported from a fact that was observed rather than inferred
- [ ] Process-tree cleanup still signals the group, not just the direct child

For any product change:

- [ ] No hardwired provider-specific logic outside the provider adapters
- [ ] Sandbox policy consistently enforced
- [ ] Session state persistence handles corruption gracefully
- [ ] No second language or workspace member introduced (see `agent-rules/architecture-boundaries.md`)

---

## Escalation Path

If a boundary needs to be crossed:

1. Document why in the task's own record
2. Name the concrete evidence that the current owner is insufficient
3. Do not merge without explicit acknowledgment

Examples of acceptable exceptions:
- Sharing test fixtures (`contracts/tests/fixtures/`)
- Environment variable sharing via config files

Examples of unacceptable violations:
- Circular imports
- Unversioned payload passing
- A search or read path that can reach outside the workspace root

---

## References

- Workspace structure: `WORKSPACE.md`
- Architecture boundaries: `agent-rules/architecture-boundaries.md`
- Contract definitions: `contracts/runtime-protocol.schema.json`
