# True PTY Strategy / Capability Boundary

## 1. 总目标

建立 True PTY strategy / capability boundary 路线，先明确当前 Windows native / Node / Vitest / sandbox 环境是否能支撑 true PTY 自动化，再决定是否允许后续 PTY harness、approval prompt、Ctrl-C、EOF、slash command 测试。

本路线直接服务 user-minimal real main path：

- Step 1: 用户启动默认 CLI 时，startup surface、runtime mode、session state、prompt readiness 的证据必须区分 pipe stdin/stdout 与 true terminal。
- Step 4: permission escalation / approval prompt 只有在可信 interactive/TTY 基础上才能证明由用户真实批准或拒绝。
- Step 5: interrupt / close / EOF 的 terminal state 必须能真实归因，不把 pipe close 或 process kill 误称为 Ctrl-C/PTY 行为。
- Step 6: stopped / failed / interrupted 后 continue/resume 的语义必须建立在可信 terminal evidence 上。

本路线不改变 CLI 用户可见行为，不实现新的 interactive 功能；优先建立 PTY strategy、dependency approval 和 capability detector/skip contract，防止把 pipe-spawn smoke 包装成 true TTY coverage。

## 2. 当前分支

```text
pty-strategy-capability-boundary
```

从当前本地 `main` 创建。分支创建前 RTK 状态确认显示当前工作树 clean，最新提交为：

```text
eaf4780 Record approval provenance post-merge verification
```

## 3. base/main 状态

分支创建前确认：

```text
main...origin/main
HEAD: eaf4780 Record approval provenance post-merge verification
origin/main: eaf4780 Record approval provenance post-merge verification
```

含义：

- `approval-tool-provenance-contract` 已合并并封口。
- 本地 `main` 与 `origin/main` 在当前只读输出中对齐，无 ahead 标记。
- 本路线从当前本地 `main` 创建；不得 reset、rebase 或丢失本地提交。
- PowerShell profile warning 是已知环境噪音，不作为产品失败。

## 4. 背景审查结论

此前已经完成或阶段性收口的路线包括：

- `main-path-boundaries`: 三大巨型文件第一轮边界治理。
- `real-main-path-evidence`: CLI / real-ish main path evidence。
- `long-session-continuity-hardening`: compact / replay / resume / continue continuity。
- `real-provider-safe-evidence`: real-provider safety attribution / redaction / dry-run evidence。
- `live-tty-interactive-evidence`: pipe-spawn interactive evidence。
- `pty-interactive-harness-fidelity`: 明确 pipe-spawn 不等于 true PTY，true PTY 继续前需要 strategy / dependency approval。
- `approval-tool-provenance-contract`: approval/tool execution provenance contract 已封口。

最新结论：live/default CLI 的最高剩余交互风险不是继续堆 pipe smoke，而是当前 evidence 是否真实代表 TTY。若没有 true PTY strategy，approval prompt、Ctrl-C、raw mode、terminal rendering、PTY close 都不能被称作成熟证据。

## 5. 为什么选择 True PTY strategy / capability boundary

真实用户默认入口是 terminal 中的 interactive CLI，而不是 `child_process` pipe。PTY / terminal 行为会影响：

- `process.stdin.isTTY` / `process.stdout.isTTY` 下是否进入不同分支。
- readline prompt、keypress、raw mode、echo、cursor rendering 是否稳定。
- approval prompt 是否真的可交互。
- Ctrl-C / interrupt / close / EOF 是否被正确归因。
- terminal output 是否污染 structured result 或 non-interactive output。
- 测试不可用时是否清楚 skip/defer，而不是伪造 true TTY pass。

因此本路线先选择 capability boundary：明确能测什么、不能测什么、需要什么依赖审批、怎样跳过不可用环境，避免继续把 pipe-spawn 行为误称为 true PTY coverage。

## 6. 明确不做的方向

- 不新增 provider，不改 auth core。
- 不读取、复制、修改、清理或打印真实 auth/key/provider 配置。
- 不运行 real-provider smoke，不默认运行 `verify-real-user-capabilities`。
- 不处理 Windows EBUSY。
- 不修 `runMvpIntegratedFlow` 全量旧失败。
- 不实现完整 apply_patch、AST patch、rollback、batch engine、stream mid-flight retry、全局网络重试。
- 不继续 provider readiness、real-provider dry-run、edit/patch marker、verification surface、long-session、approval/tool provenance、普通 live TTY pipe smoke 同族 proof，除非来自 PTY strategy / capability 缺口。
- 不为了减少行数而继续拆三大巨型文件。
- 不引入需要人工手动操作的测试。
- 未经明确 approval，不新增 `node-pty` 或其它重依赖到 package manifests。
- 不把 pipe-spawn smoke 包装成 true TTY coverage。

## 7. 环境约束

目标仓库：

```text
D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents
```

参考仓库只读：

```text
D:\LenovoSoftstore\pyproject\source-claudecode
D:\LenovoSoftstore\pyproject\opencode
```

真实配置边界：

- real-provider home 固定为 `D:\Test\home-sf`。
- 不得读取、复制、修改、清理或泄露真实 auth/key/provider 配置。
- synthetic home 固定为 `D:\Test\pca-home-synth`。
- 使用 synthetic provider 时设置 `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`。
- 失败态或隔离验证只能使用 synthetic/test home 或临时 test home。

命令边界：

- RTK command discipline active。
- 读文件、搜索、git status/diff/log、测试、构建、大输出命令必须显式使用 `rtk`。
- raw git 仅用于 branch/switch/add/commit/push/merge 等 mutation，并说明理由。

## 8. 参考实现约束

目标仓库优先；参考仓库只做小范围语义对照，不照抄代码。

Claude Code targeted reference:

- `commands.ts`
- `query.ts`
- `QueryEngine.ts`
- interactive prompt / terminal / readline / approval 相关文件
- `cli/print.ts` 或 structured output 相关文件
- permission / tool result 相关文件

opencode targeted reference:

- `packages/opencode/src/cli/cmd/run.ts`
- `packages/opencode/src/acp/agent.ts`
- `packages/opencode/src/permission/permission.ts`
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/bash.ts`
- `packages/opencode/src/session` 或 event 相关文件

吸收点：

- interactive 与 print/non-interactive 如何分层。
- TTY / non-TTY 是否有不同 behavior。
- approval prompt 如何只在真实 interactive 下出现。
- interrupt / close / EOF 如何归因。
- terminal output 如何避免污染 structured result。
- 测试不可用时如何 skip/defer，而不是伪造 pass。

## 9. 三大巨型文件新增代码约束

三大文件不是绝对禁止修改，但必须先判断功能归属：

- `packages/ts-shell/src/entrypoints/cli.tsx`: 只放真正属于入口 wiring、readline/TTY entry boundary 的最小逻辑。
- `packages/ts-shell/src/session/SessionManager.ts`: 只放 durable session state、persistence、current pointer 和最小 wiring。
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`: 只放主 orchestration sequencing。

新增 PTY capability detector、test skip helper、interactive harness、terminal output parser、dependency probe、fixture builder 优先放到：

- `packages/ts-shell/src/test-utils/*`
- `packages/ts-shell/src/core/shell/*`
- `scripts/*`

`packages/ts-shell/src/cli-baseline.test.ts` 只保留测试编排，不塞大量 helper。若必须修改三大巨型文件，checkpoint notes 必须说明为什么该功能不能放到独立模块。

## 10. 当前已闭合能力

当前已阶段性闭合：

- packaged CLI / `--print` / stdin boundary。
- synthetic golden main path。
- result/failure terminal contract。
- provider readiness 与 real-provider safe attribution dry-run。
- long-session compact / replay / resume continuity。
- approval/tool execution provenance internal contract。
- pipe-spawn interactive startup、slash command、stopped follow-up、print boundary、EOF close smoke。
- PTY interactive harness fidelity 路线已明确 pipe-spawn 不等于 true PTY，并把 D-H deferred pending strategy approval。

这些能力证明 CLI 入口和 pipe-driven behavior 可运行，但不能证明 true PTY terminal fidelity。

## 11. 当前主要风险

- `child_process` pipe harness 下 `process.stdin.isTTY` 通常为 false，不能代表真实 terminal。
- interactive approval prompt 可能只在 true TTY 中出现，pipe tests 无法覆盖真实交互。
- Ctrl-C / SIGINT 与 process kill / stdin close 语义不同。
- readline prompt rendering、raw mode、cursor behavior、echo 可能在 TTY / non-TTY 下分叉。
- 当前 Windows native Codex sandbox 已多次出现 `EPERM`、spawn、dist 写入限制；PTY tests 必须可 skip 并能归因。
- `node-pty` 一类 native dependency 可能带来 Windows build、Node ABI、CI、sandbox、flake 风险。
- 如果没有 capability contract，后续测试很容易把 pipe-spawn fallback 误报为 true PTY coverage。

## 12. 当前 pipe-spawn interactive coverage boundary

目标仓库事实：

- `packages/ts-shell/src/test-utils/cliHarness.ts` 的 interactive helpers 使用 `ChildProcess`、stdin/stdout/stderr pipe、`cli.stdin.write/end`。
- `packages/ts-shell/src/cli-baseline.test.ts` 已把当前 interactive smoke 命名为 `pipe-spawn interactive ...`，并保留 `interactive` filter。
- `packages/ts-shell/src/entrypoints/cli.tsx` 存在生产 TTY 边界：`process.stdin.isTTY`、readline setup、keypress、stdin reader。
- `packages/ts-shell/package.json` 当前无 runtime dependencies，dev dependencies 为 `vitest`、`typescript`、`tsx`；package manifest / lockfile 中未找到 `node-pty`。

当前 pipe coverage 可以证明：

- default CLI startup surface 和 prompt readiness marker 在 pipe spawn 下可见。
- pipe stdin 可驱动 harmless slash command。
- pipe stdin 可驱动 stopped session follow-up。
- `--print` / non-interactive boundary 不渲染 interactive approval prompt。
- pipe stdin close / EOF-like close 不应伪装 success。

当前 pipe coverage 不能证明：

- terminal raw mode 或 TTY prompt fidelity。
- `process.stdin.isTTY === true` / `process.stdout.isTTY === true` 下的行为。
- 真实 interactive approval prompt 可交互。
- Ctrl-C / SIGINT 的 terminal attribution。
- PTY close 与 pipe close 是否一致。
- cursor、echo、line discipline、terminal rendering 是否稳定。

## 13. PTY strategy 候选方案

候选方案必须在单独 checkpoint 中评估，未经批准不进入依赖或 harness 实现。

1. `node-pty` / ConPTY based harness
   - 优点：最接近 true PTY / Windows terminal 行为，可覆盖 `isTTY`、prompt、Ctrl-C。
   - 风险：native dependency、Node ABI、Windows build tools、CI/sandbox flake。

2. Existing terminal runner / inherited TTY manual runner
   - 优点：已有 manual/live runner 模式可检查真实 terminal。
   - 风险：不可自动化，不应作为 CI merge gate，不满足可重复 smoke 要求。

3. Capability detector only, no PTY dependency yet
   - 优点：低风险，先防止误称 true TTY coverage。
   - 风险：不能新增 true PTY evidence，只能 blocked/deferred。

4. External script-level PTY probe
   - 优点：把 native probing 与 production CLI 分离。
   - 风险：仍可能需要 native dependency 或 platform-specific behavior。

当前默认策略：先执行 A-C，若 detector 设计清晰再做 D；是否引入 `node-pty` 必须经过 E 的 explicit dependency decision checkpoint。

## 14. dependency approval 规则

- 不得在 planning、audit、boundary documentation checkpoint 中新增 PTY dependency。
- 如必须引入 `node-pty` 或等价依赖，必须先单独完成 dependency decision checkpoint。
- dependency decision 必须记录：
  - Windows native 可运行性。
  - Node version / ABI 支持。
  - install/build/CI 风险。
  - sandbox 下失败归因方式。
  - skip/defer 策略。
  - 是否影响 package install、lockfile、workspace scripts。
- dependency decision 不得与 PTY smoke、approval prompt、interrupt 测试混在同一 commit。
- dependency approval 缺失时，D-H 必须 blocked/deferred，不得用 pipe fallback 代替。

## 15. PTY capability detector / skip 规则

未来 detector / skip helper 必须满足：

- 可自动运行，无需人工输入。
- 不读取、不写入、不清理 `D:\Test\home-sf`。
- 只使用 synthetic/test home 或临时 test home。
- 明确区分：
  - PTY dependency unavailable。
  - PTY environment unsupported。
  - sandbox / spawn / EPERM 环境问题。
  - test harness flake。
  - product regression。
- unavailable 时 skip/defer 信息必须清楚，不能把 skip 记作 true PTY pass。
- 不 fallback 到 pipe harness 后仍称为 PTY coverage。
- timeout 后必须清理子进程和临时资源。
- 不输出 secret、real home config 或 credential 片段。
- 不向生产 CLI 暴露 fake `FORCE_TTY` 一类测试开关来制造证据。

## 16. 路线分阶段 backlog

Current:

- A. PTY strategy and dependency audit
  - Type: read-only audit / planning checkpoint.
  - Goal: audit package dependencies, Vitest/Node/Windows/sandbox capability, existing cliHarness and interactive tests; decide whether true PTY is feasible without adding dependencies.

Backlog:

- B. PTY coverage boundary contract
- C. PTY capability detector design
- D. PTY capability detector implementation
- E. Dependency decision checkpoint
- F. Minimal true PTY harness prototype
- G. True PTY startup readiness smoke
- H. True PTY approval prompt smoke
- I. True PTY interrupt attribution smoke
- J. Route audit / merge readiness

Completed:

- Planning: created `PLANS.pty-strategy-capability.md` from current local `main`.
- A. PTY strategy and dependency audit
  - Result: completed as a read-only audit / planning checkpoint.
  - Files changed: `PLANS.pty-strategy-capability.md`.
  - Target audit findings:
    - Root `package.json` keeps `engines.node` at `>=20.0.0`; the current local Node runtime reported by `rtk proxy node -v` is `v24.12.0`, so any future native PTY dependency must be checked against current Node ABI / Windows support before adoption.
    - `packages/ts-shell/package.json` has no runtime dependencies and only `vitest`, `typescript`, and `tsx` as dev dependencies.
    - `rtk grep "node-pty" package.json package-lock.json packages/ts-shell/package.json` found no manifest or lockfile reference to `node-pty`.
    - `rtk npm ls node-pty --workspaces` returned an empty dependency tree, confirming no installed workspace dependency named `node-pty`; the non-zero exit is expected for absent dependency evidence, not a product failure.
    - `packages/ts-shell/src/test-utils/cliHarness.ts` drives CLI processes through `ChildProcess` stdin/stdout/stderr pipes and does not create a PTY.
    - `packages/ts-shell/src/cli-baseline.test.ts` creates `spawnCli` with `stdio: ["pipe", "pipe", "pipe"]`; current interactive smokes are already named `pipe-spawn interactive ...`.
    - `scripts/live-interactive-runner.mjs` uses inherited stdio and requires `process.stdin.isTTY` / `process.stdout.isTTY`; it is useful manual/live-runner evidence but not an automated PTY gate.
    - `packages/ts-shell/src/entrypoints/cli.tsx` has production TTY boundaries via `stdinIsTty`, non-interactive approval gating, readline setup, keypress handling, and SIGINT handling.
    - `packages/ts-shell/src/cli-baseline.test.ts` already notes OS-level SIGINT is not reliable from the non-TTY spawn harness, reinforcing that current SIGINT coverage is not true terminal interrupt coverage.
    - `rtk find "*.yml" .github` returned no workflow files, so CI PTY support cannot be inferred from repository workflow configuration in this checkout.
  - Reference audit findings:
    - opencode `cli/cmd/run.ts` branches on `process.stdin.isTTY` / `process.stdout.isTTY`, reinforcing that TTY and non-TTY paths are semantically distinct.
    - opencode permission events include `permission.asked`, reinforcing that approval prompt/event handling is a separate layer from generic process IO.
    - Claude Code targeted permission grep showed permission denial tracking in query/runtime boundaries; no code was copied.
  - Feasibility conclusion:
    - Do not introduce `node-pty` or any PTY dependency in this checkpoint.
    - Current automated tests can prove pipe stdin/stdout behavior only; they cannot prove true PTY prompt fidelity, raw mode, Ctrl-C, PTY close, or approval prompt interactivity.
    - The next safest checkpoint is B. PTY coverage boundary contract, limited to documentation/naming/comment boundary work if any remaining wording can mislead.

## 17. 每个 checkpoint 的目标、允许修改文件、禁止修改文件、验证命令

### A. PTY strategy and dependency audit

目标：

- 只读审计 package dependencies、Vitest/Node/Windows/sandbox 能力、现有 `cliHarness` 和 interactive tests。
- 判断 true PTY 可行性，不新增依赖。
- 更新 Completed / Current / Backlog / Verification / Notes。

允许修改：

- `PLANS.pty-strategy-capability.md`

禁止修改：

- production code。
- test helper code。
- dependency manifests / lockfiles。
- provider/auth core。
- `D:\Test\home-sf`。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### B. PTY coverage boundary contract

目标：

- 把 pipe-spawn coverage 与 true PTY coverage 的边界写入计划和测试注释。
- 避免后续误称。

允许修改：

- `PLANS.pty-strategy-capability.md`
- focused test comments / names if they become misleading.

禁止修改：

- production CLI behavior。
- PTY dependency。
- provider/auth core。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
```

### C. PTY capability detector design

目标：

- 设计可测试的 capability detector / skip helper。
- 明确 input/output、skip reason、环境归因、future PTY dependency 接入方式。
- 不改 CLI 生产逻辑。

允许修改：

- `PLANS.pty-strategy-capability.md`
- optional design note under `packages/ts-shell/src/test-utils/*` only if not imported by production code.

禁止修改：

- production CLI behavior。
- dependency manifests / lockfiles。
- true PTY harness implementation。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### D. PTY capability detector implementation

目标：

- 在 C 设计清晰后新增 test-utils helper。
- 默认不引入新依赖，只检测当前可用能力。

允许修改：

- `packages/ts-shell/src/test-utils/*`
- focused tests。
- `PLANS.pty-strategy-capability.md`

禁止修改：

- production CLI behavior。
- dependency manifests / lockfiles，除非先完成 E。

验证：

```powershell
rtk npm run build -w packages/ts-shell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
```

### E. Dependency decision checkpoint

目标：

- 如果必须引入 `node-pty` 或等价依赖，单独形成 approval 记录。
- 未经明确批准不得加入 `package.json`。

允许修改：

- `PLANS.pty-strategy-capability.md`
- dependency decision docs.

禁止修改：

- dependency manifests / lockfiles，除非用户明确批准。
- PTY smoke implementation。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### F. Minimal true PTY harness prototype

目标：

- 只有在 D/E 明确允许后新增最小 PTY harness。
- 不执行真实 provider turn，不改 CLI 生产逻辑。

允许修改：

- `packages/ts-shell/src/test-utils/*`
- `scripts/*`
- `PLANS.pty-strategy-capability.md`

禁止修改：

- production CLI behavior。
- provider/auth core。
- dangerous command execution。

验证：

```powershell
rtk npm run build -w packages/ts-shell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "PTY"
```

### G. True PTY startup readiness smoke

目标：

- 用 true PTY 验证 startup surface 和 prompt readiness。
- 无 PTY 环境必须 skip，不得 fail CI。

允许修改：

- PTY harness/test helper。
- focused test orchestration。
- `PLANS.pty-strategy-capability.md`

禁止修改：

- production CLI behavior，除非发现入口 wiring 明确缺陷并记录原因。
- provider/auth core。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "PTY"
rtk npm run verify:cli-entry
```

### H. True PTY approval prompt smoke

目标：

- 在 synthetic/test home 下验证 approval prompt 可交互。
- 不执行危险命令。

允许修改：

- PTY harness。
- approval prompt fixture。
- focused tests。
- `PLANS.pty-strategy-capability.md`

禁止修改：

- permission model expansion。
- real provider access。
- dangerous command execution。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "PTY"
rtk npm run verify:result-contract
```

### I. True PTY interrupt attribution smoke

目标：

- 验证 Ctrl-C / interrupt 不产生虚假 success，并保留 session state。

允许修改：

- PTY harness。
- focused tests。
- `PLANS.pty-strategy-capability.md`

禁止修改：

- broad terminal taxonomy expansion。
- Rust execution-plane semantics，除非发现明确边界缺口并另开路线。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "PTY"
rtk npm run verify:result-contract
```

### J. Route audit / merge readiness

目标：

- 路线阶段性完成后集中验证 build、cli-entry、interactive tests、result-contract、synthetic golden。
- 不继续扩同族 proof。

允许修改：

- `PLANS.pty-strategy-capability.md`
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
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
rtk npm run verify:cli-entry
rtk npm run verify:result-contract
HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path
```

## 18. 失败归因规则

所有失败先归因：

1. 本路线引入的真实回归。
2. PTY dependency unavailable。
3. PTY environment unsupported。
4. PTY harness flake。
5. 既有旧失败。
6. 过宽 filter 命中 unrelated case。
7. 环境问题，例如 sandbox EPERM、spawn EPERM、dist 写入失败、网络超时、PowerShell profile warning。
8. 并行分支或 main 差异导致。

处理规则：

- 本路线真实回归：允许最小修复并重跑相关验证。
- PTY unavailable：标记 skip/deferred/blocked，不伪造成通过。
- harness flake：优先收窄 helper 和断言，不改生产行为。
- 既有旧失败：记录证据，不扩大修复。
- 环境问题：可同命令重跑一次或 elevated rerun，并记录为环境问题。
- 无法确认归因：停止 checkpoint，不 merge。

## 19. RTK/audit 残留规则

验证可能产生：

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`
- 同类 audit/runtime residue。

结束前必须清理或还原，不得提交：

- audit 残留。
- real home 文件。
- temporary home。
- 无关生成物。

如果 `rtk git status` 或 `rtk git restore` 会再次写 audit，说明原因后使用最小 raw `git status --short` / `git restore` 做最终确认。

## 20. 提交/push 规则

每个 checkpoint 一个 commit。

Planning round commit:

```text
Plan PTY strategy capability boundary track
```

后续 checkpoint commit message 应描述实际 checkpoint，例如：

- `Audit PTY strategy dependency boundary`
- `Document PTY coverage boundary contract`
- `Design PTY capability detector`

Push 规则：

- push 失败如果是认证、网络、权限、审核失败，不绕过、不反复重试。
- 记录 commit hash、push 失败原因、当前 git status。
- merge 回 main 前必须重新确认 `origin/main` 与本地 main 差异。

## 21. 当前推荐第一个 checkpoint

推荐第一个 checkpoint：

```text
A. PTY strategy and dependency audit
```

类型：

```text
read-only audit / planning checkpoint
```

选择原因：

- 当前代码已有 pipe-spawn interactive helpers 和清晰 test naming，但没有 true PTY dependency 或 PTY harness。
- 在新增 capability detector 或任何 PTY prototype 前，必须先确认当前 package / Node / Vitest / Windows / sandbox 能力边界。
- 该 checkpoint 不需要 real-provider、不读取 real home、不修改 production code、不新增依赖，风险最低。

本轮只创建路线计划文件，不执行 A。

## Checkpoint Status Override

- Completed: Planning.
- Completed: A. PTY strategy and dependency audit.
- Current: B. PTY coverage boundary contract.
- Backlog: C-J as listed above.
- Verification for Planning: `rtk git status --short` passed with only `PLANS.pty-strategy-capability.md` untracked before commit; `rtk npm run build -w packages/ts-shell` first failed with sandbox `dist` write `EPERM`, then passed with the same RTK command elevated; `rtk git diff` passed.
- Verification for A: read-only audit commands completed with RTK. `rtk git status --short --branch` passed clean before checkpoint edits. Target audit used `rtk read package.json`, `rtk read packages/ts-shell/package.json`, `rtk read packages/ts-shell/src/test-utils/cliHarness.ts`, `rtk grep "pipe-spawn interactive" packages/ts-shell/src/cli-baseline.test.ts`, `rtk grep "stdio" packages/ts-shell/src/cli-baseline.test.ts packages/ts-shell/src/test-utils/cliHarness.ts scripts/live-interactive-runner.mjs`, `rtk grep "node-pty" package.json package-lock.json packages/ts-shell/package.json`, `rtk npm ls node-pty --workspaces`, `rtk proxy node -v`, `rtk find "*.yml" .github`, `rtk grep "isTTY" packages/ts-shell/src/entrypoints/cli.tsx scripts/live-interactive-runner.mjs D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\cli\cmd\run.ts`, `rtk grep "SIGINT" packages/ts-shell/src/entrypoints/cli.tsx packages/ts-shell/src/cli-baseline.test.ts D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\cli\cmd\run.ts`, and `rtk grep "permission.asked" D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\permission\permission.ts D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\acp\agent.ts D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\tool\tool.ts`. `rtk git status --short` passed with only `PLANS.pty-strategy-capability.md` modified. `rtk npm run build -w packages/ts-shell` first failed with sandbox `dist` write `EPERM`, then passed with the same RTK command elevated.
- Notes: A did not modify production code, tests, dependency manifests, lockfiles, provider/auth core, `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`. A did not read or modify `D:\Test\home-sf`. Current automated evidence remains pipe-spawn only; true PTY strategy remains unapproved pending later checkpoints.
