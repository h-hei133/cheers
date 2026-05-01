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

Status: completed.

Result:

- Existing `packages/ts-shell/src/cli-baseline.test.ts` contains `GOLDEN_MAIN_PATH: user-minimal real main path unified gate`.
- That gate launches the default CLI, waits for the startup prompt, sends a first prompt, observes persisted query completion in the transcript, sends a follow-up prompt, and verifies terminal state persistence.
- It is synthetic, live-ish, and non-print, with actual child-process stdin/stdout, session persistence, transcript evidence, startup surface checks, unreadable-session aggregation checks, and follow-up turn evidence.
- Existing `scripts/live-interactive-runner.mjs` is a manual real TTY launcher, not an automation harness; it intentionally rejects non-TTY and `--print`.
- Existing `scripts/verify-cli-entry.mjs` covers packaged/print/replay/stdin entry boundaries, but it is non-interactive and does not replace the default live-ish turn gate.
- Existing default real-provider mock coverage proves provider-readiness and stopped persistence boundaries without touching `D:\Test\home-sf`, but it is not a real-provider coding-flow maturity signal.

Decision:

- Do not add a new live-ish harness in this checkpoint.
- Reuse `GOLDEN_MAIN_PATH` as the current automated default/live-ish evidence baseline.
- Move next work to `CLI --print real-ish tool execution smoke`, because `--print` is the safer next real-entry surface for full tool execution -> result block -> next action evidence.

### B. CLI `--print` real-ish tool execution smoke

Goal: validate the full surface of tool execution -> result block -> next action, not only a single read/write marker.

Status: completed.

Result:

- Added `cli-entry-print-tool-execution-surface` to `scripts/verify-cli-entry.mjs`.
- The smoke runs the real CLI entry in synthetic `--print` mode against the existing fixture project.
- It creates `cli-entry-tool-execution.txt`, asserts the structured user-visible chain (`Result`, `Outcome: success`, `Action result`, `Task: write-file`, changed-file marker, verification detail, and next action), and checks the file content on disk.
- It does not access `D:\Test\home-sf` or real-provider configuration.

### C. Non-interactive approval boundary smoke

Goal: prove approval-required work in non-interactive or print mode does not silently execute and does not emit a misleading terminal state.

Status: completed.

Result:

- Added `cli-entry-non-interactive-approval-boundary` to `scripts/verify-cli-entry.mjs`.
- The smoke runs synthetic CLI `--print` for `Run node --version` without `--non-interactive-approval`.
- It asserts the approval surface, default-deny source, non-interactive audit decision, stopped result, approval-denied blocker, run-command action result, and approval summary.
- It asserts no `approval> ` interactive prompt leaks and the denied command does not report `Outcome: success`.
- It does not access `D:\Test\home-sf` or real-provider configuration.

### D. Failed tool execution follow-up smoke

Goal: prove failed tool execution produces a clear user-visible result, actionable repair guidance, and stable follow-up semantics.

Status: completed.

Result:

- Added `cli-entry-failed-tool-followup-surface` to `scripts/verify-cli-entry.mjs`.
- The smoke runs synthetic CLI `--print` with `--non-interactive-approval allow-once` for a command request that reaches tool execution and fails after approval.
- It asserts the allowed approval provenance, stopped result, `verification-failed` blocker, run-command action result, failed command evidence, verification detail, next action, next steps, and approval summary.
- It asserts no `approval> ` interactive prompt leaks and failed execution does not report `Outcome: success`.
- It does not access `D:\Test\home-sf` or real-provider configuration.

### E. Provider readiness + real-provider safe smoke

Goal: verify provider readiness failure classification without leaking auth details and keep real-provider sanity clearly separate from synthetic gates.

Status: current; must not run by default.

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
- `scripts/verify-cli-entry.mjs` when the checkpoint is implemented as a real CLI entry hard-gate smoke.
- `PLANS.real-main-path-evidence.md`

Validation:

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts
rtk npm run verify:result-contract
rtk npm run verify:cli-entry
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

- `Provider readiness + real-provider safe smoke`

Scope:

- Verify provider readiness failure classification without leaking auth details and keep real-provider sanity clearly separate from synthetic gates.
- Prefer synthetic/provider-readiness unit coverage first; real-provider checks remain explicit and opt-in.
- Do not touch provider/auth, MCP, release-core, QueryEngine/queryLoop, or terminalClassification.

Completed checkpoint:

- `Failed tool execution follow-up smoke`
  - Added `cli-entry-failed-tool-followup-surface` to `scripts/verify-cli-entry.mjs`.
  - Proves approved tool execution can still stop with a clear failed result, command failure evidence, verification detail, next action, and next steps.
  - Does not use real-provider home.
- `Non-interactive approval boundary smoke`
  - Added `cli-entry-non-interactive-approval-boundary` to `scripts/verify-cli-entry.mjs`.
  - Proves synthetic print-mode approval-required command defaults to deny, emits non-interactive audit, stops with `approval-denied`, and does not leak an interactive prompt.
  - Does not use real-provider home.
- `CLI --print real-ish tool execution smoke`
  - Added `cli-entry-print-tool-execution-surface` to `scripts/verify-cli-entry.mjs`.
  - Proves tool execution -> structured result block -> changed file evidence -> next action via synthetic `--print`.
  - Does not use real-provider home.
- `CLI default/live-ish turn smoke planning`

Evidence:

- Existing `GOLDEN_MAIN_PATH` already has synthetic live-ish interactive shape.
- It covers default child-process launch, startup prompt readiness, stdin-driven first turn, transcript-observed completion, stdin-driven follow-up turn, terminal state persistence, and startup/session surface markers.
- No new harness was needed for the planning checkpoint.

Next recommended checkpoint:

- `Provider readiness + real-provider safe smoke`

Reason:

- The print tool execution, non-interactive approval boundary, and failed tool result surface are now covered by `verify-cli-entry`.
- The next highest real-entry risk is provider readiness classification and ensuring real-provider smoke remains explicit, safe, and non-leaky.
- The checkpoint must not read, print, copy, or mutate real auth/key/provider configuration unless it explicitly runs the existing opt-in real-provider readiness smoke.

Default stop condition for the next checkpoint:

- If the work starts requiring provider/auth changes, fake live TTY behavior, broad result taxonomy changes, durable session policy changes, or complete runMvp old-failure cleanup, stop and update this plan instead of implementing.

## 16. Evidence Track Status

### Completed

- `Plan real main path evidence track`
  - Commit: `fcbf038 Plan real main path evidence track`
  - Files: `PLANS.real-main-path-evidence.md`
  - Verification:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell` (sandbox EPERM on first run; elevated RTK rerun passed)
- `CLI default/live-ish turn smoke planning`
  - Commit: recorded in final status for this checkpoint.
  - Files: `PLANS.real-main-path-evidence.md`
  - Production code changes: none.
  - Evidence reviewed:
    - `packages/ts-shell/src/cli-baseline.test.ts` `GOLDEN_MAIN_PATH`
    - default CLI real-provider mock/stopped persistence smoke
    - approval allow/deny live-ish synthetic evidence
    - `scripts/live-interactive-runner.mjs`
    - `scripts/verify-cli-entry.mjs`
  - Verification:
    - `rtk git status --short` passed with only this plan file modified.
    - `rtk npm run build -w packages/ts-shell` hit sandbox EPERM writing `dist`, then passed with the same RTK command outside the sandbox.
- `CLI --print real-ish tool execution smoke`
  - Commit: recorded in final status for this checkpoint.
  - Files:
    - `scripts/verify-cli-entry.mjs`
    - `PLANS.real-main-path-evidence.md`
  - Production shell/runtime changes: none.
  - Evidence added:
    - `cli-entry-print-tool-execution-surface` runs CLI `--print` through the real entry script in synthetic mode.
    - It checks structured output markers and verifies the requested file was actually written.
  - Verification:
    - `rtk git status --short` passed with only `scripts/verify-cli-entry.mjs` and this plan modified.
    - `rtk npm run build -w packages/ts-shell` hit sandbox EPERM writing `dist`, then passed with the same RTK command outside the sandbox.
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"` hit sandbox esbuild spawn EPERM, then passed outside the sandbox: 4 passed, 30 skipped.
    - `rtk npm run verify:cli-entry` hit sandbox EPERM writing `D:\Test\cli-entry-gate\fixture.txt`, then passed outside the sandbox, including `[pass] cli-entry-print-tool-execution-surface`.
- `Non-interactive approval boundary smoke`
  - Commit: recorded in final status for this checkpoint.
  - Files:
    - `scripts/verify-cli-entry.mjs`
    - `PLANS.real-main-path-evidence.md`
  - Production shell/runtime changes: none.
  - Evidence added:
    - `cli-entry-non-interactive-approval-boundary` runs CLI `--print` through the real entry script in synthetic mode.
    - It checks default-deny approval rendering, non-interactive audit provenance, stopped terminal surface, `approval-denied` blocker, and absence of interactive prompt leakage.
  - Verification:
    - `rtk git status --short` passed with `scripts/verify-cli-entry.mjs`, this plan, and generated audit residue modified.
    - `rtk npm run build -w packages/ts-shell` hit sandbox EPERM writing `dist`, then passed with the same RTK command outside the sandbox.
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "approval"` hit sandbox esbuild spawn EPERM, then passed outside the sandbox: 4 passed, 30 skipped.
    - `rtk npm run verify:cli-entry` hit sandbox EPERM writing `D:\Test\cli-entry-gate\fixture.txt`, then passed outside the sandbox, including `[pass] cli-entry-non-interactive-approval-boundary`.
- `Failed tool execution follow-up smoke`
  - Commit: recorded in final status for this checkpoint.
  - Files:
    - `scripts/verify-cli-entry.mjs`
    - `PLANS.real-main-path-evidence.md`
  - Production shell/runtime changes: none.
  - Evidence added:
    - `cli-entry-failed-tool-followup-surface` runs CLI `--print` through the real entry script in synthetic mode with explicit non-interactive allow-once.
    - It checks stopped failed-tool result, `verification-failed` blocker, failed command evidence, verification detail, next action, next steps, and absence of success/interactive prompt leakage.
  - Verification:
    - `rtk git status --short` passed with `scripts/verify-cli-entry.mjs`, this plan, and generated audit residue modified.
    - `rtk npm run build -w packages/ts-shell` hit sandbox EPERM writing `dist`, then passed with the same RTK command outside the sandbox.
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"` hit sandbox esbuild spawn EPERM, then passed outside the sandbox: 4 passed, 30 skipped.
    - `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts` hit sandbox esbuild spawn EPERM, then passed outside the sandbox: 29 passed.
    - `rtk npm run verify:result-contract` passed outside the sandbox.
    - `rtk npm run verify:cli-entry` passed outside the sandbox, including `[pass] cli-entry-failed-tool-followup-surface`.

### Current

- `Provider readiness + real-provider safe smoke`
  - Target: verify provider readiness failure classification without leaking auth details and keep real-provider sanity separate from synthetic gates.
  - Default scope: no real-provider run unless explicitly selected; prefer provider-readiness tests and script review first.
  - Preferred starting point: `packages/ts-shell/src/core/shell/providerReadiness.test.ts` and `scripts/verify-provider-readiness.mjs`.

### Backlog

- CLI stopped/failure follow-up real path smoke.
- Compact / long-session smoke design.

### Notes

- `GOLDEN_MAIN_PATH` is the current automated default/live-ish turn baseline. It is not a real TTY proof and should not be oversold as real-provider maturity.
- `scripts/live-interactive-runner.mjs` remains manual because it requires real stdin/stdout TTY and intentionally rejects `--print`.
- Real-provider evidence must stay explicit and opt-in; do not read or print credential material from `D:\Test\home-sf`.
