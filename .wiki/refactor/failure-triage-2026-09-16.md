# 30 项失败逐项定因（2026-09-16）

> 主簇删除后基线：3179 项 / 30 失败 / 6 文件。
> 本文逐项给出：根因位置（文件:行）→ 性质（测试过时 / 实现缺失 / 环境）→ 处置。
> 定因方法：单跑套件读断言 + 读生产实现 + 探针验证（`src/__probe*.ts`，已删除）。

## A. registry-rust-bridge.test.ts（8 项）

**根因：测试断言横跨三个字段族，其中两个在 CLI 活轨上无生产者。**

| 项 | 断言的字段 | 生产者 | 状态 |
|---|---|---|---|
| 1 `routes bash through the rust daemon` | `metadata.executionPath` | `runtime/execution/service.ts:129` | **存在但被丢弃** |
| 2 `keeps local TS execution available` | `content`、`details.executionReceipt`、`reportSafe.*`、`metadata.runtimeReceipt` | `tools/result/split.ts:32 createCommandToolResultSplit` | **CLI 链零调用**（全仓唯一调用者是 split.test.ts） |
| 3 `fails closed` | `metadata.executionPath`、`metadata.runtimeReceipt`、`recoveryReason` | 同上 | 混合 |
| 4 `surfaces stable failure metadata` | `metadata.executionPath` | 同 1 | **存在但被丢弃** |
| 5 `status timeouts` | `metadata.executionPath` | 同 1 | **存在但被丢弃** |
| 6 `status cancelled` | `metadata.executionPath` | 同 1 | **存在但被丢弃** |
| 7 `prefers structured failureKind` | `metadata.executionPath` | 同 1 | **存在但被丢弃** |
| 8 `keeps command failure details report-safe` | `details.executionReceipt.errorClass`、`reportSafe.redactionStatus`、`content` | 同 2 | **CLI 链零调用** |

**丢弃点已确认**：`core/tools/registry.ts:146-164` 组装 `approvedResult/deniedResult` 的 metadata 时只挑 `status/exitCode/stdout/stderr/failureKind/recoveryReason`，而 `withCommandExecutionProjection`（`runtime/execution/service.ts:114-132`）已把 `executionPath`、`errorClass` 放进返回值。

**结论：**

- **5 项（1/4/5/6/7）** = 真缺陷，修法：`runCommandTool` metadata 透传 `executionPath` + `errorClass`。**这是唯一需要改生产代码的地方。**
- **3 项（2/3/8）** = 断言的结构（`content`/`details`/`reportSafe`/`runtimeReceipt`）在 CLI 活轨上**没有任何生产者**。`ToolExecutionResult` 类型（`tools/types.ts:23-31`）确实声明了这些字段，但活轨唯一的结果构造器 `toolResultLifecycle.ts:138-158` 只产 `{success, output/error, metadata}`。处置：**收窄断言**（删掉 CLI 链不产出的字段），或先决定是否为 CLI 链补上这套投影——后者是 feature work，不在重构范围。

## B. core/shell/sessionRuntime.test.ts（3 项）

**根因已用探针复现（决定性证据）：**

- 项 1/2（`passes writer-started stopped unknown/unverified write effect`）：断言 `rendered` 含 `Continuation`。
- 探针复现：`continuityState` 有 37 个字段且 `lastFailureHandoffDiagnostic` 存在（快照层正常），但**渲染输出只有 6 行，无 `Continuation`**。
- **根因**：`core/shell/sessionTerminalState.ts:165` —— `renderContinuationSeedSummary` 在非 print 分支被 `if (input.viewMode === "verbose")` 门控。测试用默认 `compact`，因此永不渲染。
- 同时 `sessionRuntime.ts:194` 判定 `printMode = options?.outputMode === "print"`，测试未传 `outputMode` → 默认 `interactive` → `printMode=false` → 走非 print 分支。

**结论：** **测试过时**（期望的是 print 分支或 verbose 模式的行为）。处置：测试传 `outputMode: "print"` 或 `viewMode` 设为 verbose；或若认定 compact 模式下也应显示 continuation，则改实现（需产品判断）。

- 项 3（`prints streaming details in verbose mode`）：断言含 `[tool:start] bash`，生产渲染为 `⠹ [tool: bash]`（`sessionEventSurface.ts:94`）与 `✓ [tool: bash done]`（:113）。
  **结论：** **测试过时**，改断言匹配现格式；`[query:retry] role=coder` 部分需单独确认是否仍产出。

## C. core/shell/recovery.test.ts（2 项）

期望 `['planner->coder','coder->reviewer']`，实际 `['planner->coder:plan-ready', …]`。

**结论：** **测试过时**。生产在 `core/query/runtime/state.ts:370-371` 产 `` `${from}->${to}:${reason}` ``（带理由后缀）。改断言。

## D. core/shell/approvalTrustPolicy.test.ts（1 项）

`policy.evaluate(buildPrompt("node -v"), projectA)` 期望 `matchedGrant` 已定义且 `scopeLabel === "bash/spawn/process(node)"`，实际 `undefined`。

**根因：** `core/shell/approval/store.ts:55-57` 注释明示：
> `// For bash commands, scope must be exact command signature to prevent wildcard escalation backdoors`
> `const scopeKey = \`${toolName}:${operation}:cmd:${normalizedTarget}\``

即生产已从 **process-scope**（`node`）收紧为 **exact-command-scope**（`node --version` 与 `node -v` 不再互相匹配）。这是**有意的安全收紧**。

**结论：** **测试过时**，改断言为按精确命令签名匹配（`node -v` 不匹配 `node --version` 的授权）。

## E. orchestration/capabilityBoundaryProjection.test.ts（1 项）

`detectCommand("run the test command")` 返回 `"npm test"`，测试期望 `"npm test -- --help"`。

**根因：** `orchestration/capabilityBoundaryProjection.ts:33` `return "npm test"`，但 `RUN_COMMAND_ALLOWLIST`（:5-11）只含 `"npm test -- --help"`。实现**违反自身不变式**（该套件名即 `keeps run-command mapping inside the controlled allowlist`）。

**结论：** **实现缺陷**（非测试过时）。`detectCommand` 会返回不在 allowlist 内的命令。修实现：返回 `"npm test -- --help"`（与 allowlist 一致），或把 `"npm test"` 加入 allowlist（后者扩大命令面，不推荐）。

## F. cli-baseline.test.ts（15 项）

端到端测试（`spawnSync` 真实 CLI 子进程），**逐项给定因分类：**

### F1. real-provider 依赖（4 项）[环境]

- `proves default CLI real-provider chain in non-tty mode stops twice…`
- `keeps CLI real-provider path alive across one transient chat fetch failure`
- `proves default real CLI continuity: deny first approval, then resume…`
- `proves default real CLI continuity: interrupt mid-query, then /resume…`

失败形态：`Timed out waiting for …`. 本环境无真实 provider 凭据 → 走 synthetic 回退 → 超时。
**处置：** 加跳过条件（检测 provider 可用性）或标记为需要真实 provider 的环境专用套件。

### F2. `/continue` seed 与写效应延续（10 项）[需产品判断]

- `prefers completed current session for /continue follow-up…`
- `carries completed-session failure diagnostic through /continue…`
- `keeps stopped recoverable result context actionable…`
- `keeps writer-started stopped unknown write effect actionable…`
- `keeps writer-started stopped unverified write effect actionable…`
- `keeps selected-workspace writer-started unknown write effect truthful…`
- `keeps selected-workspace writer-started unverified write effect truthful…`
- `keeps non-write stopped patch-generation-failed evidence actionable…`
- `keeps non-write stopped stale-read evidence actionable…`
- `keeps non-write stopped approval-denied evidence actionable…`

失败形态：期望输出含 `seed=action-result` 等痕迹，实际为 `'steps: 1'`。

**根因（与 B 类同源）：** 这些期望的 `seed=action-result` 由 `buildActionResultSeedDecisionTrace` 产出，其唯一调用链（`planning/workflowTaskPlan.ts` → `orchestration/runtimeHandoffProjection.ts`）已在主簇删除中消失；活轨 `turn/projection.ts:122` 只写 `notes: ['steps: ${steps}']`。

**结论：** 这批断言**验证的是已删除链的能力**。但它们是端到端测试，覆盖"stopped 会话续跑的可操作性"。**处置需产品判断**：
- 若认定该能力随主簇一起废弃 → 删断言（但要接受 `/continue` 的可操作性验证覆盖损失）
- 若认定该能力仍应存在 → 是 feature work（在活轨重建 seed 投影），不属于重构

### F3. print 模式审批（1 项）[需调查]

`print approval boundary defaults deny without prompt`：期望输出含 `Approval`，实际 `'Synthetic reply: Run node --version…'`。
**未完成定因**：需要确认在 synthetic provider 下 print 模式的审批边界是否应被打印。倾向 [环境/测试过时] 混合。

## 汇总表

| 类别 | 项数 | 性质 | 处置 |
|---|---:|---|---|
| A-真缺陷 | 5 | 活轨丢弃 `executionPath`/`errorClass` | **改生产代码**（唯一） |
| A-结构缺失 | 3 | 断言 CLI 链不产出的字段 | 收窄断言 |
| B | 3 | 渲染门控 + 格式变更 | 改测试 |
| C | 2 | handoff 后缀 | 改测试 |
| D | 1 | 安全收紧（有意） | 改测试 |
| E | 1 | 实现违反自身不变式 | **改生产代码** |
| F1 | 4 | 无 provider 凭据 | 加跳过条件 |
| F2 | 10 | 依赖已删除链的能力 | **需产品判断** |
| F3 | 1 | 未完成定因 | 待查 |

**需要改生产代码的共 6 项**（A-真缺陷 5 + E 1）；需改测试的 6 项；环境 4 项；**需产品判断的 10 项**；待查 1 项。
