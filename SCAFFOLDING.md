# Workspace Scaffolding Complete ✅

This document summarizes the completion of **Task T2: Scaffold repository structure for TS shell / Rust core / Python eval**.

## What Was Created

### Directory Structure
```
packages/
├── ts-shell/          # TypeScript CLI shell & orchestration (T3-T10)
│   ├── src/
│   ├── package.json   # Layer-specific config
│   └── tsconfig.json  # TypeScript compiler config
├── rust-core/         # Rust execution daemon (T13-T15, Phase-2)
│   ├── src/
│   ├── Cargo.toml     # Rust package manifest
│   └── package.json   # Workspace integration
└── python-eval/       # Python evaluation (offline, T6)
    ├── src/
    ├── pyproject.toml # Python package config
    └── package.json   # Workspace integration
```

### Root Configuration
- **`package.json`**: Monorepo metadata with npm workspaces
- **`WORKSPACE.md`**: Comprehensive workspace guide (this is the main reference doc)
- **`ARCHITECTURE.md`**: System design, request lifecycle, error propagation
- **`OWNERSHIP.md`**: Clear responsibility boundaries and contract rules

### Root Commands
```bash
npm run bootstrap       # Create/verify all required dirs and files
npm run validate        # Quick health check of workspace structure
npm run build          # Build all layers (delegates to layer scripts)
npm run build:ts       # TS shell build only
npm run build:rust     # Rust core build only
npm run test           # Test all layers (TS + Rust + Python)
npm run test:ts        # TS shell tests only
npm run test:rust      # Rust core tests only
npm run test:python    # Python eval tests only
npm run dev            # TS shell watch mode
npm run start          # TS shell production mode
```

### Tooling Scripts
- **`scripts/bootstrap.mjs`**: Initializes workspace structure
- **`scripts/validate-structure.mjs`**: Verifies all layers present (exit code 0/1)
- **`scripts/run-python-tests.py`**: Python test harness (gracefully skips if no tests)

### Layer Configurations
- **TypeScript** (`tsconfig.json`): ES2022, Node.js 20+, ESM modules
- **Rust** (`Cargo.toml`): Edition 2021, tokio async runtime, test harness
- **Python** (`pyproject.toml`): Python 3.10+, pytest + dev tools

## Acceptance Criteria ✅

From `.sisyphus/plans/private-coding-agents-rewrite.md` (T2, lines 193-230):

### Criterion 1: Repo structure documented with clear ownership per language
**Status**: ✅ COMPLETE
- `WORKSPACE.md`: Layer purposes, entry points, key files, commands
- `OWNERSHIP.md`: Responsibility matrix, cross-layer constraints, violation policies
- `ARCHITECTURE.md`: Request lifecycle, sandbox model, error handling

### Criterion 2: Root task runner commands call layer-specific scripts/tests
**Status**: ✅ COMPLETE
- Root `package.json` has `build`, `test`, `dev`, `start` scripts
- All delegate to `-w packages/{layer}` or custom scripts
- Python handled via `scripts/run-python-tests.py`

## QA Scenarios ✅

### Scenario 1: Workspace Bootstrap
**Command**: `npm run bootstrap` (or `node scripts/bootstrap.mjs`)
**Expected**: Command exits 0, structure matches spec
**Result**: ✅ PASS
- Creates all required directories (`packages/{ts-shell,rust-core,python-eval}/src`)
- Verifies all package.json files exist
- Evidence: `.sisyphus/evidence/task-2-bootstrap.txt`

### Scenario 2: Missing Layer Detection
**Command**: Remove `packages/ts-shell/`, run `npm run validate`
**Expected**: Validation fails with actionable message
**Result**: ✅ PASS
- Validation detects missing directory
- Error: "Missing required directory: packages/ts-shell (TS Shell Layer)"
- Exit code: 1 (failure)
- Evidence: `.sisyphus/evidence/task-2-missing-layer-error.txt`

## Next Steps (Blocks T3, T7, T9)

This scaffolding unblocks:

1. **T3 (CLI-first streaming shell baseline)**
   - Entry point: `packages/ts-shell/src/entrypoints/cli.tsx`
   - Build command: `npm run build:ts`
   - Test command: `npm run test:ts`

2. **T7 (Multi-agent orchestration skeleton)**
   - Home: `packages/ts-shell/src/orchestration/`
   - Can now integrate with TS shell build

3. **T9 (Session state and interrupt/resume)**
   - Home: `packages/ts-shell/src/session/`
   - Uses root session persistence infrastructure

4. **T6 (Tri-stack test infrastructure)**
   - TS tests: `npm run test:ts` (Vitest)
   - Rust tests: `npm run test:rust` (cargo test)
   - Python tests: `npm run test:python` (pytest)
   - Unified: `npm test`

5. **T13-T15 (Rust daemon, Phase-2)**
   - Home: `packages/rust-core/src/`
   - Build: `npm run build:rust`
   - Feature-gated behind `DAEMON_ENABLED` flag

## Key Design Decisions

1. **npm workspaces**: Pragmatic choice for heterogeneous stack (TS+Rust+Python)
2. **Clear ownership**: OWNERSHIP.md prevents accidental coupling
3. **Minimal root config**: Root package.json only has metadata and delegation scripts
4. **Contract-first**: All cross-layer communication via `contracts/` (T1 output)
5. **Phase-2 gating**: Rust daemon is optional, MVP unblocked
6. **Validation by default**: `npm run validate` catches regressions

## Known Limitations

- TS Shell entry point `src/index.ts` not yet created (created in T3)
- Python tests directory empty (populated in T6)
- Rust workspace single-crate (sufficient for MVP)
- Windows-first (Linux/macOS support deferred)

## References

- **Plan**: `.sisyphus/plans/private-coding-agents-rewrite.md` (T2 section, lines 193-230)
- **AGENTS.md**: Repo-specific conventions for TS imports and feature gates
- **Decisions**: `.sisyphus/notepads/private-coding-agents-rewrite/T2-decisions.md`
- **Evidence**:
  - `.sisyphus/evidence/task-2-bootstrap.txt`
  - `.sisyphus/evidence/task-2-missing-layer-error.txt`

---

**Completion Date**: 2026-04-07 12:06 UTC  
**Plan**: private-coding-agents-rewrite  
**Task**: T2 (Scaffold repository structure)  
**Status**: ✅ COMPLETE
