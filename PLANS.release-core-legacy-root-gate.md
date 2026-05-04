# Release Core Legacy Root Gate

## 1. Goal

Restore the WSL/Linux `verify:release:core` path exposed by the Linux release/script compatibility route by fixing legacy-root rebasing, permission-memory authority explanation, and session-lifecycle continuity failures.

This route targets the user-minimal main path steps for safe resume/continuation after session migration and permission memory recovery.

## 2. Branch

- Current branch: `release-core-legacy-root-gate`
- Base branch: `linux-release-script-compatibility-audit`

## 3. Why This Is Stacked

This branch is intentionally stacked on `linux-release-script-compatibility-audit`, not `main`, because `main` still fails earlier on Linux script compatibility blockers:

- `D:/Test/pca-home-synth` missing
- Windows-only repo-root expectations
- package-local Vitest resolution

The stacked base removes those blockers and exposes the deeper release-core product/runtime failures this route is meant to fix.

## 4. Current Release-Core Blockers

Initial blockers to audit and fix:

- `rtk node scripts/verify-permission-memory.mjs hard`
- `rtk node scripts/verify-session-lifecycle.mjs`
- `rtk npm run verify:release:core`

Priority:

- P0: permission-memory legacy root / authority explanation
- P1: session-lifecycle lowercase legacy-root / migration continuity
- P2: release-core gate restoration

## 5. Scope

In scope:

- Cross-platform legacy root identity and rebasing semantics.
- Permission-memory continuity fields and authority explanation output.
- Session migration continuity for current project root after legacy root residue.
- Minimal release-core gate restoration.

Out of scope:

- More Linux path compatibility expansion.
- Unrelated MCP/query/workspace safety failures unless they become release-core blockers.
- Provider/auth core changes.
- CLI/session/runMvp production behavior outside the legacy-root continuity path.
- Real-provider smoke or default `verify-real-user-capabilities`.
- Reading, copying, printing, modifying, or cleaning real provider config.

## 6. Three Large File Constraint

Avoid adding new logic to:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

If those files must change, the diff should only wire a dedicated helper into existing flow. Do not add temporary inline regex/marker logic there.

## 7. Reference Constraints

Reference repositories are read-only. The useful semantic constraints are:

- Claude Code persists accepted user/session state before later query work so resume has durable truth.
- Opencode treats permission authority as session cwd/directory plus structured permission metadata, not as arbitrary display path text.
- This route should separate path display/serialization from authority identity and should not let Windows drive-letter text become the permission fact on Linux.

## 8. Validation Commands

Focused:

- `rtk node scripts/verify-permission-memory.mjs hard`
- `rtk node scripts/verify-session-lifecycle.mjs`

Release:

- `rtk npm run verify:release:core`

Baseline:

- `rtk npm run build -w packages/ts-shell`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:result-contract`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:cli-entry`
- `HOME=/tmp/pca-home-synth USERPROFILE=/tmp/pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path`

## 9. Failure Attribution Rules

Classify failures as:

- legacy root normalization bug
- session migration continuity bug
- permission memory expectation bug
- script fixture path issue
- Linux path compatibility issue
- existing unrelated product regression
- RTK issue
- environment/network issue

Do not expand into unrelated product areas.

## 10. RTK / Audit Residue

Before finishing, restore or remove tracked diffs from:

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`

Do not commit temporary homes, node_modules, audit residue, or real provider config.

## 11. Checkpoint Backlog

- A. Audit release-core legacy root failures.
- B. Fix permission-memory legacy root / authority explanation.
- C. Fix session-lifecycle lowercase legacy-root / migration continuity.
- D. Verify release-core gate.
- E. Route audit / merge readiness.

## 12. Current Checkpoint

Implementation completed on `release-core-legacy-root-gate`; focused gates, release-core, and baseline validation passed.

## 13. Initial Blocker Audit

`rtk node scripts/verify-permission-memory.mjs hard`:

- `session-permission-normalization-tests` fails.
- `normalizes legacy permission project-root fields and rooted targets for old sessions` expects `lastApprovalProjectRoot`, request roots, cache keys, scopes, and targets to be rebased to the current project root; actual keeps `D:\legacy-old-root`.
- `normalizes lowercase legacy-root target residues during project-root migration` expects `lastPermissionRequestTarget` to be rebased to the current project root; actual keeps `d:\legacy-old-root-lower\a.txt`.
- `orchestration-authority-explanation-tests` fails because final output still contains `D:/legacy-root`.

`rtk node scripts/verify-session-lifecycle.mjs`:

- `session-state-recovery-compact-tests` fails on the same lowercase legacy-root target residue.
- `orchestration-migration-continuity-tests` fails because `materializes migration-rebased next-step reflective handoff into continuation execution` returns `stopped_error` instead of `completed`.
- Synthetic print/replay gates pass.

`rtk npm run verify:release:core`:

- Doctor passes.
- Gate stops at `permission-memory` with the same legacy root failures.

Attribution:

- This is a product/runtime legacy root normalization bug exposed by Linux script compatibility.
- The current code path treats Windows drive paths as host-relative strings on Linux, so legacy root detection and continuation target rebind do not preserve Windows path identity.

## 14. Implementation Checkpoint

Added a dedicated helper:

- `packages/ts-shell/src/core/paths/legacyRootRebase.ts`

Helper responsibilities:

- Treat Windows drive paths as path-like absolute identities on Linux/WSL.
- Detect a single legacy root from permission working memory fields, cache keys, scope labels, targets, and summary entries.
- Rebase only when there is one non-current legacy root candidate.
- Rebind project-local Windows absolute targets to the current workspace by suffix when the target file exists.
- Preserve unresolved target truthfulness by omitting stale legacy targets when they cannot be safely rebound.

Minimal wiring:

- `SessionManager.ts` delegates legacy permission working-memory root rebasing to the helper, then keeps the existing approval cache-key normalization.
- `runMvpIntegratedFlow.ts` delegates continuation target rebind and subject target normalization to the helper.
- No provider/auth core changes.
- No CLI entrypoint changes.
- No real provider config content was read, copied, printed, modified, or cleaned.

## 15. Validation Results

Focused gates passed:

- `rtk node scripts/verify-permission-memory.mjs hard`
- `rtk node scripts/verify-session-lifecycle.mjs`

Release gate passed:

- `rtk npm run verify:release:core`

Baseline passed:

- `rtk npm run build -w packages/ts-shell`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:result-contract`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:cli-entry`
- `HOME=/tmp/pca-home-synth USERPROFILE=/tmp/pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path`

Not run:

- default `verify-real-user-capabilities`
- real-provider smoke

## 16. Residual Risk

- The helper intentionally handles only a single detected legacy root; conflicting legacy roots remain unmodified.
- Rebinding a stale absolute target to the current workspace requires an existing file and known project-local suffix markers.
- The two large runtime files were touched only for helper wiring, but they remain high-risk areas for future broad refactors.
