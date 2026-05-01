# Real Provider Safe Evidence Track

## 1. 总目标

建立一条 real-provider safe evidence / real coding-flow attribution 路线，用安全、可归因、可跳过的方式验证真实 provider 入口下的主路径风险。

本路线直接服务 user-minimal real main path：

- Step 4: 系统使用真实模型和真实工具链，permission escalation 明确由用户批准或拒绝。
- Step 5: 系统发出清晰 terminal state，并把 provider/model/tool failure 分层为可行动、可重试的结果。

本路线不是 provider 扩展，也不是 auth 重写；目标是让真实 provider 相关证据不泄露 secret、不污染真实 home、不把网络/auth/config 外部状态误判为产品逻辑回归。

## 2. 当前分支

当前路线分支：

```text
real-provider-safe-evidence
```

## 3. base/main 状态

创建本分支前的本地 base 为：

```text
main...origin/main [ahead 10]
HEAD: f31f233 Seal long session continuity track
```

含义：

- `long-session-continuity-hardening` 已合并到本地 `main`。
- 本地 `main` 仍包含未推送到 `origin/main` 的提交。
- 本路线从当前本地 `main` 创建，不 reset、不 rebase、不丢弃这些本地提交。
- 后续 merge/push 前必须重新确认 `main` 与 `origin/main` 状态。

## 4. 背景审查结论

项目已具备多条本地和 synthetic 主路径证据：

- CLI packaged / print / replay / stdin boundary。
- synthetic golden main path。
- result/failure terminal contract。
- provider readiness preflight 分类。
- long-session compact / resume / continuation context evidence。

剩余最大真实用户风险在 real-provider 完整 coding flow：

- 真实 provider 下 model turn 是否能安全进入和退出。
- network/auth/config failure 是否能正确归因。
- provider failure 与 model/tool execution failure 是否分层。
- terminal result 是否足够清晰、可见、可重试。
- stopped/failure 后 follow-up 是否保留上下文。
- 所有 real home 相关验证是否可控、可归因、不可污染。

当前 `scripts/verify-provider-readiness.mjs` 会读取 `D:/Test/home-sf/.private-agents/config.json`，并打印 provider、active connection、credential source、auth mode、endpoint、model 等元信息。因此 real-provider gate 不能作为默认验证直接运行，第一步必须先审计 safety/redaction 边界。

## 5. 为什么选择 real-provider safe evidence

之前路线已经收口了结构拆分、CLI evidence、long-session continuity。继续做同族 synthetic proof 或 opportunistic extraction 不能直接降低当前最大用户风险。

real-provider safe evidence 更靠近真实用户主路径，因为它处理：

- 用户配置存在但 provider 不可达。
- 用户 auth/config 错误但不能泄露 secret。
- provider/model 失败与产品逻辑失败混淆。
- terminal result 对真实 provider 状态表达不清。
- 真实 provider failure 后的 retry/follow-up 语义。

## 6. 明确不做的方向

本路线不做：

- 新增 provider。
- 修改 auth core。
- 读取、复制、打印、修改真实 auth/key/provider 配置。
- Windows EBUSY 处理。
- runMvpIntegratedFlow 全量旧失败清理。
- 完整 apply_patch、AST patch、rollback、batch engine。
- stream mid-flight retry 或全局网络重试。
- provider reconnect 同族 proof，除非来自 real-provider safety 缺口。
- edit/patch marker、verification surface、CLI print smoke、long-session continuity 同族 proof。
- 把 synthetic golden 通过包装成 real-provider 成熟证据。
- 为减少行数继续拆三大巨型文件。

## 7. 环境约束

真实配置边界：

- real-provider home 固定为 `D:\Test\home-sf`。
- 不得读取、复制、修改、清理或泄露真实 auth/key/provider 配置内容。
- 只有明确设计为 real-provider safe smoke 的 checkpoint 才能触碰 real home 路径。
- 任何 real-provider 运行前必须说明可能因 network/auth/config 外部状态失败，并把失败归因到 provider/network/config 而不是默认产品回归。

Synthetic/test 边界：

- synthetic home 固定为 `D:\Test\pca-home-synth`。
- 使用 `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`。
- 失败态或隔离验证只能使用临时 synthetic/test home。

命令边界：

- RTK command discipline active。
- 文件读取、搜索、git status/diff/log、测试、构建、大输出必须显式使用 `rtk`。
- raw git 仅用于 branch/switch/add/commit/push/merge 等 RTK 不负责的 git mutation，并需说明理由。

## 8. 参考实现约束

优先检查目标仓库当前实现，再做小范围只读语义对照。

Claude Code 参考：

- `QueryEngine.ts`
- `query.ts`
- `commands.ts` 或当前实际命令入口等价文件
- `cli/print` 或 structured output 相关文件
- provider/model request/error handling 相关文件
- permission/tool result 相关文件

opencode 参考：

- `packages/opencode/src/cli/cmd/run.ts`
- `packages/opencode/src/provider` 或 model 相关文件
- `packages/opencode/src/permission/permission.ts`
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/bash.ts`
- `packages/opencode/src/acp/agent.ts`

只吸收语义边界：

- provider/network/auth failure 如何向用户呈现。
- secret/config detail 如何避免泄露。
- model turn failure 与 tool execution failure 如何分层。
- real-provider 网络波动如何归因。
- CLI run/print 如何呈现失败与下一步。

不得照抄代码，不做大规模参考扫描。

## 9. 三大巨型文件新增代码约束

三大文件仍然存在，但本路线不得把新逻辑继续塞进去：

- `packages/ts-shell/src/entrypoints/cli.tsx`: 只保留入口 wiring。
- `packages/ts-shell/src/session/SessionManager.ts`: 只保留 durable session state、persistence、current pointer、最小 wiring。
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`: 只保留主 orchestration sequencing。

如果需要新增 provider evidence、real-provider sanity、failure attribution、redaction/sanitization、verification helper、test fixture，优先放到：

- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/core/query/*`
- `packages/ts-shell/src/config/*`
- `packages/ts-shell/src/model-adapters/*`
- `packages/ts-shell/src/session/*`
- `scripts/*`

如果必须修改三大巨型文件，只允许最小接线，并在 checkpoint 记录为什么不能放入独立模块。

## 10. 当前已闭合能力

当前已较可信：

- CLI packaged / print / replay / stdin boundary。
- CLI entry verification。
- synthetic golden main path。
- result/failure terminal contract。
- provider readiness preflight 分类。
- missing-key/auth/network readiness focused tests。
- non-interactive approval 与 CLI surface focused evidence。
- long-session compact / replay / resume continuity smoke。

这些能力不能替代 real-provider 成熟证据；它们只证明 synthetic/local contract 可信。

## 11. 当前主要风险

主要风险：

- readiness 脚本读取 real home config 后输出过多 provider metadata。
- provider endpoint/model/path/detail 被打印，形成隐私或环境泄露。
- auth/network/config failure 被误判为 product regression。
- model turn failure 与 tool execution failure 混成 generic error。
- terminal result 缺少 provider failure 的 next action。
- stopped/failure 后 follow-up 丢失 provider failure context。
- real-provider smoke 依赖网络和外部账号状态，容易产生不可复现结果。

## 12. 路线分阶段 backlog

Backlog:

1. C. Real-provider readiness attribution smoke
2. D. Real-provider turn boundary dry-run audit
3. E. Real-provider terminal result surface smoke
4. F. Tool execution under real-provider planning audit
5. G. Real-provider failure follow-up context smoke
6. H. Merge-readiness / route audit

Current:

- C. Real-provider readiness attribution smoke

Completed:

- A. Real-provider readiness safety audit
  - Commit: checkpoint commit reported in final status.
  - Files changed: `PLANS.real-provider-safe-evidence.md`.
  - Result: completed as read-only audit / planning checkpoint; no real-provider smoke run, no real home config content read.
- B. Provider failure redaction contract
  - Commit: checkpoint commit reported in final status.
  - Files changed: `packages/ts-shell/src/core/shell/providerFailureRedaction.ts`, `packages/ts-shell/src/core/shell/providerReadiness.ts`, `packages/ts-shell/src/core/shell/providerReadiness.test.ts`, `PLANS.real-provider-safe-evidence.md`.
  - Result: completed. Added focused provider failure detail sanitizer and applied it to unknown provider readiness errors before they become user/report-visible stop reasons.

Verification:

- Planning round: `rtk git status --short`, `rtk npm run build -w packages/ts-shell`, `rtk git diff`.
- A audit round:
  - `rtk git status --short --branch`: passed; branch `real-provider-safe-evidence`, clean before checkpoint update.
  - Read-only audit commands: `rtk read AGENTS.md`, `rtk read PLANS.real-provider-safe-evidence.md`, `rtk read scripts/verify-provider-readiness.mjs`, `rtk read scripts/verify-real-user-capabilities.mjs`, `rtk read scripts/verify-doctor-environment.mjs`, `rtk read packages/ts-shell/src/core/shell/providerReadiness.ts`, `rtk read packages/ts-shell/src/config/runtimeConfig.ts`, `rtk read packages/ts-shell/src/core/shell/providerCredentials.ts`, `rtk read packages/ts-shell/src/core/commands/connectCommandRuntime.ts`, `rtk read packages/ts-shell/src/core/commands/authCommandRuntime.ts`.
  - Search audit commands: `rtk grep "endpoint=" scripts packages/ts-shell/src`, `rtk grep "activeConnection" scripts packages/ts-shell/src`, `rtk grep "configPath" scripts packages/ts-shell/src`, `rtk grep "model=" scripts packages/ts-shell/src`.
  - `rtk npm run build -w packages/ts-shell`: initial sandbox run failed with `EPERM` while writing `dist`; elevated rerun of the same RTK command passed.
- B redaction contract round:
  - `rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts`: initial sandbox run failed with `spawn EPERM`; elevated rerun exposed sanitizer ordering issue; after fix, elevated rerun passed with 13 tests.
  - `rtk npm run test -w packages/ts-shell -- src/config/runtimeConfig.test.ts`: initial sandbox run failed with `spawn EPERM`; elevated rerun passed with 8 tests.
  - `rtk npm run verify:result-contract`: initial sandbox run failed with `spawn EPERM`; elevated rerun passed all result-contract checks.
  - `rtk npm run build -w packages/ts-shell`: elevated run passed.

Notes:

- Do not run `verify-real-user-capabilities` by default.
- Do not run real-provider smoke until C explicitly designs a safe attribution smoke that does not print or persist raw real-provider config details.
- A audit findings:
  - `scripts/verify-provider-readiness.mjs` reads `D:/Test/home-sf/.private-agents/config.json` when run outside `--classification-self-test`; it prints `real-provider-config` with full config path, `activeConnection`, `endpoint`, and `model`.
  - `scripts/verify-doctor-environment.mjs` has the same real-provider config read and prints full config path, `activeConnection`, `endpoint`, and `model`.
  - `scripts/verify-real-user-capabilities.mjs` runs provider readiness preflight before real scenarios and stores `providerReadiness.outputTail` in `D:/Test/test-results/real-user-capabilities-report.json`; if the preflight output includes endpoint/model/path details, those details can be persisted in the report.
  - `providerReadiness.ts` does not print raw API keys or bearer tokens in normal missing-key/auth/network paths, but its unknown error path includes `error.message`; B should sanitize error text before user-visible/report-visible output.
  - `/connect status` and legacy `/auth status` already mask API keys, but they expose connection id, base URL, model, account id/email/client id summaries, and stored config path. Those are acceptable for explicit local status commands, but should not leak through automated real-provider gates by default.
  - Current recommendation: implement B before any real-provider smoke. B should introduce a small redaction/sanitization helper or script-local sanitizer and focused tests for token/header/path/endpoint-bearing error text.
- B implementation notes:
  - New `redactProviderFailureDetail` redacts bearer tokens, API/access/refresh/id token key-value shapes, OpenAI-style API keys, secret query params, and private-agents real-home config paths.
  - `checkRealProviderReadiness` now sanitizes unknown exception messages before including them in `provider-readiness:unknown` stop reasons.
  - Normal missing-key/auth/network/missing-config readiness classifications are behavior-preserving.
  - This checkpoint does not yet rewrite `verify-provider-readiness.mjs` or `verify-doctor-environment.mjs`; C should apply the contract to safe smoke/report output before any real-provider execution.

## 13. 每个 checkpoint 的目标、允许/禁止修改文件、验证命令

### A. Real-provider readiness safety audit

目标：

- 只读审计 provider readiness、runtime config、real-provider verify scripts 是否可能打印或暴露 auth/key/config detail。
- 不读取真实配置内容。
- 产出明确 safety/redaction gap 和下一 checkpoint 选择。

允许修改：

- `PLANS.real-provider-safe-evidence.md`
- 如需记录审计结果，可新增不含 secret 的 docs/plan notes。

禁止修改：

- provider/auth core。
- `D:\Test\home-sf` 下任何文件。
- 三大巨型文件。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### B. Provider failure redaction contract

目标：

- 如果 A 发现 provider/auth/network failure 输出可能包含敏感 endpoint/header/token/path detail，新增最小 redaction/sanitization helper。
- 补 focused tests，覆盖 api key、bearer token、refresh token、account token、endpoint query secret、local real-home path 等形状。

允许修改：

- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/config/*`
- focused tests。
- `PLANS.real-provider-safe-evidence.md`

禁止修改：

- auth core 语义。
- provider adapter 行为。
- 三大巨型文件，除非最小接线且有记录。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts
rtk npm run test -w packages/ts-shell -- src/config/runtimeConfig.test.ts
rtk npm run verify:result-contract
```

### C. Real-provider readiness attribution smoke

目标：

- 在不污染 `D:\Test\home-sf` 的前提下，验证 readiness failure 可归因为 missing-key/auth/network/config/unsupported。
- 输出不得泄露 secret。

允许修改：

- `scripts/*`
- focused tests。
- `PLANS.real-provider-safe-evidence.md`

禁止修改：

- 真实配置文件。
- provider/auth core。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts
rtk npm run test -w packages/ts-shell -- src/config/runtimeConfig.test.ts
```

只有 checkpoint 明确设计为 safe real-provider smoke 时，才允许运行 real-provider readiness 脚本，并必须记录外部失败归因。

### D. Real-provider turn boundary dry-run audit

目标：

- 审计 `verify-real-user-capabilities` 或等价脚本是否能安全表达 real-provider model turn 成功/失败。
- 不把 network 波动误判成产品失败。
- 不默认运行真实 provider。

允许修改：

- `scripts/*`
- plan notes。

禁止修改：

- production query loop。
- provider/auth core。

验证：

```powershell
rtk npm run verify:cli-entry
rtk npm run verify:result-contract
```

### E. Real-provider terminal result surface smoke

目标：

- 如果已有脚本已被 A-D 判定安全，验证真实 provider 下 terminal result 能显示 provider failure / model failure / stopped reason / next action。
- 若真实网络/auth失败，必须归因为 external provider state。

允许修改：

- `scripts/*`
- result surface focused tests。
- plan notes。

禁止修改：

- auth core。
- real home files。
- broad runMvp old-failure cleanup。

验证：

```powershell
rtk npm run verify:result-contract
rtk npm run verify:cli-entry
```

### F. Tool execution under real-provider planning audit

目标：

- 只审计真实模型规划到 tool execution 的边界。
- 不执行危险写入。
- 优先 synthetic/test workspace 和 allowlisted benign command。

允许修改：

- `scripts/*`
- focused fixtures/tests。
- plan notes。

禁止修改：

- execution-plane Rust semantics。
- permission model expansion。
- dangerous real workspace writes。

验证：

```powershell
rtk npm run verify:cli-entry
rtk npm run verify:result-contract
```

### G. Real-provider failure follow-up context smoke

目标：

- 验证 real-provider failure/stopped 后 follow-up 不丢失 reason、blocker、DoNext。
- 如果需要真实网络，必须可跳过或清晰归因。

允许修改：

- `scripts/*`
- `packages/ts-shell/src/core/shell/*`
- focused tests。
- plan notes。

禁止修改：

- SessionManager broad rewrite。
- long-session continuity 同族 proof。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts
rtk npm run verify:result-contract
```

### H. Merge-readiness / route audit

目标：

- 路线阶段性完成后集中验证 build、CLI entry、result contract、provider readiness tests、safe smoke。
- 不继续扩展同族 proof。

允许修改：

- `PLANS.real-provider-safe-evidence.md`
- 明确回归的最小修复。

禁止修改：

- 新增 checkpoint。
- opportunistic extraction。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
rtk npm run verify:cli-entry
rtk npm run verify:result-contract
rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts
rtk npm run test -w packages/ts-shell -- src/config/runtimeConfig.test.ts
```

## 14. 失败归因规则

所有失败先归因，不直接扩大修复：

1. 本路线引入的真实回归。
2. 测试维护问题。
3. 既有旧失败。
4. 过宽 filter 命中 unrelated case。
5. 环境问题，如 sandbox EPERM、spawn EPERM、工具超时、PowerShell profile warning、RTK/audit 副作用。
6. provider/network/auth/config 外部状态。
7. 并行分支或未推送 main 差异。

处理规则：

- 当前路线真实回归：最小修复并重跑相关验证。
- 测试维护问题：最小更新测试，不改生产行为。
- 既有旧失败：记录证据，不顺手大修。
- 环境问题：可重跑一次或 elevated rerun，并记录为环境问题。
- provider/network/auth/config 外部状态：记录为 external provider state，不包装为 product regression。
- 无法确认归因：停止 checkpoint，不 merge。

## 15. secret/auth redaction 规则

不得输出：

- API key。
- bearer token。
- refresh token。
- account access token。
- raw provider credential object。
- real user config JSON 内容。
- 带 secret query/header 的 endpoint。
- 可恢复 credential 的 token 片段。

默认允许输出：

- provider kind。
- failure kind。
- redacted credential presence，例如 `credential present (redacted)`。
- generic setup hint，例如 `set OPENAI_API_KEY`。
- sanitized command hint。

需要谨慎输出：

- `D:\Test\home-sf` 路径：可以作为固定测试边界记录，但不得输出其 config 内容。
- endpoint/model：当前脚本会输出，A checkpoint 必须判断是否需要 redaction 或降级为 provider family / endpoint present。
- active connection id：如可能暴露个人命名，需考虑 redaction。

## 16. RTK/audit 残留规则

验证产生的残留必须清理或还原：

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`
- 同类 audit/runtime residue。

不得提交：

- audit 残留。
- real home 文件。
- temporary home。
- 无关生成物。

如果 `rtk git status` 或 `rtk git restore` 会再次写 audit，说明原因后使用最小 raw `git status --short` / `git restore` 做最终确认。

## 17. 提交/push 规则

每个 checkpoint 一个 commit。

Planning round commit:

```text
Plan real provider safe evidence track
```

后续 checkpoint commit message 必须描述真实边界，例如：

- `Audit real provider readiness safety`
- `Add provider failure redaction contract`
- `Add real provider readiness attribution smoke`

Push 规则：

- push 失败如果是认证、网络、权限、审核失败，不绕过、不反复重试。
- 记录 commit hash、push 失败原因、当前 `git status`。
- 本路线基于本地 ahead `main`，merge 回 main 前必须确认 `origin/main` 与本地 main 差异。

## 18. 当前推荐第一个 checkpoint

推荐第一个 checkpoint：

```text
A. Real-provider readiness safety audit
```

类型：

```text
read-only audit / planning checkpoint
```

选择原因：

- 现有 provider readiness / real-user capability 脚本已经有 failure 分类基础。
- 但 `verify-provider-readiness.mjs` 会读取 real home config 并输出 provider metadata。
- 在任何真实 provider smoke 前，必须先确认输出边界、redaction 策略、failure attribution 语义。
- 该 checkpoint 不需要新增 provider、不需要改 auth、不需要读取真实 secret 内容，风险最低且最贴近 real-provider safe evidence 主线。
