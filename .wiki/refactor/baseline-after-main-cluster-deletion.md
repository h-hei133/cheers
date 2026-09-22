# Refactor Step 2.5-C-3 后基线（2026-09-16）

> 主簇删除（564 文件）后的新回归对照物，取代 `failures-baseline.md` 的 2026-09-15 版本。
> 测量：`cd packages/ts-shell && npx vitest run`（全量）。
> 结果：**3179 项测试、30 失败、6 文件**（删除前为 4450 项、51 失败、14 文件）。

## 失败清单（30 项）

### cli-baseline.test.ts（15 项）

真实 CLI 子进程端到端。全部为既有失败：

- 4 项 real-provider 链（需真实 provider，本环境 synthetic 回退）
- 10 项 `/continue` seed 与写效应延续断言
- 1 项 print 模式审批边界（`expected 'Synthetic reply: …' to include 'Approval'`）

注：`persists session metadata to local filesystem` 在本次全量运行中通过，单跑两次均通过（2.5s 时序窗口），判定为**并行负载下的抖动项**，不计入稳定失败集。

### core/tools/registry-rust-bridge.test.ts（8 项）

被测对象是活跃的 `core/tools/registry.ts`，断言 `metadata.executionPath === 'rust-daemon'` 与 `errorClass === 'command_failed'`。生产侧 `runCommandTool` 组装 metadata 时只挑 `status/exitCode/stdout/stderr/failureKind/recoveryReason`，丢弃 `executionPath`/`errorClass`（`runtime/execution/service.ts` 的 `withCommandExecutionProjection` 已提供）。**活轨真缺陷，唯一需要修生产代码的一处。**

### core/shell/sessionRuntime.test.ts（3 项）

`passes writer-started stopped unknown/unverified write effect into the next prompt run`（期望输出含 `Continuation`）+ `prints streaming details in verbose mode`。活轨测试锁旧渲染语义。

### core/shell/recovery.test.ts（2 项）

期望 `['planner->coder','coder->reviewer']`，实际 `['planner->coder:plan-ready', …]`——handoff 投影带阶段后缀是有意变更（`core/query/runtime/state.ts`），测试锁旧格式。

### core/shell/approvalTrustPolicy.test.ts（1 项）

`persists allow-always by project-scoped process target`：生产有意从 process-scope 收紧为 exact-command-scope（`core/shell/approval/store.ts` 注释明示防通配提权），测试锁旧语义。

### orchestration/capabilityBoundaryProjection.test.ts（1 项）

`detectCommand("run the test command")` 返回 `npm test`，测试期望 `npm test -- --help`（allowlist 内成员）。实现与自身声明的"保持在受控 allowlist 内"不变式不符。

## 随删除消失的失败簇（21 项）

| 原簇 | 项数 | 原因 |
|---|---:|---|
| R2 MCP 占位桩 | 16 | `errorTaxonomy` / `localExecutionGate` / `runtime.mcp-stale-reconnect` / `runtime.test` 均为主簇内测试，随主簇删除 |
| R3 atomic-rollback 契约冲突 | 5 | `targetSetEditRoute` / `targetSetEditRecovery` / `editProposalApply` 测试随主簇删除 |
| CLI smoke 落盘抖动 | 1 | `persists session metadata` 本次通过（抖动项） |

原 R1 簇从 11 项收敛为 8 项（`runtime.test.ts` 的 3 项随主簇消失，`registry-rust-bridge` 8 项保留）。

## 当前验证门控状态

| 检查 | 结果 |
|---|---|
| `npm run build:ts` | 通过 |
| `npm run validate` | 通过 |
| `dist/cli.js --version` | `0.1.0 (ts-shell MVP)` |
| golden gate `GOLDEN_MAIN_PATH` | 通过 |
| `tsc --noEmit`（含测试文件） | 251 错误，全部在测试文件 |
| `tsc -p tsconfig.build.json`（生产门控） | **0 错误** |
