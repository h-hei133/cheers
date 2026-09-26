# Workspace Structure

This is a monorepo containing one product workspace.

## Current Status

The workspace is single-language. `packages/ts-shell/` is the product: it owns the
control plane and the execution plane alike. A Rust execution daemon and a Python
evaluation layer both existed and were removed on 2026-09-26 after measurement
showed neither carried anything the TypeScript path did not already do better —
see `.wiki/features/08-gap-and-debt-research.md` §2 for the evidence.

## Layers

### 1. **ts-shell** — TypeScript CLI Shell & Orchestration

- **Location**: `packages/ts-shell/`
- **Purpose**: CLI-first user interface, request routing, session management, agent orchestration, command execution
- **Language**: TypeScript (Node.js 20.3+)
- **Entry Point**: `src/entrypoints/cli.tsx`
- **Build**: `npm run build:ts`
- **Test**: `npm run test:ts`
- **Runtime**: `npm start` or `npm run dev` (watch mode)

**Key files**:

- `src/entrypoints/cli.tsx` — CLI bootstrap and thin IO entrypoint
- `src/core/query/` — query runtime, transitions, result mapping
- `src/core/tools/` — tool runtime, approval flow, permission context, visible tool prefilter
- `src/core/mcp/` — MCP client, connection, and gateway surfaces
- `src/core/commands/` — command registry, slash routing, local/prompt command runtime
- `src/core/shell/` — bootstrap, runtime context, signal handling, recovery, state machine
- `src/runtime/execution/` — the execution boundary: `service.ts` projects a result, `local.ts` spawns and streams, `fileWalk.ts` traverses
- `src/sandbox/` — OS confinement (`bwrap` on Linux, `sandbox-exec` on macOS)
- `src/session/` — session substrate, transcript durability, replay helpers

---

## Workspace Commands

All commands run from the repository root:

```bash
# Bootstrap and validate structure
npm run bootstrap      # Create all required directories/files
npm run validate       # Check structure correctness

# Build
npm run build          # Build the workspace
npm run build:ts       # TS shell only
npm run build:exe      # Single-file executable (needs Bun; no Node on the target)

# Test
npm test               # Run the full suite (TS + script gate tests)
npm run test:ts        # TS shell tests only

# Development
npm run dev            # TS shell watch mode
npm start              # TS shell production mode
```

---

## Dependency Constraints

### Layering

1. **Feature domains → `core/`**: a feature domain may import from `core/`; `core/` must not import from a feature domain.
2. **No dependency cycles**: `npm run verify:import-cycles` fails on any runtime or type-only cycle.
3. **`contracts/` is data, not behaviour**: it carries schemas and serialized shapes, never orchestration or side effects.

### Internal Dependencies

- The workspace has one `package.json`, at `packages/ts-shell/`.
- Root `package.json` defines workspace configuration and orchestration scripts only.

---

## Contract Boundaries

Serialized shapes live in `contracts/`:

- `runtime-protocol.schema.json` — execution request/result envelope, task lifecycle, stream events
- `versioning-policy.md` — schema versioning and compatibility rules
- `typescript/types.ts` — TypeScript type definitions

**Every payload crossing a process boundary MUST include `schemaVersion`.**

---

## Execution

There is one execution path. `runtime/execution/local.ts` spawns the command in
its own process group, forwards output as it arrives, and reports `completed` /
`failed` / `timeout` / `cancelled`. `runtime/execution/service.ts` classifies the
outcome and attaches a receipt.

Isolation is opt-in and lives in `sandbox/`. When a launcher (`bwrap` or
`sandbox-exec`) is unavailable, the result says the command ran unconfined
rather than implying it was isolated.

`grep` runs `rg` when it is installed and falls back to an in-process walk when
it is not, so a machine without ripgrep still searches.

There is no feature gate selecting a different executor. An earlier revision had
one — `DAEMON_ENABLED=1` routed commands to a Rust daemon — and its removal also
removed the failure mode where a missing `cargo` made every command fail on a
fresh install.

---

## Platform Support

- **Primary**: Linux
- **Secondary**: macOS (via `sandbox-exec`), Windows (via the shell-detection layer)

---

## Solo Maintenance Model

This structure is optimized for a single maintainer:

1. **Clear ownership**: Each domain has one primary responsibility.
2. **Decoupled tests**: Domains test independently.
3. **Minimal glue code**: Root `package.json` has only orchestration scripts.
4. **Versioned boundaries**: Contracts prevent surprise breakage.
5. **One language**: a second runtime is a cost that must be justified by measurement, not assumed.

---

## References

- Architecture: `ARCHITECTURE.md`
- Language decision: `.wiki/features/08-gap-and-debt-research.md` §2
- AGENTS.md: repo-specific constraints and conventions
