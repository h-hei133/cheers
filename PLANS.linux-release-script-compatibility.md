# Linux Release/Script Compatibility Audit

## 1. Goal

Audit and minimally repair active release/script gates so common WSL/Linux validation can run without replacing Windows defaults or changing product runtime behavior.

This route keeps Windows test paths intact while allowing synthetic/test fixtures to resolve to Linux defaults through `scripts/support/testPaths.mjs`.

## 2. Current Branch

`linux-release-script-compatibility-audit`

## 3. Background

The WSL test path compatibility route already made the core synthetic gates pass on Linux/WSL. This follow-up audits the next layer: release-core child gates, doctor, workspace safety, permission memory, MCP routing, evidence artifacts, and script shell usage.

## 4. Path Rules

Windows defaults remain:

- `D:/Test/pca-home-synth`
- `D:/Test`
- `D:/Test/cli-entry-gate`
- `D:/Test/home-sf`

Linux/WSL defaults remain:

- `/tmp/pca-home-synth`
- `/tmp/private-agents-test`
- `/tmp/private-agents-test/cli-entry-gate`

Real-provider home on Linux/WSL remains explicit opt-in through `PRIVATE_AGENTS_REAL_HOME`. No `/mnt/d/Test/home-sf` fallback is introduced.

## 5. Audit Classification

Already helper-backed:

- `scripts/verify-result-contract.mjs`
- `scripts/verify-cli-entry.mjs`
- `scripts/verify-real-user-capabilities.mjs` safe path paths
- `scripts/verify-provider-readiness.mjs` real/test root handling

Active release-core child gates updated this round:

- `scripts/verify-doctor-environment.mjs`
- `scripts/verify-permission-memory.mjs`
- `scripts/verify-session-lifecycle.mjs`
- `scripts/verify-query-orchestration.mjs`
- `scripts/verify-mcp-routing.mjs`
- `scripts/verify-workspace-safety.mjs`
- `scripts/verify-evidence-artifacts.mjs`
- `scripts/verify-rust-execution.mjs`

Real-provider opt-in / smoke scripts deferred:

- `scripts/verify-release-smoke.mjs`
- `scripts/verify-release-real.mjs`
- `scripts/real-shape-coverage.mjs`

Regression suites deferred unless they become an immediate blocker:

- `scripts/broader-regression.mjs`
- `scripts/comprehensive-regression.mjs`
- `scripts/daily-regression.mjs`
- `scripts/delta-regression.mjs`
- `scripts/delta-nightly.mjs`

Redaction samples and Windows path test examples were not changed.

## 6. Windows-Only Shell Audit

No active matches found for:

- `powershell`
- `where.exe`
- `del /q`
- `%USERPROFILE%`
- `%HOME%`

Deferred Windows-only package script:

- `package.json` `test:delta:release` uses `cmd /d /s /c`; this belongs to delta/nightly regression and is not modified in this route.

## 7. Modification Scope

- Added `scripts/support/scriptRuntime.mjs` for shared script helpers:
  - root/package Vitest resolution
  - cross-platform path equality
- Replaced active synthetic/test fixture roots in release-core child gates with `testPaths` helper values.
- Removed WSL-incompatible fixed repo-root checks from active gates while preserving Windows checks.
- Doctor now checks real-provider home/config presence only when configured and does not parse provider config content.

## 8. Explicit Non-Goals

- No global `D:/Test` or `D:\Test` replacement.
- No historical `PLANS.*` / `RUNBOOK.md` rewrite.
- No real-provider smoke.
- No default `verify-real-user-capabilities`.
- No provider/auth core changes.
- No CLI/session/runMvp production behavior changes.
- No Windows EBUSY work.

## 9. Validation Results

Baseline passed:

- `rtk npm run build -w packages/ts-shell`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:result-contract`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:cli-entry`
- `HOME=/tmp/pca-home-synth USERPROFILE=/tmp/pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path`

Second-batch gates passed:

- `rtk node scripts/verify-doctor-environment.mjs`
- `rtk node scripts/verify-rust-execution.mjs env`
- `rtk node scripts/verify-rust-execution.mjs hard`
- `rtk node scripts/verify-mcp-routing.mjs`
- `rtk node scripts/verify-evidence-artifacts.mjs`

Provider readiness not-configured behavior passed:

- `rtk node scripts/verify-provider-readiness.mjs --preflight-only` returned config-failure with `HOME used=not-configured`, without using `D:/Test/home-sf`.

Second-batch gates that now run but fail existing product assertions:

- `rtk node scripts/verify-permission-memory.mjs hard`
- `rtk node scripts/verify-session-lifecycle.mjs`
- `rtk node scripts/verify-query-orchestration.mjs`
- `rtk node scripts/verify-workspace-safety.mjs`
- `rtk npm run verify:release:core`

## 10. Failure Attribution

Failures were not path-helper or Windows shell blockers after this route's changes:

- `permission-memory` and `session-lifecycle` fail legacy-root migration/session/orchestration assertions.
- `query-orchestration` and `workspace-safety` fail shared tool runtime assertions.
- `verify:release:core` stops at `permission-memory` for the same legacy-root product-test failures.

These are existing product/runtime test failures and are out of scope for this release-script compatibility route.

## 11. Backlog

- Assess legacy-root migration failures as a separate main-path blocker before changing session/orchestration runtime.
- Assess shared tool runtime failures separately before changing tool runtime behavior.
- If delta/nightly release becomes a WSL blocker, replace the `cmd /d /s /c` package script with a small Node wrapper that preserves Windows behavior.
- Continue keeping real-provider smoke explicit and opt-in.

## 12. Current Checkpoint

- Branch created from clean `main`.
- Active release-core child gates no longer use active Windows-only fixture roots.
- WSL/Linux baseline gates passed.
- Several child gates now progress to product assertions; remaining failures are categorized as product/runtime backlog, not script compatibility.
- Real provider config content was not read, printed, copied, modified, or cleaned.

## 13. Failure Equivalence Audit

Status: completed, merge deferred.

Branch results on `linux-release-script-compatibility-audit`:

- `rtk node scripts/verify-permission-memory.mjs hard` still fails legacy-root rebasing and authority explanation assertions.
- `rtk node scripts/verify-session-lifecycle.mjs` still fails lowercase legacy-root rebasing and migration continuity assertions.
- `rtk node scripts/verify-query-orchestration.mjs` now passes.
- `rtk node scripts/verify-workspace-safety.mjs` now passes.
- `rtk npm run verify:release:core` passes doctor, then stops at `permission-memory`.

Main comparison results:

- `rtk node scripts/verify-permission-memory.mjs hard` fails earlier on package-local Vitest resolution and `D:/Test/pca-home-synth` missing.
- `rtk node scripts/verify-session-lifecycle.mjs` fails earlier on package-local Vitest resolution and `D:/Test/pca-home-synth` missing.
- `rtk node scripts/verify-query-orchestration.mjs` fails earlier on package-local Vitest resolution and `D:/Test/pca-home-synth` missing.
- `rtk node scripts/verify-workspace-safety.mjs` fails earlier on the Windows-only repo-root expectation.
- `rtk npm run verify:release:core` fails earlier in doctor on Windows-only repo-root, synthetic home, and real-provider default paths.

Decision:

- The failures are not equivalent between `main` and this branch.
- The branch removes Linux script blockers and exposes deeper legacy-root product assertions, but exact main equivalence is not established because `main` is blocked earlier by script compatibility failures.
- Do not merge this route yet under the failure-equivalence rule.
- Next route should either land the script compatibility route with an explicit exception for earlier main blockers, or first create a dedicated legacy-root rebasing / release-core gate failure route with a narrower product-runtime fix.

## 14. Stacked Merge Readiness

Status: completed.

The previous strict-equivalence blocker was resolved by the stacked `release-core-legacy-root-gate` route. That route fixed the deeper legacy-root product/runtime failures exposed by this Linux script compatibility route, allowing the stacked pair to merge safely.

Stacked merge-readiness on `release-core-legacy-root-gate` passed:

- `rtk npm run build -w packages/ts-shell`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:result-contract`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:cli-entry`
- `HOME=/tmp/pca-home-synth USERPROFILE=/tmp/pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path`
- `rtk node scripts/verify-permission-memory.mjs hard`
- `rtk node scripts/verify-session-lifecycle.mjs`
- `rtk npm run verify:release:core`

Merge order:

- First layer: `e8e0c42 Merge branch 'linux-release-script-compatibility-audit'`
- Second layer: `31a65bf Merge branch 'release-core-legacy-root-gate'`

Post-merge validation on `main` passed with the same command set.

## 15. Route Seal

- Route audit / merge readiness completed.
- This route is merged to `main` as the first layer of the stacked pair.
- Windows defaults remain preserved.
- Linux/WSL synthetic and test path support is merged.
- No full `D:/Test` or `D:\Test` replacement was done.
- Deferred release/regression scripts remain deferred unless they become a concrete blocker.
- Do not continue Linux path compatibility expansion by default; return to a new main-path blocker assessment.
