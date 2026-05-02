# True PTY / Interactive Harness Fidelity Track

## 1. 总目标

建立一条 True PTY / interactive harness fidelity 路线，专门校准当前 interactive CLI 证据与真实 TTY 行为之间的边界，避免把 pipe-spawn smoke 误称为 live TTY 成熟证据。

本路线直接服务 user-minimal real main path：

- Step 1: 用户启动默认 CLI 后看到清晰 runtime mode、session state 和 prompt readiness。
- Step 4: permission escalation 在真实 interactive/TTY 入口下由用户明确批准或拒绝。
- Step 5: stopped / failed / interrupted / closed 状态有清晰 terminal state，并可持久化与归因。
- Step 6: 用户在 interruption、stopped 或 failure 后继续输入时，恢复语义一致且不需要手动修复。

本路线的阶段目标不是再增加普通 pipe smoke，而是先确认哪些证据代表 pipe stdin/stdout，哪些才能代表 true PTY / terminal behavior。

## 2. 当前分支

```text
pty-interactive-harness-fidelity
```

## 3. base/main 状态

创建本分支前确认：

```text
main...origin/main
HEAD: c6ad4d8 Seal live TTY interactive evidence track
origin/main: c6ad4d8 Seal live TTY interactive evidence track
```

含义：

- `live-tty-interactive-evidence` 已合并并封口。
- 本地 `main` 与 `origin/main` 对齐。
- 本路线从当前本地 `main` 创建，不 reset、不 rebase、不丢失已有提交。
- 后续 merge/push 前仍需重新确认 `main` 与 `origin/main` 状态。

## 4. 背景审查结论

此前路线已经阶段性封口：

- CLI packaged / `--print` / synthetic golden main path 已有证据。
- result contract、provider readiness、real-provider safe evidence 已有证据。
- long-session continuity / compact-resume 已有证据。
- live interactive pipe-spawn smoke 已覆盖 startup、slash command、stopped follow-up、print boundary、EOF close 等场景。

最新审查结论是：当前 live TTY 证据仍主要依赖 `child_process` pipe/stdin/stdout harness，不是真 PTY。真实 approval prompt、Ctrl-C/interrupt、terminal raw mode、TTY prompt fidelity 仍不能假装已经成熟。

## 5. 为什么选择 True PTY / interactive harness fidelity

真实用户默认入口是终端里的 interactive CLI。PTY / terminal 行为会影响：

- approval prompt 是否真的可交互。
- Ctrl-C / interrupt / close / EOF 是否真实归因。
- readline prompt 与 pipe stdin 是否行为一致。
- terminal rendering 是否会在 TTY / non-TTY 下分叉。
- 测试命名是否把 pipe behavior 误称为 live TTY 成熟证据。

因此本路线优先降低“证据本身是否可信”的风险，而不是继续添加同族 pipe smoke。

## 6. 明确不做的方向

本路线不做：

- 新增 provider 或修改 auth core。
- 读取、复制、修改、清理或打印真实 auth/key/provider 配置。
- 默认运行 `verify-real-user-capabilities` 或真实 provider smoke。
- Windows EBUSY 处理。
- runMvpIntegratedFlow 全量旧失败清理。
- 完整 apply_patch、AST patch、rollback、batch engine。
- stream mid-flight retry 或全局网络重试。
- provider readiness、real-provider dry-run、edit/patch marker、verification surface、long-session continuity、普通 live TTY pipe smoke 同族 proof，除非来自 PTY fidelity 缺口。
- 为减少行数而继续拆三大巨型文件。
- 引入需要人工手动操作的测试。
- 把 pipe-spawn smoke 包装成 true TTY coverage。

## 7. 环境约束

真实配置边界：

- real-provider home 固定为 `D:\Test\home-sf`。
- 不得读取、复制、修改、清理或泄露真实 auth/key/provider 配置。
- 本路线默认不运行 real-provider smoke。

Synthetic/test 边界：

- synthetic home 固定为 `D:\Test\pca-home-synth`。
- 需要 synthetic provider 时设置 `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`。
- 失败态或隔离验证只能使用 synthetic/test home 或临时 test home。
- 不得污染 `D:\Test\home-sf`。

命令边界：

- RTK command discipline active。
- 文件读取、搜索、git status/diff/log、测试、构建、大输出必须显式使用 `rtk`。
- raw git 仅用于 branch/switch/add/commit/push/merge 等 git mutation，并需说明理由。

## 8. 参考实现约束

优先检查目标仓库当前实现，再做小范围只读语义对照。

Claude Code 参考：

- `commands.ts`
- `query.ts`
- `QueryEngine.ts`
- interactive prompt / terminal / readline / approval 相关文件
- `cli/print.ts` 或 structured output 相关文件
- permission / tool result 相关文件

opencode 参考：

- `packages/opencode/src/cli/cmd/run.ts`
- `packages/opencode/src/acp/agent.ts`
- `packages/opencode/src/permission/permission.ts`
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/bash.ts`
- `packages/opencode/src/session` 或 event 相关文件

只吸收语义边界：

- interactive 与 print/non-interactive 如何分层。
- TTY / non-TTY 是否有不同 behavior。
- approval prompt 如何只在真实 interactive 下出现。
- interrupt / close / EOF 如何归因。
- terminal output 如何避免污染 structured result。

不得照抄代码，不做大规模参考扫描。

## 9. 三大巨型文件新增代码约束

三大文件可以在功能确实属于其职责时修改，但必须先判断边界：

- `packages/ts-shell/src/entrypoints/cli.tsx`: 只放真正属于入口 wiring、readline/TTY entry boundary 的最小逻辑。
- `packages/ts-shell/src/session/SessionManager.ts`: 只放 durable session state、persistence、current pointer 和最小 wiring。
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`: 只放主 orchestration sequencing。

如果需要新增 PTY harness、interactive test driver、terminal output parser、approval prompt fixture、TTY capability detector、test skip helper，必须优先放到：

- `packages/ts-shell/src/test-utils/*`
- `packages/ts-shell/src/core/shell/*`
- `scripts/*`

`packages/ts-shell/src/cli-baseline.test.ts` 只保留测试编排，不塞大量 helper。

如果必须修改三大巨型文件，checkpoint notes 必须记录为什么该功能不能放在独立模块。

## 10. 当前已闭合能力

当前已较可信：

- packaged CLI / `--print` / stdin boundary。
- synthetic golden main path。
- result/failure terminal contract。
- provider readiness 与 real-provider safe attribution dry-run。
- long-session compact / replay / resume continuity。
- live interactive pipe-spawn startup、slash command、stopped follow-up、print boundary、EOF close smoke。

这些能力证明已有入口和 pipe-driven behavior 可运行，但不能证明 true PTY terminal fidelity。

## 11. 当前主要风险

主要风险：

- `child_process` pipe harness 下 `process.stdin.isTTY` 为 false，不能代表真实 terminal。
- interactive approval prompt 可能只在 true TTY 中出现，pipe tests 无法覆盖。
- Ctrl-C / interrupt 与 process kill / stdin close 不是同一语义。
- readline prompt rendering、raw mode、cursor behavior 和 echo 可能在 TTY / non-TTY 下分叉。
- 当前测试命名可能让读者误以为 pipe smoke 等同 live TTY coverage。
- Windows / Node / Vitest 环境下引入 PTY dependency 可能带来 native install、CI、sandbox、flake 风险。

## 12. 当前 pipe-spawn interactive coverage boundary

当前 `packages/ts-shell/src/test-utils/cliHarness.ts` 的 interactive helpers 基于 `node:child_process`、stdin/stdout/stderr pipe 和 `cli.stdin.write/end`。

当前 pipe coverage 可以证明：

- default CLI 启动后能输出 startup surface 和 prompt readiness marker。
- pipe stdin 可驱动 harmless slash command。
- pipe stdin 可驱动 stopped session follow-up。
- `--print` / non-interactive boundary 不渲染 `approval> `。
- pipe stdin close / EOF-like close 不应伪装 success。

当前 pipe coverage 不能证明：

- terminal raw mode 或 TTY prompt fidelity。
- `process.stdin.isTTY === true` 下的实际行为。
- 真实 interactive approval prompt 可交互。
- Ctrl-C / SIGINT 的真实 terminal attribution。
- PTY close 与 pipe close 是否完全一致。
- 光标、echo、line discipline、terminal rendering 是否稳定。

所有后续文档、测试名和 merge-readiness 记录都必须保留这个边界。

## 13. True PTY 可行性判断标准

只有同时满足以下标准，才允许进入 PTY harness prototype：

- Windows native 环境可运行。
- Vitest 或脚本可自动化运行，无需人工输入。
- PTY 不读取或污染 `D:\Test\home-sf`。
- 可使用 synthetic/test home，并能设置 `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`。
- 失败可区分为 PTY dependency/env unavailable、test harness flake、产品回归。
- 可 skip 或降级，且 skip 信息清晰，不把 skip 当成功证据。
- 不需要贸然引入过重、不可维护或 CI 不稳定的 native dependency。
- 不执行危险命令，不依赖真实 provider/network/auth。
- 不要求生产 CLI 为测试暴露虚假 TTY override。

如果不可行，路线应记录 blocked/deferred，并更新命名或文档，避免误导。

## 14. 路线分阶段 backlog

Current:

- A. Current interactive harness fidelity audit

Backlog:

- B. PTY feasibility / dependency audit
- C. Interactive coverage boundary documentation
- D. Minimal PTY harness prototype
- E. PTY startup readiness smoke
- F. PTY slash command smoke
- G. PTY approval prompt smoke
- H. PTY interrupt / Ctrl-C attribution smoke
- I. PTY route audit / merge readiness

Completed:

- Planning: created `PLANS.pty-interactive-harness.md` from clean `main`.

Verification:

- Planning round validation pending at file creation time.

Notes:

- Current evidence is pipe-spawn interactive evidence, not true PTY evidence.
- Do not continue ordinary pipe-spawn smoke under this route unless it is specifically documenting fidelity boundaries or preventing misleading evidence labels.

## 15. 每个 checkpoint 的目标、允许修改文件、禁止修改文件、验证命令

### A. Current interactive harness fidelity audit

目标：

- 只读审计 `cliHarness.ts`、`cli-baseline.test.ts`、verify scripts 与 package dependencies。
- 明确哪些 evidence 是 pipe spawn、哪些是真 PTY、哪些命名可能误导。
- 更新计划中的 Completed / Current / Backlog / Verification / Notes。

允许修改：

- `PLANS.pty-interactive-harness.md`

禁止修改：

- production code。
- test helper code。
- `cli.tsx`、`SessionManager.ts`、`runMvpIntegratedFlow.ts`。
- provider/auth core。
- `D:\Test\home-sf`。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### B. PTY feasibility / dependency audit

目标：

- 检查 package 依赖、Node/Vitest 环境、Windows 支持、CI/sandbox 限制。
- 判断是否已有 `node-pty` 或可替代方案。
- 不贸然新增重依赖。

允许修改：

- `PLANS.pty-interactive-harness.md`
- 如需记录非行为性结论，可新增轻量 docs/notes。

禁止修改：

- production code。
- dependency manifest，除非另起 checkpoint 明确选择 PTY dependency。
- real provider config。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### C. Interactive coverage boundary documentation

目标：

- 如果当前只能 pipe-spawn，更新 plan/test naming/doc 注释，明确 pipe smoke 不等于 true TTY coverage。
- 不改变生产行为。

允许修改：

- `PLANS.pty-interactive-harness.md`
- focused test names/comments, if misleading.

禁止修改：

- production CLI behavior。
- PTY dependency。
- provider/auth core。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
```

### D. Minimal PTY harness prototype

目标：

- 只有在可行性确认后，新增最小 PTY harness helper。
- 不修改 CLI 生产逻辑。
- 必须支持自动化、timeout、cleanup、skip/unavailable attribution。

允许修改：

- `packages/ts-shell/src/test-utils/*`
- `scripts/*`
- `PLANS.pty-interactive-harness.md`
- dependency manifest only if checkpoint explicitly approves a PTY dependency.

禁止修改：

- production CLI logic。
- provider/auth core。
- real home files。

验证：

```powershell
rtk npm run build -w packages/ts-shell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
```

### E. PTY startup readiness smoke

目标：

- 用 true PTY 启动 CLI。
- 验证 startup surface 和 prompt readiness。
- 不执行真实 provider turn。

允许修改：

- PTY test helper。
- focused test orchestration。
- `PLANS.pty-interactive-harness.md`

禁止修改：

- production CLI behavior，除非发现入口 wiring 明确缺陷并记录原因。
- provider/auth core。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "PTY"
rtk npm run verify:cli-entry
```

### F. PTY slash command smoke

目标：

- 用 true PTY 输入 harmless slash command。
- 验证输出和 prompt recovery。

允许修改：

- PTY harness/test helper。
- focused tests。
- `PLANS.pty-interactive-harness.md`

禁止修改：

- slash command broad rewrite。
- provider/auth core。
- dangerous tool execution。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "PTY"
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
```

### G. PTY approval prompt smoke

目标：

- 在 synthetic/test home 下构造 benign approval scenario。
- 验证 approval prompt 真实可交互。
- 不执行危险命令。

允许修改：

- PTY harness。
- approval prompt fixture。
- focused tests。
- `PLANS.pty-interactive-harness.md`

禁止修改：

- permission model expansion。
- real provider access。
- dangerous command execution。
- fake TTY override。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "PTY"
rtk npm run verify:result-contract
```

### H. PTY interrupt / Ctrl-C attribution smoke

目标：

- 验证 Ctrl-C 或可模拟 interrupt 不产生虚假 success。
- 确认 session state 不被破坏。

允许修改：

- PTY harness。
- focused tests。
- `PLANS.pty-interactive-harness.md`

禁止修改：

- broad terminal taxonomy expansion。
- Rust execution-plane semantics，除非发现明确边界缺口并另开路线。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "PTY"
rtk npm run verify:result-contract
```

### I. PTY route audit / merge readiness

目标：

- 路线阶段性完成后集中验证 build、cli-entry、interactive focused tests、result-contract、synthetic golden。
- 不继续扩同族 proof。

允许修改：

- `PLANS.pty-interactive-harness.md`
- 明确回归的最小修复。

禁止修改：

- 新增 checkpoint。
- opportunistic extraction。
- provider/auth core。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run verify:cli-entry
rtk npm run verify:result-contract
HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path
```

## 16. 失败归因规则

所有失败先归因：

1. 本路线引入的真实回归。
2. PTY dependency/env unavailable。
3. PTY harness flake。
4. 既有旧失败。
5. 过宽 filter 命中 unrelated case。
6. 环境问题，例如 sandbox EPERM、spawn EPERM、dist 写入失败、PowerShell profile warning。
7. 并行分支或 main 差异导致。

处理规则：

- 本路线真实回归：允许最小修复并重跑相关验证。
- PTY unavailable：标记 skip/deferred/blocked，不伪造成通过。
- harness flake：优先收窄 helper 和断言，不改生产行为。
- 既有旧失败：记录证据，不扩大修复。
- 环境问题：可同命令重跑一次或 elevated rerun，并记录为环境问题。
- 无法确认归因：停止 checkpoint，不 merge。

## 17. PTY / non-PTY test skip 与降级规则

PTY tests 必须：

- 自动检测 PTY capability 或 dependency availability。
- 如果 unavailable，明确 skip 或 fail with attribution，不把 unavailable 当产品成功。
- skip 文本必须说明缺少 true PTY capability，而不是泛称 live TTY 通过。
- 不 fallback 到 pipe harness 后仍称为 PTY coverage。
- 不使用 fake `FORCE_TTY` 类生产绕过开关来制造证据。
- timeout 后必须清理子进程和临时 home。
- 不输出 secret、real home config 或不可恢复 credential 片段。

Non-PTY / pipe tests 必须：

- 命名和 notes 中保留 pipe-spawn boundary。
- 只证明 pipe stdin/stdout behavior，不证明 terminal raw mode、Ctrl-C、真实 approval prompt。

## 18. RTK/audit 残留规则

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

## 19. 提交/push 规则

每个 checkpoint 一个 commit。

Planning round commit:

```text
Plan PTY interactive harness fidelity track
```

后续 checkpoint commit message 应描述实际 checkpoint，例如：

- `Audit interactive harness fidelity`
- `Audit PTY feasibility`
- `Document interactive coverage boundary`

Push 规则：

- push 失败如果是认证、网络、权限、审核失败，不绕过、不反复重试。
- 记录 commit hash、push 失败原因、当前 `git status`。
- merge 回 main 前必须重新确认 `origin/main` 与本地 main 差异。

## 20. 当前推荐第一个 checkpoint

推荐第一个 checkpoint：

```text
A. Current interactive harness fidelity audit
```

类型：

```text
read-only audit / planning checkpoint
```

选择原因：

- 当前代码已经有 pipe-spawn interactive helpers，但没有 true PTY dependency 或 PTY harness。
- 在新增任何 PTY prototype 前，必须先标注现有 evidence 的 fidelity boundary。
- 该 checkpoint 不需要 real-provider、不读取 real home、不修改 production code、不新增依赖，风险最低。
