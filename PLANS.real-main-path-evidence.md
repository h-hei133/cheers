# Real Main Path Evidence Plan

## 1. Total Goal

Build a focused evidence track for the real user CLI main path. This track should validate and harden the path a user actually experiences through CLI default, `--print`, tool execution, approval boundaries, terminal result blocks, and follow-up readiness.

This is not a new architecture extraction track and not a feature expansion track. Each checkpoint must either add real-main-path evidence, reduce a directly observed real-entry risk, or clarify a failure category that blocks safe use.

## 2. Current Branch

- Branch: `mainpath-real-cli-evidence`
- Base: current `main` after the `refactor-main-path-boundaries` merge.
- Planning checkpoint commit: `Plan real main path evidence track`.

## 3. Background Review Conclusion

The project is in a usable MVP / hardening phase. The main path is formed, and the prior refactor branch reduced responsibility density in the largest TypeScript control-plane files. The remaining highest risk is evidence quality for real user entry behavior, especially where CLI interaction, provider readiness, tool execution, approval, terminal result persistence, and follow-up semantics meet.

This track should prefer realistic CLI entry evidence over additional helper extraction or same-family result-surface proofs.

## 4. Why Real Main Path Evidence

The next useful step is to prove that a user can continuously complete real tasks through the shipped surfaces, not merely that isolated helpers behave correctly.

This directly supports the user-minimal real main path:

- Step 1: the user starts the CLI and sees clear runtime/session state.
- Step 3: the user enters a real task and reaches the unified query loop.
- Step 4: the system uses the real toolchain and explicit approval boundaries.
- Step 5: the system emits and persists a clear terminal state.
- Step 6: the user can continue or recover after stopped/failure states.

## 5. Explicitly Out Of Scope

- Do not add providers or modify auth core.
- Do not read, copy, modify, clean, or leak real auth/key/provider configuration.
- Do not pollute `D:\Test\home-sf`.
- Do not treat synthetic golden success as real-provider maturity evidence.
- Do not run `verify-real-user-capabilities` by default.
- Do not handle Windows EBUSY.
- Do not fix broad old `runMvpIntegratedFlow` failures as a side quest.
- Do not implement full `apply_patch`, AST patch, rollback, batch engine, stream retry, or global network retry.
- Do not add fake live TTY behavior for demonstration value.
- Do not continue opportunistic CLI, SessionManager, or runMvp extraction under this plan.

## 6. Environment Constraints

- Writable target repository: `D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents`.
- Read-only Claude Code reference: `D:\LenovoSoftstore\pyproject\source-claudecode`.
- Read-only opencode reference: `D:\LenovoSoftstore\pyproject\opencode`.
- Synthetic home: `D:\Test\pca-home-synth` with `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`.
- Real-provider home: `D:\Test\home-sf`.
- Failure and isolation checks must use temporary synthetic/test homes unless a checkpoint explicitly and safely targets real-provider readiness.
- RTK command discipline is active for reads, searches, git status/diff/log, tests, builds, and large output commands.

## 7. Reference Implementation Constraints

Reference code is used only for semantic alignment:

- Claude Code `commands.ts`, `query.ts`, and `QueryEngine.ts` show the split between command routing, query lifecycle, tool result handling, and session continuity.
- Claude Code FileRead/FileEdit tools show separate read/write permissions and distinct result rendering.
- opencode CLI run output keeps tool activity visible and does not swallow failed tool results.
- opencode tool definitions use structured metadata/output boundaries.
- opencode permission code separates permission denied from execution failure.
- opencode ACP bridge maps session/tool events into external protocol updates without moving tool execution into the bridge.

Do not copy reference code mechanically.

## 8. Currently Closed Capabilities

- CLI packaged / print / replay / stdin boundary.
- Synthetic golden main path.
- Result/failure surface and `verify:result-contract`.
- Provider readiness preflight script.
- Read/write inspect and coding-task focused smoke coverage.
- Approval allow/deny focused evidence.
- Main path boundary refactor checkpoints from `PLANS.main-path-boundaries.md`.

## 9. Current Major Risks

- Live TTY automation evidence is still thin.
- Real-provider complete coding flow is weaker than synthetic or readiness evidence.
- Tool execution plus failed/stopped follow-up is not yet a strong real-entry chain.
- Long-session compact/resume continuity has not been promoted to a strong real-main-path smoke.
- CLI approval interaction and non-interactive approval boundaries need sharper real-entry evidence.
- Provider network/auth/config failures must remain distinguishable from product regressions.

## 10. Route Backlog

### A. CLI default/live-ish turn smoke planning

Goal: confirm whether existing CLI tests already provide an automatable default/non-print turn boundary smoke, and if not, design the minimum harness.

Status: recommended first checkpoint.

### B. CLI `--print` real-ish tool execution smoke

Goal: validate the full surface of tool execution -> result block -> next action, not only a single read/write marker.

Status: backlog.

### C. Non-interactive approval boundary smoke

Goal: prove approval-required work in non-interactive or print mode does not silently execute and does not emit a misleading terminal state.

Status: backlog.

### D. Failed tool execution follow-up smoke

Goal: prove failed tool execution produces a clear user-visible result, actionable repair guidance, and stable follow-up semantics.

Status: backlog.

### E. Provider readiness + real-provider safe smoke

Goal: verify provider readiness failure classification without leaking auth details and keep real-provider sanity clearly separate from synthetic gates.

Status: backlog; must not run by default.

### F. CLI stopped/failure follow-up real path smoke

Goal: prove that failed/stopped CLI entry states preserve context for follow-up.

Status: backlog.

### G. Compact / long-session smoke design

Goal: design compact -> resume -> continue evidence for a longer chain without promoting it prematurely to default gates.

Status: later backlog.

## 11. Checkpoint Targets, Allowed Files, And Validation

### A. CLI default/live-ish turn smoke planning

Allowed files:

- `PLANS.real-main-path-evidence.md`
- Existing CLI smoke script/test files only if a tiny audit-only annotation or focused harness is explicitly chosen in the next checkpoint.

Validation:

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### B. CLI `--print` real-ish tool execution smoke

Allowed files:

- `packages/ts-shell/src/cli-baseline.test.ts`
- A narrowly scoped script under `scripts/` only if existing test structure cannot express the smoke cleanly.
- `PLANS.real-main-path-evidence.md`

Validation:

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"
rtk npm run verify:cli-entry
```

### C. Non-interactive approval boundary smoke

Allowed files:

- `packages/ts-shell/src/cli-baseline.test.ts`
- Approval-focused shell files only if the smoke exposes a refactor regression.
- `PLANS.real-main-path-evidence.md`

Validation:

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "approval"
rtk npm run verify:cli-entry
```

### D. Failed tool execution follow-up smoke

Allowed files:

- `packages/ts-shell/src/cli-baseline.test.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.test.ts` only if existing stopped/failure context coverage needs a minimal import/assertion update.
- `PLANS.real-main-path-evidence.md`

Validation:

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts
rtk npm run verify:result-contract
```

### E. Provider readiness + real-provider safe smoke

Allowed files:

- `scripts/verify-provider-readiness.mjs`
- `packages/ts-shell/src/core/shell/providerReadiness.test.ts`
- `PLANS.real-main-path-evidence.md`

Validation:

```powershell
rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts
rtk npm run verify:provider-readiness
```

Run real-provider checks only when the checkpoint explicitly requires them and only with `HOME=D:\Test\home-sf` / `USERPROFILE=D:\Test\home-sf`. Do not read or print credential material.

### F. CLI stopped/failure follow-up real path smoke

Allowed files:

- `packages/ts-shell/src/cli-baseline.test.ts`
- `PLANS.real-main-path-evidence.md`

Validation:

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
rtk npm run verify:result-contract
```

### G. Compact / long-session smoke design

Allowed files:

- `PLANS.real-main-path-evidence.md`
- Session tests only if a later checkpoint chooses implementation.

Validation:

```powershell
rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts
```

## 12. Failure Attribution Rules

Classify failures before fixing:

- Product regression introduced by the checkpoint.
- Test maintenance issue caused by refactor/import movement.
- Existing old failure or over-broad test filter.
- Provider network/auth/config issue.
- Environment issue such as sandbox EPERM, tool timeout, Windows EBUSY, or RTK/audit residue.
- External branch or workspace state interference.

If the failure is a current checkpoint regression, fix it inside the same bounded surface. If fixing would require new product capability, broad taxonomy changes, provider/auth changes, release-core changes, or durable session policy changes, stop and record the issue as backlog instead.

## 13. RTK And Audit Residue Rules

Use RTK for file reads, searches, git status/diff/log, tests, builds, and large output commands.

Before commit, remove or restore verification residue such as:

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`

If using RTK status/restore would recreate audit files, use minimal raw `git status` / `git restore` only after explaining why.

Never commit audit residue, real-provider config, temporary homes, or unrelated generated files.

## 14. Commit And Push Rules

- One checkpoint per commit.
- Planning-only commits are allowed when they create or update this plan.
- Do not mix planning, CLI smoke implementation, provider readiness changes, and follow-up failure fixes in one commit.
- Commit only after required validation passes or after a failure is clearly attributed and the checkpoint is rolled back.
- Suggested first commit: `Plan real main path evidence track`.
- If push fails due to auth, network, permissions, or policy, do not bypass. Record commit hash, failure reason, and current git status.

## 15. Current Recommended First Checkpoint

Current checkpoint:

- `Plan real main path evidence track`

Scope:

- Create this plan.
- Do not implement a smoke harness.
- Do not run real-provider checks.
- Do not touch production code.

Next recommended checkpoint:

- `CLI default/live-ish turn smoke planning`

Reason:

- Existing `GOLDEN_MAIN_PATH` already has synthetic live-ish interactive shape.
- Existing CLI and verify scripts contain useful pieces, but the evidence is scattered.
- The next checkpoint should decide whether to reuse existing CLI baseline structure or create a tiny dedicated harness before any real-provider promotion.

Default stop condition for the next checkpoint:

- If the work starts requiring provider/auth changes, fake live TTY behavior, broad result taxonomy changes, durable session policy changes, or complete runMvp old-failure cleanup, stop and update this plan instead of implementing.
