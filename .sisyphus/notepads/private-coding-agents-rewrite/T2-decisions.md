# T2 Decisions & Learnings: Workspace Scaffolding

## Task Summary
Scaffold maintainable three-layer workspace with TS shell, Rust core, and Python eval. Establish clear ownership boundaries and root-level task runners.

## Decisions Made

### 1. Monorepo Structure: npm workspaces
**Decision**: Use npm v7+ workspaces with `packages/` layout
**Rationale**:
- npm workspaces are built-in, no extra tooling needed
- Clean separation: each layer has its own `package.json`
- Supports mixed build systems (TS, Rust, Python)
- Standard Node.js community pattern
- Solo maintainer: simpler than Lerna or Turborepo

**Alternatives Considered**:
- ❌ Monorepo with shared `node_modules` — breaks isolation
- ❌ Separate repos — prevents easy root-level coordination
- ✅ npm workspaces — good balance of isolation + coordination

### 2. Layer Naming Convention
**Decision**: `packages/{ts-shell, rust-core, python-eval}`
**Rationale**:
- Each name clearly describes layer responsibility
- Matches plan terminology exactly
- Scope names aligned with later T3-T7 code locations

### 3. Configuration File Organization
**Decision**:
- Root `package.json`: monorepo metadata + root scripts only
- Layer-specific files: `tsconfig.json`, `Cargo.toml`, `pyproject.toml`

**Rationale**:
- Minimal coupling: root config doesn't import layer configs
- Each layer is self-contained
- Clear ownership: layer maintainer owns their config

### 4. Root Task Runners
**Decision**: npm scripts that delegate to layer-specific commands
```bash
npm run build       # TS + Rust + Python
npm run test        # TS + Rust + Python
npm run bootstrap   # Structure validation
npm run validate    # Quick health check
```

**Rationale**:
- Solo maintainer needs unified entry points
- Windows-friendly (npm scripts work cross-platform)
- Later CI pipeline can call these same commands
- Fail-fast: if any layer fails, entire build fails

### 5. Python as npm Workspace
**Decision**: Include Python layer in npm workspaces (as dummy workspace)
**Rationale**:
- `npm run test` can call Python tests
- `npm run validate` reports Python layer status
- Prevents "forgotten" Python layer during CI
- Python deps managed separately in `pyproject.toml`

**Alternative Considered**:
- ❌ Separate Python repo — easier to decouple later
- ✅ npm workspace with custom test runner — unified command surface

### 6. Contract Boundaries
**Decision**: All cross-layer communication via `contracts/runtime-protocol.schema.json`
**Rationale**:
- Prevents ad-hoc coupling as features grow
- Phase-2 Rust migration won't break TS layer
- Versioned schema enables safe evolution
- Inherited from T1 (already completed)

### 7. Feature Gating for Phase-2
**Decision**: Rust daemon is Phase-2 (not MVP), feature-gated behind `DAEMON_ENABLED`
**Rationale**:
- MVP unblocked: TS shell works standalone
- Clear migration path: flip flag to enable Rust
- Fallback guaranteed: TS path never removed
- Plan dependency: T13-T15 implement Rust, T10 MVP doesn't need it

### 8. Validation Script
**Decision**: `scripts/validate-structure.mjs` as lightweight health check
**Rationale**:
- No external dependencies (pure Node.js)
- Runs in < 100ms
- Part of CI pipeline (fast fail on missing layers)
- Can be run locally before committing

## Issues Identified

### 1. TS Shell Entry Point Placeholder
**Issue**: `packages/ts-shell/src/index.ts` not yet created
**Impact**: Minor (warning only, will be created in T3)
**Resolution**: T3 creates actual CLI entry point

### 2. Python Tests Directory Empty
**Issue**: `packages/python-eval/tests/` doesn't exist yet
**Impact**: Minor (test runner gracefully skips)
**Resolution**: T6 adds initial smoke test fixtures

### 3. No Rust Workspace Root
**Issue**: `Cargo.toml` is single-package, not workspace
**Impact**: None for MVP (single Rust crate is fine)
**Resolution**: Phase-2 can upgrade to workspace if needed

### 4. Platform-Specific Paths in Scripts
**Issue**: Scripts use Windows paths during dev
**Impact**: Will need conditional handling for Linux/macOS later
**Resolution**: T9+ will abstract path handling

## Learnings

### 1. npm workspaces.* Works Well for Heterogeneous Stacks
Using npm as the coordination layer for TS+Rust+Python is pragmatic:
- npm understands TS layer natively
- npm scripts can delegate to `cargo` and `python` commands
- Root monorepo benefits (single clone, unified CI) without coupling

### 2. Validation at Scaffold Time Saves Debugging
Creating `validate-structure.mjs` at scaffold time means:
- Future tasks can rely on structure being correct
- Detects accidental deletions/renames
- Gives clear guidance when something breaks

### 3. Documentation Must Be Explicit About Constraints
`OWNERSHIP.md` spells out cross-layer rules explicitly:
- Prevents accidental violations
- Makes review easier
- Helps new maintainers or future refactors

## Future Improvements

### Phase-2 / Post-MVP
1. **Cargo workspace**: Upgrade `packages/rust-core/` to Cargo workspace root if multiple crates needed
2. **Python env isolation**: Add venv setup in bootstrap script
3. **CI/CD integration**: Hook validate script into GitHub Actions / local pre-commit
4. **Test coverage reporting**: Aggregate coverage from all three layers
5. **Build artifact caching**: Optimize rebuild times for large monorepo

### Solo Maintenance Optimizations
1. **Dependency audit script**: Regular scan for security updates across all layers
2. **Layer boundary linter**: AST-based check to prevent accidental imports across boundaries
3. **Schema drift detection**: Validate all payloads against `runtime-protocol.schema.json` at runtime
4. **Performance baseline**: Measure scaffold creation time, flag if slower

## Sign-Off

**T2 Complete**: Workspace structure scaffolding verified and documented.

**Acceptance Criteria Status**:
- ✅ Repo structure documented with clear ownership per language (WORKSPACE.md, OWNERSHIP.md)
- ✅ Root task runner commands call layer-specific scripts/tests (package.json scripts)
- ✅ Bootstrap scenario passes (npm run bootstrap)
- ✅ Missing layer detection scenario passes (npm run validate)

**Blocking T3**: Done. TS CLI baseline can now be built on this structure.
**Blocking T7/T9**: Done. Rust core and Python eval have clear homes.

---

*Last updated: 2026-04-07 12:06 UTC*
*Task: T2 (Scaffold repository structure)*
*Plan: private-coding-agents-rewrite.md*
