# Real-Provider Read-Only Coding Evidence

## 1. 总目标

建立一条显式 opt-in 的 real-provider read-only coding flow evidence 路线，用于证明真实 provider 可以在安全边界内完成 read / inspect / summarize 类 coding task，并把成功、失败、终端结果、无写入 contract 和 redaction 结果清楚呈现。

本路线直接服务 user-minimal real main path:

- Step 3: 用户输入真实任务后进入统一 query loop。
- Step 4: 系统使用真实模型和真实工具链，但本路线只允许 read-only inspection，不做 edit/write/mutation。
- Step 5: 系统输出清楚 terminal state；真实 provider 的 network/auth/config/model failure 必须可归因。
- Step 6: 失败或停止后的下一步必须可行动，且不能污染真实 provider home。

本路线默认不运行真实 provider smoke；真实 provider 只允许在后续明确 opt-in checkpoint 中使用。

## 2. 当前分支

```text
real-provider-readonly-coding-evidence
```

从当前本地 `main` 创建。分支创建前确认:

```text
main...origin/main [ahead 8]
HEAD: 012feb8 Record PTY strategy post-merge verification
```

## 3. base/main 状态

分支 base 为本地 `main`:

```text
012feb8 Record PTY strategy post-merge verification
```

重要状态:

- 本地 `main` clean。
- 本地 `main` ahead `origin/main` by 8。
- 不得 reset、rebase、drop 或覆盖这些本地提交。
- 上一条 `pty-strategy-capability-boundary` 路线已阶段性封口，`origin/pty-strategy-capability-boundary` 包含 `4b7b41f`。
- PowerShell profile warning 是当前环境噪音，除非实际阻塞命令，否则不作为产品失败。

## 4. 背景审查结论

此前已经完成或阶段性收口:

- `main-path-boundaries`: 三大巨型文件第一轮边界治理。
- `real-main-path-evidence`: CLI / real-ish main path evidence。
- `long-session-continuity-hardening`: compact / replay / resume / continue continuity。
- `real-provider-safe-evidence`: real-provider safety attribution / redaction / dry-run evidence。
- `live-tty-interactive-evidence`: pipe-spawn interactive evidence。
- `pty-strategy-capability-boundary`: pipe-spawn 不等于 true PTY，true PTY 继续前需要 strategy / dependency approval。
- `approval-tool-provenance-contract`: approval/tool execution provenance contract 已封口。

当前缺口: real-provider-safe 路线主要证明 failure attribution / redaction，不证明真实 provider 能完成 read-only coding task。

## 5. 为什么选择 real-provider opt-in read-only coding flow

当前 synthetic main path、CLI entry、result contract、provider readiness、redaction、failure follow-up 已较稳。剩余真实用户风险是: 成功路径上真实 provider 是否能在不写入、不泄露、不污染 real home 的前提下完成最小 read-only coding flow。

选择 read-only opt-in 的原因:

- 比 edit/write 更接近当前安全边界，可先证明 model turn + query loop + terminal result。
- 可以用 changedFiles empty / fixture hash / read-only no-mutation contract 明确证明无写入。
- 网络、认证、配置、模型失败可以被分类为外部或配置状态，而不是自动算产品逻辑回归。
- 不把 synthetic golden 包装成 real-provider 成熟证据。

## 6. 明确不做的方向

- 不新增 provider，不改 auth core。
- 不读取、复制、打印、修改、清理或泄露真实 auth/key/provider 配置。
- 不默认运行 real-provider smoke 或 `verify-real-user-capabilities`。
- 不执行 edit/write/tool mutation。
- 不把 real-provider network 波动误判为产品回归。
- 不处理 Windows EBUSY。
- 不修 `runMvpIntegratedFlow` 全量旧失败。
- 不做完整 apply_patch、AST patch、rollback、batch engine、stream mid-flight retry、全局网络重试。
- 不继续 provider readiness dry-run、PTY、long-session、approval/tool provenance、edit/patch marker、verification surface 同族 proof，除非来自本路线 read-only coding flow 缺口。
- 不把 synthetic golden 通过包装成 real-provider 成熟证据。
- 不为了减少行数而拆三大巨型文件。

## 7. 环境约束

目标仓库:

```text
D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents
```

参考仓库只读:

```text
D:\LenovoSoftstore\pyproject\source-claudecode
D:\LenovoSoftstore\pyproject\opencode
```

默认验证只允许使用:

```text
D:\Test\pca-home-synth
PRIVATE_AGENTS_PROVIDER_MODE=synthetic
```

失败态或隔离验证只能使用 synthetic/test home 或临时 test home。不得污染 `D:\Test\home-sf`。

## 8. 真实 provider 安全约束

`D:\Test\home-sf` 是 real-provider runtime home，只能在后续明确 opt-in checkpoint 中使用。

硬性边界:

- 默认验证不得使用 `D:\Test\home-sf`。
- 不得读取、打印、复制、修改、清理真实 auth/key/provider 配置。
- 不得输出 auth header、token、key、provider config path detail、real home config detail。
- 后续 opt-in smoke 只能用 read-only fixture workspace，不得写真实 workspace。
- opt-in smoke 失败时只做归因，不自动视为产品回归。
- 输出 tail、report、error、next action 必须经过 redaction 检查。

## 9. 参考实现约束

目标仓库优先；参考仓库只做小范围语义对照，不照抄代码。

目标仓库 grounding files:

- `AGENTS.md`
- `scripts/verify-real-user-capabilities.mjs`
- `scripts/verify-provider-readiness.mjs`
- `packages/ts-shell/src/core/shell/providerReadiness.ts`
- `packages/ts-shell/src/core/shell/providerFailureRedaction.ts`
- `packages/ts-shell/src/core/shell/providerReadiness.test.ts`
- `packages/ts-shell/src/cli-baseline.test.ts`
- `package.json`

Claude Code semantic reference:

- `QueryEngine.ts`
- `query.ts`
- `commands.ts`
- `cli/print` or structured output related files
- provider/model request/error handling related files
- `tools/FileReadTool/*`
- `tools/FileEditTool/*`
- permission / tool result related files

opencode semantic reference:

- `packages/opencode/src/cli/cmd/run.ts`
- provider/model related files
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/read.ts`
- `packages/opencode/src/tool/bash.ts`
- `packages/opencode/src/permission/permission.ts`
- `packages/opencode/src/acp/agent.ts`

Absorb only semantic boundaries:

- real provider / model failure presentation.
- read-only inspect vs edit/write separation.
- auth/network/config failure attribution.
- secret and provider detail redaction.
- CLI run/print result and next action surfaces.

## 10. 三大巨型文件新增代码约束

The three large files are not absolutely forbidden, but this route should not touch them during planning:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

Later route helpers should prefer:

- `scripts/*`
- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/core/query/*`
- `packages/ts-shell/src/config/*`
- `packages/ts-shell/src/test-utils/*`
- `packages/ts-shell/src/model-adapters/*`

Only modify the three large files if the behavior truly belongs to entry wiring, durable session state, or main orchestration sequencing. If that happens, checkpoint notes must explain why the logic cannot live in a clearer helper module.

## 11. 当前已闭合能力

Current closed or stage-sealed capabilities:

- packaged CLI and `--print` / stdin boundary.
- synthetic golden main path.
- result/failure terminal contract.
- provider readiness and provider failure redaction.
- real-provider-safe attribution dry-runs.
- long-session compact / replay / resume continuity.
- approval/tool execution provenance internal contract.
- pipe-spawn interactive startup, slash command, stopped follow-up, print boundary, EOF close smoke.
- PTY strategy/capability boundary; pipe-spawn is not true PTY.

These prove many default and synthetic surfaces, but not a successful real-provider read-only coding task.

## 12. 当前主要风险

- Real provider may fail because of external network, auth, config, quota, endpoint, or model availability.
- A real-provider failure must not be reported as product regression unless local logic caused it.
- Output may accidentally include token/header/key/path/provider detail if redaction is incomplete.
- Read-only task could accidentally execute a write-capable tool or mutate workspace/session state beyond expected artifacts.
- Existing `verify-real-user-capabilities.mjs` has dry-run flags, but no dedicated real read-only coding opt-in flag yet.
- `changedFiles` / report checks exist, but read-only no-mutation evidence needs a focused contract.
- Default CI must remain synthetic and stable; real provider opt-in must be skipped unless explicitly requested.

## 13. real-provider read-only coding flow coverage boundary

This route may prove:

- explicit opt-in real-provider preflight and model turn.
- read/inspect/summarize task over a small safe fixture workspace.
- terminal result surface for real-provider success, stopped, or failure.
- `changedFiles` empty and no fixture mutation.
- redacted output and safe failure attribution.
- no default use of real-provider smoke.

This route must not claim:

- edit/write tool maturity.
- mutation safety for arbitrary workspaces.
- true PTY behavior.
- provider reliability across networks or accounts.
- synthetic golden as real-provider evidence.

## 14. opt-in / skip / attribution 规则

Default behavior:

- Do not run real provider.
- Use synthetic/test home only.
- Real-provider smoke must be skipped unless an explicit opt-in flag is present.

Future opt-in flag should be explicit, for example:

```text
--real-readonly-coding-smoke
```

Future opt-in run must print:

- mode and opt-in status.
- that external network/auth/model failure is attribution, not automatic product regression.
- that real auth/key/provider config will not be read, printed, modified, or cleaned.
- that only read-only fixture workspace is in scope.

Failure categories must include at least:

- auth/config failure.
- network/provider unavailable.
- model unsupported or quota/rate limited.
- product regression.
- inconclusive external failure.

## 15. secret / path / provider detail redaction 规则

All real-provider output, report tails, error strings, and next-action text must avoid:

- bearer tokens.
- API keys.
- refresh/access tokens.
- auth headers.
- provider config raw paths or file contents.
- `D:\Test\home-sf` config detail.
- credential-like URL query params.

Existing helpers to reuse or audit:

- `packages/ts-shell/src/core/shell/providerFailureRedaction.ts`
- `scripts/verify-provider-readiness.mjs` redaction routines.
- `scripts/verify-real-user-capabilities.mjs` redaction routines.

Redaction tests must assert both positive replacement markers and negative absence of original secret-like samples.

## 16. 路线分阶段 backlog

Current:

- A. Real-provider read-only flow audit
  - Type: read-only audit / planning checkpoint.
  - Goal: audit existing real-provider scripts, readiness, runtime config, CLI entry, session runtime, and redaction capability without running real provider.

Backlog:

- B. Opt-in flag design
- C. Safe workspace fixture
- D. Redaction assertion helper
- E. Dry-run contract for real read-only smoke
- F. Opt-in real-provider readiness preflight
- G. Opt-in real-provider read-only model turn
- H. Real-provider failure attribution in read-only flow
- I. Route audit / merge readiness

Completed:

- Planning: created `PLANS.real-provider-readonly-coding.md` from current local `main`.
- A. Real-provider read-only flow audit
  - Result: completed as a read-only audit / planning checkpoint.
  - Files changed:
    - `PLANS.real-provider-readonly-coding.md`
  - Target audit findings:
    - `scripts/verify-real-user-capabilities.mjs` already separates `syntheticHome` (`D:/Test/pca-home-synth`) and `realHome` (`D:/Test/home-sf`), computes changed files from before/after snapshots, writes reports, classifies provider readiness failures, and has dry-run modes for turn boundary, terminal result surface, tool execution planning, and failure follow-up context.
    - Existing real-provider scenarios in `verify-real-user-capabilities.mjs` and real-mode focused tests are edit/write oriented; there is no dedicated read-only real-provider coding opt-in flag yet.
    - `scripts/verify-provider-readiness.mjs` already performs real-provider readiness smoke and redacts output, but it reads real provider config as part of its explicit smoke path and is not suitable as a default gate.
    - `packages/ts-shell/src/core/shell/providerFailureRedaction.ts` provides reusable redaction for bearer tokens, key/value secrets, query-param secrets, OpenAI-style keys, and real/private agent config paths.
    - `packages/ts-shell/src/core/shell/providerReadiness.ts` classifies missing key/config, unsupported provider, auth, network, and unknown readiness failures with redacted unknown details.
    - `packages/ts-shell/src/config/runtimeConfig.ts` reads user config from HOME/USERPROFILE/private override, so future opt-in real-provider checkpoints must be careful to use `D:\Test\home-sf` only as runtime home and never print/read raw config content in evidence.
    - `packages/ts-shell/src/core/shell/sessionRuntime.ts` already renders read/inspect-only evidence when read files are present and `changedFiles` / `failedFiles` are empty.
    - `packages/ts-shell/src/core/query/resultMapper.ts` and `packages/ts-shell/src/orchestration/types.ts` already expose `changedFiles` as a result contract field that can anchor read-only no-mutation checks.
  - Reference audit findings:
    - Claude Code query/result flow keeps tool results and terminal result semantics distinct; this route should preserve that boundary rather than adding ad hoc output parsing as proof.
    - opencode read/edit/tool layering separates read permission from edit/bash paths; this route should model read-only evidence as read/inspect/summarize only, not as a write-capable smoke with protected files.
  - Boundary result:
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or printed from local filesystem; it was only referenced as a literal boundary in existing source text and the plan.
    - No production code, provider/auth core, dependency manifest, lockfile, or three-large-file target was modified.
- B. Opt-in flag design
  - Result: completed as a design-only checkpoint.
  - Files changed:
    - `scripts/real-provider-readonly-coding-smoke.design.md`
    - `PLANS.real-provider-readonly-coding.md`
  - Design decision:
    - The future explicit opt-in flag is `--real-readonly-coding-smoke`.
    - Default behavior must not run a real provider model turn, must not use `D:/Test/home-sf`, and must report skip/deferred semantics if queried by dry-run/report logic.
    - Opt-in behavior must print a risk/attribution notice before preflight, use `D:/Test/home-sf` only as runtime home, run only read/inspect/summarize prompts against a temporary fixture, assert before/after fixture equality, require `changedFiles` empty, and redact all output/report fields.
    - Future help text must state that the smoke is opt-in, read-only, excluded from default verification, and that external provider failures are attribution outcomes.
  - Boundary result:
    - No script flag implementation was added.
    - No real provider smoke was run.
    - No fixture, redaction helper, production CLI behavior, provider/auth core, dependency manifest, lockfile, or three-large-file target was modified.
- C. Safe workspace fixture
  - Result: completed as a script-helper checkpoint.
  - Files changed:
    - `scripts/real-provider-readonly-fixture.mjs`
    - `PLANS.real-provider-readonly-coding.md`
  - Implementation:
    - Added a temporary fixture helper that creates harmless text files under a temp directory, outside `D:\Test\home-sf`.
    - Added a read-only prompt builder that instructs the model to read/inspect/summarize only, not edit, create, delete, rename, rewrite, or run shell commands.
    - Added fixture snapshot and snapshot comparison helpers based on file hashes so future opt-in smoke can prove no mutation.
    - Added cleanup guard that refuses to clean non-fixture directories and refuses to use real-provider home.
    - Added `--self-test` mode to validate fixture files, prompt contract, no-mutation comparison, and cleanup without running real provider.
  - Boundary result:
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used as a fixture root.
    - No production CLI behavior, provider/auth core, dependency manifest, lockfile, or three-large-file target was modified.
- D. Redaction assertion helper
  - Result: completed as a script-helper checkpoint.
  - Files changed:
    - `scripts/real-provider-readonly-redaction.mjs`
    - `PLANS.real-provider-readonly-coding.md`
  - Implementation:
    - Added a reusable script helper that redacts bearer tokens, authorization headers, key/value secrets, OpenAI-style keys, secret query params, private-agents config paths, and real-provider home path details.
    - Added `assertReadonlyProviderOutputRedacted(...)` to return structured leak labels without printing raw secret values.
    - Added `redactAndAssertReadonlyProviderOutput(...)` for future smoke/report code to sanitize output before assertion.
    - Added `--self-test` mode with synthetic secret-like samples; the self-test prints only pass/fail and leak labels, not raw secret samples.
  - Boundary result:
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used as runtime home.
    - No production CLI behavior, provider/auth core, dependency manifest, lockfile, or three-large-file target was modified.
- F. Opt-in real-provider readiness preflight
  - Result: completed as an opt-in preflight implementation checkpoint.
  - Files changed:
    - `scripts/verify-real-user-capabilities.mjs`
    - `PLANS.real-provider-readonly-coding.md`
  - Implementation:
    - Added `--real-readonly-coding-preflight` as an explicit opt-in readiness preflight entry.
    - The opt-in preflight prints an attribution notice before preflight and enforces `modelTurn=false`.
    - The opt-in preflight reuses existing provider readiness preflight classification and maps ready/network/config/unknown outcomes to explicit statuses and exit codes.
    - Added `--real-readonly-coding-preflight-self-test` to validate readiness status mapping without reading real provider config or running a real provider call.
    - Updated `--help` to distinguish safe dry-run options from explicit opt-in real-provider checks.
  - Boundary result:
    - The real-provider preflight flag was implemented but not executed in this checkpoint.
    - No model turn or read-only smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used as runtime home during validation.
    - No production CLI behavior, provider/auth core, dependency manifest, lockfile, or three-large-file target was modified.
- E. Dry-run contract for real read-only smoke
  - Result: completed as a script dry-run contract checkpoint.
  - Files changed:
    - `scripts/verify-real-user-capabilities.mjs`
    - `PLANS.real-provider-readonly-coding.md`
  - Implementation:
    - Added safe `--help` handling that exits before default real-provider gate execution.
    - Added `--real-readonly-coding-dry-run`.
    - The dry-run creates the safe fixture, snapshots it before/after, asserts no mutation, runs redaction assertions on synthetic secret-like strings, and builds an in-memory report contract.
    - The dry-run prints `homeRead=false`, `real-provider execution skipped`, `modelTurn=false`, `reportWritten=false`, and `defaultSmoke=skipped`.
    - The future opt-in smoke remains documented as `--real-readonly-coding-smoke`, but no real-provider model turn is implemented in this checkpoint.
  - Boundary result:
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used as runtime home.
    - No production CLI behavior, provider/auth core, dependency manifest, lockfile, or three-large-file target was modified.

## 17. 每个 checkpoint 的目标、允许修改文件、禁止修改文件、验证命令

### A. Real-provider read-only flow audit

Goal:

- Read-only audit `verify-real-user-capabilities`, provider readiness, runtime config, CLI entry, session runtime, and redaction surfaces.
- Do not run real provider.
- Update this plan with findings, Completed / Current / Backlog / Verification / Notes.

Allowed files:

- `PLANS.real-provider-readonly-coding.md`

Forbidden files/actions:

- production code.
- real provider execution.
- `D:\Test\home-sf`.
- auth/provider config.

Verification:

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### B. Opt-in flag design

Goal:

- Design a clear opt-in flag such as `--real-readonly-coding-smoke`.
- Default must remain skip/no-op for real provider.
- Define command help text, risk warning, and attribution status.

Allowed files:

- `PLANS.real-provider-readonly-coding.md`
- optional script design notes.

Forbidden:

- running real provider.
- modifying auth core.
- adding write/edit behavior.

Verification:

```powershell
rtk node scripts/verify-real-user-capabilities.mjs --help
rtk npm run build -w packages/ts-shell
```

### C. Safe workspace fixture

Goal:

- Design or implement a small temporary fixture containing only harmless text files.
- Read-only task must inspect/summarize fixture content and prove no mutation.

Allowed files:

- `scripts/*`
- `packages/ts-shell/src/test-utils/*`
- `PLANS.real-provider-readonly-coding.md`

Forbidden:

- real workspace mutation.
- `D:\Test\home-sf` access.
- edit/write tools.

Verification:

```powershell
rtk node scripts/verify-real-user-capabilities.mjs --failure-followup-context-dry-run
rtk npm run build -w packages/ts-shell
```

### D. Redaction assertion helper

Goal:

- Reuse or add helper that checks real-provider output/report text for secrets and provider detail.
- Keep helper out of the three large files.

Allowed files:

- `scripts/*`
- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/test-utils/*`
- focused tests
- `PLANS.real-provider-readonly-coding.md`

Forbidden:

- raw secret printing.
- real auth/config reads.
- broad logger rewrites.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts
rtk npm run build -w packages/ts-shell
```

### E. Dry-run contract for real read-only smoke

Goal:

- Validate script args, fixture setup, redaction assertions, report schema, skip behavior, and no-mutation checks without running real provider.

Allowed files:

- `scripts/*`
- `packages/ts-shell/src/test-utils/*`
- `PLANS.real-provider-readonly-coding.md`

Forbidden:

- real provider execution.
- real home access.
- provider/auth core changes.

Verification:

```powershell
rtk node scripts/verify-real-user-capabilities.mjs --help
rtk node scripts/verify-real-user-capabilities.mjs --failure-followup-context-dry-run
rtk npm run verify:result-contract
```

### F. Opt-in real-provider readiness preflight

Goal:

- Only with explicit opt-in, run readiness preflight without model turn.
- Classify auth/network/config/unsupported failures safely.

Allowed files:

- `scripts/*`
- config/readiness helpers if needed
- `PLANS.real-provider-readonly-coding.md`

Forbidden:

- model turn.
- config reads/prints beyond existing safe runtime loading.
- secret/path leakage.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts
rtk npm run test -w packages/ts-shell -- src/config/runtimeConfig.test.ts
```

### G. Opt-in real-provider read-only model turn

Goal:

- Only with explicit opt-in, run one real provider read-only task against safe fixture.
- Success requires visible model turn, terminal result, `changedFiles` empty, fixture unchanged, and redacted output.
- Failure is attribution unless local product regression is proven.

Allowed files:

- `scripts/*`
- `packages/ts-shell/src/test-utils/*`
- focused result helpers if needed
- `PLANS.real-provider-readonly-coding.md`

Forbidden:

- edit/write/mutation tools.
- real workspace mutation.
- default CI gate.
- leaking real provider detail.

Verification:

```powershell
rtk npm run verify:result-contract
rtk npm run verify:cli-entry
```

The opt-in real-provider command must be run only when the checkpoint explicitly requests it and must print the real-provider risk notice first.

### H. Real-provider failure attribution in read-only flow

Goal:

- Verify safe failure reason and next action for model/network/auth failures.
- Ensure no secret or provider config detail leaks.
- Ensure real home and safe fixture are not polluted.

Allowed files:

- `scripts/*`
- redaction/failure helpers
- focused tests
- `PLANS.real-provider-readonly-coding.md`

Forbidden:

- global network retry systems.
- auth core changes.
- real config mutation.

Verification:

```powershell
rtk npm run verify:result-contract
rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts
```

### I. Route audit / merge readiness

Goal:

- Stage-seal route after focused validation.
- Do not expand same-family proof.
- Real-provider opt-in smoke is not a default gate.

Allowed files:

- `PLANS.real-provider-readonly-coding.md`
- explicit minimal regression fix if route introduced one.

Forbidden:

- new checkpoint.
- provider/auth core changes.
- edit/write/mutation proof expansion.

Verification:

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
rtk npm run verify:result-contract
rtk npm run verify:cli-entry
HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path
```

## 18. 失败归因规则

All failures must be classified before fixing:

1. route-introduced product regression.
2. existing old failure.
3. too-broad filter hit unrelated case.
4. environment issue: sandbox EPERM, spawn EPERM, dist write failure, network timeout, PowerShell profile warning.
5. real-provider external failure: auth, config, network, endpoint, quota, model unsupported.
6. concurrent branch/main difference.
7. inconclusive.

Rules:

- Product regression: minimal fix and rerun related validation.
- External provider failure: record attribution and do not widen product fix.
- Environment failure: rerun same RTK command elevated once when appropriate.
- Inconclusive: stop checkpoint, do not merge.

## 19. RTK/audit 残留规则

Validation may generate:

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`
- similar audit/runtime residue.

Before commit or final status, clean or restore these residues. Do not commit:

- audit residue.
- real user config.
- temporary home.
- unrelated generated artifacts.

If RTK status/restore keeps writing audit, explain why and use minimal raw `git restore` / raw final `git status --short` only for cleanup confirmation.

## 20. 提交/push 规则

One checkpoint per commit.

Planning commit:

```text
Plan real provider read-only coding evidence track
```

Push rules:

- Attempt push once when requested.
- If push fails due network/auth/permission/safety review, do not bypass or retry repeatedly.
- Record commit hash, push failure reason, and current git status.

## 21. 当前推荐第一个 checkpoint

Recommended first checkpoint:

```text
A. Real-provider read-only flow audit
```

Type:

```text
read-only audit / planning checkpoint
```

Reason:

- Existing `verify-real-user-capabilities.mjs` has dry-run flags and redaction logic, but no dedicated read-only real-provider opt-in flow yet.
- Provider readiness and redaction helpers already exist and should be audited before adding new script behavior.
- A does not run real provider, does not touch `D:\Test\home-sf`, and does not modify production code.

This planning round does not execute A.

## Checkpoint Status Override

- Completed: Planning.
- Completed: A. Real-provider read-only flow audit.
- Completed: B. Opt-in flag design.
- Completed: C. Safe workspace fixture.
- Completed: D. Redaction assertion helper.
- Completed: E. Dry-run contract for real read-only smoke.
- Completed: F. Opt-in real-provider readiness preflight.
- Current: G. Opt-in real-provider read-only model turn.
- Backlog: H-I as listed above.
- Verification for Planning: `rtk git status --short` passed with only `PLANS.real-provider-readonly-coding.md` untracked. `rtk npm run build -w packages/ts-shell` first failed with sandbox `dist` write `EPERM`, then passed with the same RTK command elevated. `rtk git diff` passed; the new plan file was still untracked at that point, so no tracked diff was printed.
- Verification for A: read-only audit commands completed with RTK. `rtk git status --short --branch` passed clean before checkpoint edits. Target audit used `rtk read scripts/verify-real-user-capabilities.mjs`, `rtk read scripts/verify-provider-readiness.mjs`, `rtk read packages/ts-shell/src/core/shell/providerFailureRedaction.ts`, `rtk read packages/ts-shell/src/core/shell/providerReadiness.ts`, `rtk read packages/ts-shell/src/config/runtimeConfig.ts`, `rtk read packages/ts-shell/src/core/shell/sessionRuntime.ts`, `rtk grep "PRIVATE_AGENTS_PROVIDER_MODE" packages/ts-shell/src/cli-baseline.test.ts`, `rtk grep "verify:real-user-capabilities" package.json`, `rtk grep "read/inspect only" packages/ts-shell/src/core/shell/sessionRuntime.ts`, and `rtk grep "changedFiles" packages/ts-shell/src/orchestration/types.ts packages/ts-shell/src/core/query/resultMapper.ts`. Reference checks used targeted RTK grep against Claude Code query/result files and opencode read/edit/tool/permission files. `rtk git status --short` passed with only `PLANS.real-provider-readonly-coding.md` modified. `rtk npm run build -w packages/ts-shell` first failed with sandbox `dist` write `EPERM`, then passed with the same RTK command elevated.
- Verification for B: `rtk grep "--help" scripts/verify-real-user-capabilities.mjs scripts/verify-provider-readiness.mjs` was attempted but rtk interpreted `--help` as its own option, so it was not counted as evidence. `rtk grep "real-readonly" .` showed the proposed flag only existed in this plan before the design note. `rtk git status --short` passed with `PLANS.real-provider-readonly-coding.md` modified and `scripts/real-provider-readonly-coding-smoke.design.md` untracked before staging. `rtk npm run build -w packages/ts-shell` failed with sandbox `dist` write `EPERM`; the current approval policy does not allow elevated rerun. `rtk node node_modules/typescript/bin/tsc -p packages/ts-shell/tsconfig.build.json --noEmit` passed as the no-output TypeScript validation for this design-only checkpoint.
- Verification for C: `rtk node scripts/real-provider-readonly-fixture.mjs --self-test` passed and reported `noMutation=true`. `rtk node scripts/verify-real-user-capabilities.mjs --failure-followup-context-dry-run` passed with real-provider execution skipped, homeRead=false, followupExecution=false, and reportWritten=false. `rtk npm run build -w packages/ts-shell` passed.
- Verification for D: `rtk node scripts/real-provider-readonly-redaction.mjs --self-test` initially failed because the self-test expected `[PRIVATE_AGENTS_CONFIG_PATH]` while the helper correctly emitted `[REAL_PROVIDER_CONFIG_PATH]`; after narrowing the self-test assertion, the same command passed. `rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts` passed with 13 tests. `rtk npm run build -w packages/ts-shell` passed.
- Verification for E: `rtk node scripts/verify-real-user-capabilities.mjs --help` passed and returned safe help without executing the default real-provider gate. `rtk node scripts/verify-real-user-capabilities.mjs --real-readonly-coding-dry-run` passed with `homeRead=false`, `real-provider execution skipped`, `modelTurn=false`, `reportWritten=false`, `defaultSmoke=skipped`, `noMutation=true`, and `redaction=pass`. `rtk node scripts/verify-real-user-capabilities.mjs --failure-followup-context-dry-run` passed. `rtk npm run verify:result-contract` passed.
- Verification for F: `rtk node scripts/verify-real-user-capabilities.mjs --real-readonly-coding-preflight-self-test` passed with `homeRead=false`, `real-provider execution skipped`, `modelTurn=false`, and expected ready/network/config/unknown status mapping. `rtk node scripts/verify-real-user-capabilities.mjs --help` passed and listed `--real-readonly-coding-preflight` under explicit opt-in real-provider checks. `rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts` passed with 13 tests. `rtk npm run test -w packages/ts-shell -- src/config/runtimeConfig.test.ts` passed with 8 tests.
- Notes: Planning, A, B, C, D, E, and F did not run real provider smoke, did not execute an opt-in model turn, did not read or modify `D:\Test\home-sf`, did not change production CLI/session/orchestration code, and did not edit `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`. The next checkpoint is G opt-in real-provider read-only model turn; it must print the real-provider risk notice first, use only the safe fixture, and treat external provider failures as attribution outcomes.
