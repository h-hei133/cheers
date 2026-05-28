# Testing And Validation Strategy

Route229 itself is docs-only. It should not run build, full tests, or live
provider gates unless product code is changed, which this route forbids.

## Docs-Only Planning Validation

Required for Route229:

- `git diff --check`.
- `git status --short --branch`.
- Path existence check for `docs/product-architecture-reset/*.md`.
- Basic markdown sanity check if an existing project command exists. Current
  inspection did not find a dedicated markdown lint script in `package.json`.

## Unit Tests

Future restructure phases should keep unit tests close to the owning module:

- Evidence/verdict facade tests.
- Provider/proposal contract tests.
- Edit authority/apply/readback tests.
- Verification dispatch tests.
- Repair iteration tests.
- Session continuation and replay tests.
- CLI mode and rendering tests.

## Module Boundary Tests

Add dependency checks when physical structure exists:

- Product runtime must not import dev/evidence history.
- CLI/session must consume product facades, not deep capability internals.
- Provider must not import edit authority.
- Edit must not import CLI/session presentation.
- Python eval must not own TS control-plane semantics.
- Rust must stay an opt-in native executor candidate until concrete code paths
  prove broader execution ownership.

These can start as lightweight import scans before becoming a full dependency
graph checker.

## Product Path Smoke Tests

Keep a small set of product path smoke tests:

- CLI `--print` no-provider/no-apply default-safe path.
- CLI/session continuation result truthfulness.
- Deterministic proposal-to-edit path with explicit authority.
- Verification failure to repair-to-success path.
- Local deterministic MCP/tool receipt path.

These should run through product facades, not route-local helper-only paths.

## Capability Regression Tests

Capability regressions should include:

- No false success for unsupported broad/fuzzy/rollback/default-write claims.
- Planned files remain distinct from changed files.
- Provider network/config/product-route failures remain distinguishable.
- Apply without verification does not become success when verification is
  required.
- Browser/MCP local fixture evidence does not claim external-live readiness.

## Route/Frozen Evidence Tests

Route and frozen evidence should remain available as dev/evidence checks:

- Route221 anti-false-success gate.
- Frozen task loading and negative controls.
- Route227/228 compatibility report checks.
- Report redaction checks.

These should eventually consume product evidence/verdict APIs.

## Live Provider Opt-In Tests

Live provider tests are required only when a route touches provider-facing
behavior, smoke scripts, or claims about live provider behavior. They must:

- Set explicit `PRIVATE_AGENTS_REAL_HOME`.
- Use isolated `PRIVATE_AGENTS_TEST_ROOT`, `HOME`, and `USERPROFILE`.
- Avoid manual reads of real provider files.
- Preserve redaction and clean repository status.
- Classify provider-network separately from product-route failure.

Route229 does not run live provider.

## Docs And Script Hygiene Checks

Future hygiene phases should add checks for:

- New long-lived docs are classified in the docs index.
- New scripts use product/release/evidence/provider/dev-history grouping.
- New route-history scripts do not become product default commands.
- No product runtime import from route reports or docs history.

## Phase Validation Matrix

| Phase | Required validation |
|---|---|
| Artifact inventory | docs path check, diff check, status |
| Evidence/verdict facade | focused evidence tests, result tests, report gates |
| Provider/proposal | provider/proposal focused tests, default no-provider checks |
| Edit/verification/repair | workspace write tests, verification tests, repair tests, result contract |
| CLI/session/runtime split | CLI entry, session lifecycle, session durability, result/session parity |
| Script/package hygiene | old aliases, new aliases, release deterministic if command routing changes |
| Final audit | product smoke, focused regression, evidence/report gates |

## Validations Not Required For Route229

Not required because Route229 is docs-only:

- Full build.
- Full package test sweep.
- Release deterministic gate.
- Real provider gate.
- Browser runtime gate.
- Route227/228 reruns.
