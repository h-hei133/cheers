# WSL / Linux Test Path Compatibility

## 1. Goal

Make the project verification scripts support Windows default test paths, Linux/WSL default test paths, and environment-variable overrides without changing product runtime behavior or real-provider safety boundaries.

This directly supports the user-minimal main path by making the CLI and terminal-result validation gates runnable in a clean WSL/Linux development environment.

## 2. Current Branch

`wsl-test-path-compatibility`

## 3. WSL Target Repository Path

`/home/wang/projects/coding-agents`

## 4. Reference Repository Paths

- Claude Code reference: `/home/wang/projects/source-claudecode`
- Opencode reference: `/home/wang/projects/opencode`

No reference repository files are modified.

## 5. Background Problem

On WSL/Linux, `verify:result-contract` and related gates could fail before exercising product behavior because they expected Windows-only fixture paths such as `D:/Test/pca-home-synth`.

The target behavior is path compatibility for synthetic/test/fixture homes only.

## 6. Windows Default Path Strategy

Windows defaults remain:

- Synthetic home: `D:/Test/pca-home-synth`
- Test root: `D:/Test`
- CLI entry gate root: `D:/Test/cli-entry-gate`
- Real provider home: `D:/Test/home-sf`

## 7. Linux/WSL Default Path Strategy

Linux/WSL defaults are:

- Synthetic home: `/tmp/pca-home-synth`
- Test root: `/tmp/private-agents-test`
- CLI entry gate root: `/tmp/private-agents-test/cli-entry-gate`

Linux/WSL does not default real-provider home to `/mnt/d/Test/home-sf`.

## 8. Environment Override Strategy

- `PRIVATE_AGENTS_SYNTHETIC_HOME` overrides synthetic home.
- `PRIVATE_AGENTS_TEST_ROOT` overrides test/fixture root.
- `PRIVATE_AGENTS_CLI_ENTRY_GATE_ROOT` overrides only the CLI entry root.
- `PRIVATE_AGENTS_REAL_HOME` is the only Linux/WSL real-provider home opt-in.

## 9. Real-Provider Home Safety Rules

- Do not read, copy, print, modify, or clean real auth/key/provider configuration.
- Do not run default `verify-real-user-capabilities`.
- Do not run real-provider smoke in this round.
- Linux/WSL real provider home is unconfigured unless `PRIVATE_AGENTS_REAL_HOME` is set.
- Real provider home must never be mixed with synthetic/test homes.

## 10. Path Audit Classification

### Runtime Path Hardcoding

- Production home resolution uses `HOME`, `USERPROFILE`, and `os.homedir()` in TS shell runtime/config/session areas.
- No production CLI/session/runMvp behavior is changed in this round.

### Verify Script Test Path Hardcoding

Changed in scope:

- `scripts/verify-result-contract.mjs`
- `scripts/verify-cli-entry.mjs`
- `scripts/verify-real-user-capabilities.mjs`

Deferred unless directly blocking:

- `scripts/verify-provider-readiness.mjs`
- `scripts/verify-release-core.mjs`
- `scripts/verify-release-smoke.mjs`
- `scripts/verify-release-real.mjs`

### Test Fixture Root Hardcoding

Deferred broader fixture scripts include:

- `scripts/broader-regression.mjs`
- `scripts/comprehensive-regression.mjs`
- `scripts/daily-regression.mjs`
- `scripts/delta-regression.mjs`
- `scripts/delta-nightly.mjs`

### Real Provider Home Constraints

Real-provider home references are retained as safety boundaries and redaction samples where they do not drive WSL/Linux default runtime access.

### Documentation / Historical Records

Existing `PLANS.*.md` and `RUNBOOK.md` Windows path records are historical and are not rewritten.

### Test Assertion Samples

Windows path examples in redaction/self-test cases stay unless they are used as active runtime fixture roots.

### Not Needed To Modify

- Provider/auth core
- CLI/session/runMvp production behavior
- Windows EBUSY handling
- Full old integrated-flow failures

## 11. This Round Modification Scope

- Add `scripts/support/testPaths.mjs`.
- Wire only `verify-result-contract`, `verify-cli-entry`, and safe path portions of `verify-real-user-capabilities`.
- Keep broader release/regression scripts audit-only unless validation proves one is the immediate blocker.

## 12. Explicit Non-Goals

- Do not globally replace `D:/Test` or `D:\Test`.
- Do not modify historical plan records.
- Do not default Linux/WSL to `/mnt/d/Test/home-sf`.
- Do not run real provider smoke.
- Do not change product runtime behavior.

## 13. Validation Commands

Use RTK:

```bash
rtk git status --short
rtk npm run build -w packages/ts-shell
PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:result-contract
PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:cli-entry
PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk node scripts/verify-real-user-capabilities.mjs --failure-followup-context-dry-run
PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk node scripts/verify-real-user-capabilities.mjs --real-readonly-coding-dry-run
PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk node scripts/verify-real-user-capabilities.mjs --real-readonly-coding-failure-attribution-self-test
HOME=/tmp/pca-home-synth USERPROFILE=/tmp/pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path
```

## 14. Failure Attribution Rules

Classify failures before expanding scope:

- helper wiring bug
- Linux path bug
- RTK issue
- missing dependency
- test assumes Windows path
- existing product regression
- environment/network issue

## 15. RTK / Audit Residue Rules

Clean or restore generated residue before final commit:

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`

If RTK itself rewrites audit files during status/restore checks, use the smallest raw git check only to confirm cleanup and state the reason.

## 16. Backlog

- Consider second-batch release/regression script path compatibility only after the first-batch gates are stable.
- Consider docs/runbook refresh only after behavior is validated and branch is merged.
- Keep real provider WSL opt-in evidence separate from synthetic/test path compatibility.

## 17. Current Checkpoint

- Branch created from `main`.
- Pre-existing modified `package-lock.json` remains unrelated and untouched.
- Helper added.
- First-batch scripts wired for synthetic/test path compatibility.
- Real provider home was not read or used for smoke execution.
- `rtk npm run build -w packages/ts-shell` passed.
- `verify:result-contract` passed with WSL override paths outside the sandbox; sandbox run hit `tsx` IPC `EPERM`.
- `verify:cli-entry` passed with WSL override paths outside the sandbox; sandbox run hit `tsx` IPC `EPERM`.
- Real-user-capabilities dry-run/self-test commands passed and reported `homeRead=false`.
- Golden main path gate passed outside the sandbox; sandbox run timed out at the test's 45s internal limit.
- RTK audit JSONL residue was restored; `rtk/history.db` is tracked and unchanged.
