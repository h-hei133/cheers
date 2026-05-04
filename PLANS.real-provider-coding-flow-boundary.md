# Real Provider Coding Flow Boundary

## 1. Goal

Advance from real-provider read-only smoke to a guarded minimum coding-flow capability boundary. The route defines and self-tests how a real model turn may edit an isolated fixture workspace without mutating the target repository or leaking provider secrets.

## 2. Current Branch

`real-provider-coding-flow-boundary`

## 3. Why This Route

WSL test path compatibility, Linux release/script compatibility, release-core on WSL, real-provider preflight, and real read-only coding smoke are already established on `main`. The next main-path risk is whether a real provider can complete a low-risk coding task with credible changed-files, terminal-result, verification, redaction, and follow-up context boundaries.

## 4. Difference From Read-Only Smoke

Read-only smoke proves that the provider can inspect a temporary project and surface a success result with no file changes. Coding-flow smoke must prove that writes are confined to a fixture, only expected fixture files change, protected files remain unchanged, verification is visible, and the real repository remains clean.

## 5. Real Provider Safety Boundary

- Windows real-provider home remains `D:/Test/home-sf`.
- Linux/WSL real-provider home requires explicit `PRIVATE_AGENTS_REAL_HOME`.
- The route must not read, copy, print, modify, clean, or inspect provider config content.
- No API key, token, header, auth JSON, provider config, or config file content may be printed.
- Default `verify-real-user-capabilities` must not be run for this route.

## 6. Fixture Workspace Rules

- Fixture workspaces are created under `PRIVATE_AGENTS_TEST_ROOT` or the platform test root.
- Linux/WSL default test root is `/tmp/private-agents-test`.
- The target repository is never used as a mutation workspace.
- Real-provider home is never used as a fixture workspace.
- The first fixture uses `note.txt` as the only editable file and `README.md` plus `LOCKED.md` as protected files.
- The expected coding task changes `status: draft` to `status: ready` in `note.txt`.
- Smoke cleanup must refuse non-fixture directories.

## 7. Provider Failure Attribution

Provider/network/auth/model failures are attribution outcomes, not automatic product regressions. The smoke must keep fixture setup, no-mutation guard, redaction, terminal-result, changed-files, verification, provider-network, auth/config, model/quota, and product-runtime failures separate.

## 8. Redaction Rules

Output must be checked for bearer tokens, OpenAI-style keys, API keys, access tokens, refresh tokens, ID tokens, authorization fields, secret query parameters, and `.private-agents/config.json` paths before surfacing failure details.

## 9. Allowed Files

- `scripts/verify-real-user-capabilities.mjs`
- `scripts/real-provider-coding-fixture.mjs`
- `scripts/real-provider-coding-redaction.mjs`
- `scripts/real-provider-coding-smoke.design.md`
- `scripts/support/testPaths.mjs`
- `scripts/support/scriptRuntime.mjs`
- `packages/ts-shell/src/test-utils/*`

## 10. Forbidden Files And Scope

- Do not modify provider/auth core.
- Do not continue Linux path compatibility.
- Do not continue legacy-root proof work.
- Do not modify `packages/ts-shell/src/entrypoints/cli.tsx`, `packages/ts-shell/src/session/SessionManager.ts`, or `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` unless a future checkpoint proves script-layer verification cannot work.
- Do not add real-provider coding smoke to default gates.
- Do not implement full apply-patch, multi-file edit, AST patch, or rollback.

## 11. Reference Implementation Constraints

Claude Code and opencode were inspected only for semantics. The route follows their separation of read vs. write tools, structured tool results, explicit permission decisions, workspace/directory authority, and terminal/failure surface separation. No reference code is copied.

## 12. Checkpoint Backlog

- A. Real-provider coding flow boundary audit. Completed.
- B. Fixture design for real-provider coding flow. Completed.
- C. Preflight-only coding flow self-test. Completed.
- D. Opt-in real-provider minimal coding smoke. Completed.
- E. Failure attribution for real coding flow.
- F. Follow-up context for real coding failure.
- G. Route audit / merge readiness.

## 13. Current Checkpoint

D implemented in this route checkpoint:

- Added explicit opt-in `--real-coding-flow-smoke`.
- The smoke creates an isolated coding fixture outside the repository and real-provider home.
- The only expected fixture mutation is `note.txt`; `README.md` and `LOCKED.md` remain protected.
- The smoke checks repository cleanliness before and after the model turn.
- The smoke attributes provider readiness, auth/config, model, redaction, terminal-result, changed-files, verification, and repository mutation failures separately.
- The smoke remains excluded from default gates and was not run in this checkpoint.

No real-provider write smoke was run.

Current checkpoint is E: Failure attribution for real coding flow.

## 14. Validation Commands

- `rtk npm run build -w packages/ts-shell`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:result-contract`
- `PRIVATE_AGENTS_SYNTHETIC_HOME=/tmp/pca-home-synth PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test rtk npm run verify:cli-entry`
- `HOME=/tmp/pca-home-synth USERPROFILE=/tmp/pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path`
- `rtk node scripts/real-provider-coding-fixture.mjs --self-test`
- `rtk node scripts/real-provider-coding-redaction.mjs --self-test`
- `rtk node scripts/verify-real-user-capabilities.mjs --help`
- `rtk node scripts/verify-real-user-capabilities.mjs --real-coding-flow-dry-run`

## 15. Failure Attribution Rules

- `provider-network-inconclusive`
- `auth/config failure`
- `model/quota/rate-limit failure`
- `fixture setup failure`
- `no-mutation guard failure`
- `real repo mutation leak`
- `redaction failure`
- `terminal result missing`
- `changedFiles wrong`
- `verification failed`
- `product runtime regression`
- `RTK/environment issue`

## 16. RTK/Audit Residue Rule

Before commit, ensure no `.sisyphus/audit/permissions.jsonl`, `packages/ts-shell/.sisyphus/audit/permissions.jsonl`, or `rtk/history.db` residue is committed.

## 17. Next Step

Next checkpoint E should tighten real coding flow failure attribution around `--real-coding-flow-smoke` without running real provider by default and without reading or printing provider config.
