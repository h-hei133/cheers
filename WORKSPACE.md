# Workspace Structure

This is a monorepo containing three distinct layers with clear separation of concerns:

## Current Status

This workspace is no longer at the initial scaffold-only stage. The TypeScript shell is the active control plane, the Rust daemon is integrated as the execution-plane backend for execution-focused workloads, and Python remains an offline-only helper layer.

## Layers

### 1. **ts-shell** — TypeScript CLI Shell & Orchestration
- **Location**: `packages/ts-shell/`
- **Purpose**: CLI-first user interface, request routing, session management, agent orchestration
- **Language**: TypeScript (Node.js 20+)
- **Entry Point**: `src/entrypoints/cli.tsx`
- **Build**: `npm run build:ts`
- **Test**: `npm run test:ts`
- **Runtime**: `npm start` or `npm run dev` (watch mode)

**Responsibilities**:
- Streaming CLI input/output loop
- Multi-agent handoff orchestration (planner/coder/reviewer)
- Permission/sandbox policy enforcement (default-deny)
- Session state persistence
- Model provider adapter interface

**Current runtime position**:
- This is the long-term control plane of the system
- Core runtime semantics have been pulled under `src/core/`
- Query, tool runtime, MCP routing, command semantics, bootstrap, and recovery now live primarily in TS

**Key runtime areas**:
- `src/entrypoints/cli.tsx` — CLI bootstrap and thin IO entrypoint
- `src/core/query/` — query runtime, transitions, result mapping
- `src/core/tools/` — tool runtime, approval flow, permission context, visible tool prefilter
- `src/core/mcp/` — MCP client, connection, and gateway surfaces
- `src/core/commands/` — command registry, slash routing, local/prompt command runtime
- `src/core/shell/` — bootstrap, runtime context, signal handling, recovery, state machine
- `src/session/` — session substrate, transcript durability, replay helpers
- `src/orchestration/` — multi-agent handoff compatibility/runtime layer

---

### 2. **rust-core** — High-Performance Execution Daemon
- **Location**: `packages/rust-core/`
- **Purpose**: Long-running daemon for command execution, timeout management, resource control
- **Language**: Rust (Edition 2021)
- **Entry Point**: `src/bin/daemon.rs`
- **Build**: `npm run build:rust` (delegates to `cargo build`)
- **Test**: `npm run test:rust` (delegates to `cargo test`)

**Responsibilities**:
- Command execution with timeout/cancellation
- Process resource limits and cleanup
- Sandbox preflight / denial semantics for execution requests
- Structured logging and error propagation
- IPC bridge for TS↔Rust communication

**Current runtime position**:
- Rust is the execution plane, not the control plane
- It is already integrated behind the TS caller boundary and covered by parity-oriented tests
- It must not absorb session ownership, slash routing, permission UX, or orchestration logic

**Key files**:
- `src/lib.rs` — Core library
- `src/bin/daemon.rs` — Daemon entry point
- `src/executor.rs` — Command execution engine and contract-shaped execution results

---

### 3. **python-eval** — Offline Research & Analysis Layer
- **Location**: `packages/python-eval/`
- **Purpose**: Offline-only research, analysis, and evaluation utilities
- **Language**: Python 3.10+
- **Entry Point**: None (library only)
- **Test**: `npm run test:python` (delegates to pytest)

**Responsibilities**:
- Document analysis and schema validation
- Offline evaluation harness
- Research utilities (never in online critical path)

**Current runtime position**:
- Python remains intentionally minimal
- It is kept out of the online execution path by design

**Key files**:
- `src/` — Library modules
- `tests/` — Unit tests

---

## Workspace Commands

All commands run from the repository root:

```bash
# Bootstrap and validate structure
npm run bootstrap      # Create all required directories/files
npm run validate       # Check structure correctness

# Build
npm run build          # Build all layers (TS + Rust + Python check)
npm run build:ts       # TS shell only
npm run build:rust     # Rust core only

# Test
npm test               # Run all tests (TS + Rust + Python)
npm run test:ts        # TS shell tests only
npm run test:rust      # Rust core tests only
npm run test:python    # Python eval tests only

# Development
npm run dev            # TS shell watch mode
npm start              # TS shell production mode
```

---

## Dependency Constraints

### Cross-Layer Communication

**STRICT ISOLATION RULES**:
1. **TS → Rust**: Only via versioned RPC contracts (`contracts/runtime-protocol.schema.json`)
2. **TS ↔ Python**: Only via CLI subprocess (never imported)
3. **Rust ↔ Python**: Rust may call Python subprocess for offline eval only
4. **TS imports**: Must NOT reference Rust or Python internals
5. **No circular dependencies** between layers

### Internal Dependencies
- Each layer may have its own npm/cargo/pip dependencies
- Root `package.json` defines workspace configuration only
- Layer-specific `package.json`, `Cargo.toml`, `pyproject.toml` define layer dependencies

---

## Contract Boundaries

All cross-layer communication must conform to versioned schemas in `contracts/`:
- `runtime-protocol.schema.json` — RPC envelope, task lifecycle, stream events
- `versioning-policy.md` — Schema versioning and compatibility rules
- `types.ts` — TypeScript type definitions (derived from schema)
- `types.py` — Python type definitions (derived from schema)
- `mod.rs` — Rust type definitions (derived from schema)

**Every payload crossing a layer boundary MUST include `schemaVersion`**.

---

## Migration Path (Phase-2)

The workspace has already moved past the original MVP-only framing. The current architectural rule is:

- **TS = control plane**
- **Rust = execution plane**
- **contracts = semantic boundary**

Feature gate: `DAEMON_ENABLED=1` (environment variable or config flag)

Current transition status:
1. TS control-plane ownership is established in the current runtime
2. Rust execution path exists and has timeout/cancel/sandbox-parity coverage
3. TS↔Rust contract parity is part of the test and evidence story
4. Fallback remains explicit; current local runs may still report `ts-local` depending on config/runtime path

Guardrail:
- future work should move only execution-bound responsibilities into Rust
- shell, session, orchestration, permission UX, and MCP capability policy stay in TS

---

## Platform Support

- **Primary**: Windows (Win32)
- **Secondary**: Linux (future)
- **Not supported**: macOS (for now)

---

## Solo Maintenance Model

This structure is optimized for a single maintainer:

1. **Clear ownership**: Each layer has one primary responsibility
2. **Decoupled tests**: Each layer tests independently
3. **Minimal glue code**: Root package.json has only orchestration scripts
4. **Versioned boundaries**: Contracts prevent surprise breakage
5. **Documented trade-offs**: See DECISIONS.md in each layer

---

## References

- Plan: `.sisyphus/plans/private-coding-agents-rewrite.md`
- Current status: `MIGRATION-STATUS.md`
- Core capability migration: `.sisyphus/plans/claudecode-core-capability-migration.md`
- AGENTS.md: Repo-specific constraints and conventions
- Task tracking: `.sisyphus/notepads/private-coding-agents-rewrite/*.md`
