# Refactor Step 1 — 全量测试失败基线（2026-09-15 实测）

> 唯一回归对照物。重构每步完成后跑同一命令，diff 此清单：
> 基线内消失 = 意外修复（记录）；基线外新增 = 回归（立即停下）。
> 测量命令：`cd packages/ts-shell && npx vitest run`（全量）。
> 57 项失败 / 18 个文件 / 4444 项总计。另一轮并行重跑为 71 失败（21 文件），差额 14 项全部是 5s 超时抖动（cli-baseline/harness 并行负载），单跑即通过或稳定失败于同一断言。以本文 57 项（较轻负载、与单套件复核一致）为准。

## 失败清单（按簇分组）

### 簇 R1：rust-daemon 桥接元数据投影断裂 —— 11 项 [real-defect]

`registry-rust-bridge.test.ts` (8) + `runtime.test.ts` (2) + `runtime.test.ts` W2 超时 1 项

- 断言：`result.metadata` 应含 `executionPath: 'rust-daemon'`；收到的是 `{status:'failed', recoveryReason:'Rust daemon execution failed: daemon boot failed', stderr:…}`。
- 生产根因（已核实）：`runtime/execution/service.ts:withCommandExecutionProjection` 把 `executionPath` 放进返回值，但 `core/tools/registry.ts:runCommandTool`（81-162 行）组装 `approvedResult/deniedResult` metadata 时**只挑 status/exitCode/stdout/stderr/failureKind/recoveryReason，丢弃 executionPath 与 errorClass**。daemon 分支本身工作正常（stdout 'daemon path' 送达），断的只是投影层。
- 历史核实：log.md 2026-09-13 已记"rust-bridge/MCP 18 失败与基线一致"，此簇与 MCP 簇同为长期存在。
- 修法方向：`runCommandTool` metadata 透传 `executionPath`（含 `ts-local`/`rust-daemon`/`mcp-stdio` 全路径）+ 补 `command_failed` errorClass 断言（`surfaces stable failure metadata` 项期望 `result.metadata.errorClass === 'command_failed'` 或等价字段，具体字段名以 `classifyCommandExecutionOutcome` 实际返回为准）。

### 簇 R2：MCP 工具执行占位桩 —— 16 项 [real-defect]

`errorTaxonomy.test.ts` (3) + `localExecutionGate.test.ts` (2) + `runtime.mcp-stale-reconnect.test.ts` (7) + `runtime.test.ts` MCP 项 (4)

- 断言：`echo:hello`、`isError:true` 时 `success:false`、stale descriptor 不可见等。
- 收到：`'MCP tool mcp__stdioEcho__echo_message called'`（恒定字符串）、`success:true`。
- 生产根因（已核实）：`core/tools/registry.ts:562-568`——MCP 工具的 `execute` 是**占位桩**：`return approvedResult(\`MCP tool ${tool.qualifiedName} called\`)`，从不调用 `mcpGateway.invokeTool`。全仓 `.invokeTool(` 生产调用仅 `gateway.ts:217`（client 内部自调）。`isError` 类型字段（`McpToolCallResult`）无任何生产消费方。
- 影响面：MCP 工具在真实运行中**全部假成功**——这是产品级缺陷，不只是测试失败。
- 修法方向：registry MCP execute 接 `options.mcpGateway.invokeTool(serverName, toolName, args)`，按 `McpToolCallResult.isError` 映射 `deniedResult/approvedResult`，透传 `executionPath:'mcp-stdio'`；stale-reconnect 语义依赖真实执行的 failure 分类，接线后按 gateway 的 blocked-error 路径自然恢复。

### 簇 R3：targetSetEditRoute 原子回滚 vs 部分失败契约冲突 —— 5 项 [contract-conflict]

`targetSetEditRoute.test.ts` (2) + `targetSetEditRecovery.test.ts` (1) + `editProposalApply.test.ts` (1) + `capabilityBoundaryProjection.test.ts` (1)

- 断言：中途写失败后期望 `status:'partial-failure'`、`changedFiles=['src/a.ts']` 保留、b.ts 维持已写内容、evidence 含 `target-set-edit-rollback-ready`（保留现场+回滚就绪元数据）。
- 收到：`'failed'` 或 `'preflight-stopped'`、`changedFiles` 清空。
- 生产根因（已核实）：`orchestration/targetSetEditRoute.ts:322-331`"True Atomicity Rollback"——任一文件失败即回滚全部已写文件并 `changedFiles.length = 0`。
- 决定性历史证据：**在引入该回滚的提交 `3bc2ad5b`（2026-08-30）的树上，这两个测试当时就失败**（实测 2 failed | 3 passed）。提交信息声称"28/28 Vitest suites passed"，与事实不符——该提交未跑或未看此套件。
- 定性：**不是回归，是从引入日起的静默契约冲突**。测试代表"保留部分失败现场+回滚可用性元数据"契约；生产代表"全量回滚"契约。真二选一，需裁决：保留 atomic rollback（改测试期望）还是恢复 partial-failure 语义（删回滚块）。不裁决前不动。

### 簇 R4：seed=action-result 上下文透传丢失 —— 9 项 [real-defect]

`cli-baseline.test.ts` 9 项（`keeps … actionable through bare and follow-up` 系列）

- 断言：stopped 结果的决策追踪（`seed=action-result`）应出现在 /continue 后续上下文。
- 收到：`'steps: 1'`，无 seed 行。
- 根因方向：`session/continuation/stoppedSessionContinuity.ts` 的投影在 Phase 4 turn 重构（a7418fcb，2026-09-12 双车道 review 记录过"转交跟踪 6 项记入原则文档 §11.6"）后未同步。log.md 2026-09-12 已记"聚合失败集 118→57 无新增"——57 项与当前完全吻合，此簇属于当时已知并跟踪的债。
- 修法方向：对照 §11.6 跟踪项与 `deriveStoppedSessionContinuitySurface` 现行为，恢复 seed 行注入或按新契约更新测试。

### 簇 R5：非交互 CLI 行为漂移 —— 5 项 [known-gap]

`cli-baseline.test.ts`（approval deny 默认、real-provider 超时、session 持久化）

- `print approval boundary defaults deny without prompt`：期望输出含 'Approval'，收到 'Synthetic reply: Run node --version'。
- `persists session metadata to local filesystem`：`expected 0 to be greater than 0`（无落盘）。
- real-provider 3 项：等待非 TTY 真实 provider turn 超时（provider mode disabled 环境下必然超时——测试设计依赖真实 provider 可用）。
- 定性：产品行为与测试期望漂移 + 环境依赖混合。与 log.md 2026-09-13 记录的 CLI 烟测失败集一致。
- 处置：deny 默认与落盘两项按当前产品意图复核后修测试或修实现；real-provider 3 项需要环境标记（跳过条件），单独处理。

### 簇 R6：harness 场景 5s 预算超时 —— 7 项 [test-infra]

`browserExecutionReceiptScenarioExamples` (2) + `browserExternalRunnerScenarioExamples` (2) + `agentCliScenarioExamples` (1) + `browserPlaywrightLocalScenarioExamples` (1) + `browserSkillRunnerScenarioExamples` (1)

- 全部形态：`Test timed out in 5000ms`（vitest 默认单测 5s 预算）。
- 根因：这些场景起真实 CLI 子进程（`agentCliProcess.ts` spawn tsx + cli，规格超时 10s）+ 浏览器 runner fixture。子进程冷启动（tsx transform + CLI init）在全量套件并行负载下超 5s 单测预算。
- 定性：**测试基建问题，非产品缺陷**。全量重跑时多出的 14 项失败也全部是此类超时抖动。
- 处置：给场景 it() 加 `timeout`（≥20s）或套件级 `{ timeout: 30000 }`；不需要改任何生产代码。

### 簇 R7：handoff/continuity 投影漂移 —— 6 项 [real-defect]

`recovery.test.ts` (2) + `sessionRuntime.test.ts` W5 continuation (2) + `approvalTrustPolicy.test.ts` (1) + `sessionRuntime.test.ts` verbose (1)

- recovery 2 项：期望 `['planner->coder','coder->reviewer']`，收到 `['planner->coder:plan-ready','coder->reviewer:…']`——handoff 投影带上了阶段后缀（新语义），测试锁旧形态。
- sessionRuntime 2 项：期望输出含 'Continuation'，收到无该词——stopped 写效应延续上下文的展示投影在 turn Phase 4 后未同步（与 R4 同族但表面不同）。
- approvalTrustPolicy 1 项：`expected undefined not to be undefined`——allow-always 持久化字段读取失败（project-scoped key 读写路径之一断裂）。
- verbose 1 项：`prints streaming details in verbose mode` 期望 true 收 false——verbose 投影开关漂移。
- 定性：turn Phase 4 前后投影层语义演进的遗留漂移，多数应为"更新测试锁新语义"，approvalTrustPolicy 一项需查实现。

## 非失败基线（同轮实测）

| 测量 | 结果 |
|---|---|
| `tsc --noEmit`（含测试文件） | 539 错误 **全部在 .test.ts**；生产 0 错误 |
| `tsc -p tsconfig.build.json`（生产 build，排除测试） | 通过（仓库门控口径） |
| golden gate `GOLDEN_MAIN_PATH` | 1/1 通过 |
| `cargo test`（rust-core） | 2/2 通过，0 失败 |
| `npm run validate`（结构校验） | 通过 |
| pytest（python-eval） | **未跑成**：无 pytest 模块（toolchain.mjs 硬编码 `D:\conda-envs\coding_agents\python.exe` Windows 路径，本 WSL 环境不可用；本地 8 个 conda env 均无 pytest）。[environment] |

## tsc 539 测试文件类型错误的处置口径

- 仓库自己的门控（tsconfig.build.json）显式排除 `**/*.test.ts`，生产构建从未检查它们；vitest 也不做类型检查（esbuild 剥离类型）。
- 但它们仍是真实债：测试 mock 与类型演进脱节（BrowserActionContract 增字段后 44 处 TS2739 未补、EventV4 字段收窄后 39 处 TS2353 等），重构搬迁文件时这些 import 路径要一并改。
- Step 2 决策点：要么补齐 539 处 mock 字段（机械但量大），要么引入 `tsconfig.test.json` 显式豁免并接受现状（务实）。倾向后者+逐步收敛，理由：vitest 行为不受影响，搬迁验证以 tsc-build + 全量 vitest diff 为准。

## 分类汇总

| 簇 | 项数 | 分类 | 一句话根因 |
|---|---|---|---|
| R1 rust-daemon 元数据 | 11 | real-defect | runCommandTool 丢弃 executionPath/errorClass 投影 |
| R2 MCP 占位桩 | 16 | real-defect | registry MCP execute 返回恒定字符串，invokeTool 零生产调用 |
| R3 atomic-rollback 契约冲突 | 5 | contract-conflict | 3bc2ad5b 引入全量回滚，与 partial-failure 测试契约静默冲突至今 |
| R4 seed=action-result | 9 | real-defect | turn Phase 4 后 stopped continuity 投影未同步 |
| R5 非交互 CLI 漂移 | 5 | known-gap/env | deny 默认/落盘漂移 + real-provider 环境依赖 |
| R6 harness 5s 超时 | 7 | test-infra | 真实子进程场景超 vitest 单测预算 |
| R7 投影漂移混合 | 6 | real-defect | Phase 4 语义演进遗留 + 1 项待查实现 |
| **合计** | **57+1 超时项** | | R1-R4/R7 共 47 项为真实债 |

## Step 2 修复优先级建议（供裁决，本轮不动手）

1. **R2 MCP 占位桩**——产品级缺陷（真实 MCP 调用假成功），优先修。
2. **R1 投影透传**——单点小修（metadata 补字段）。
3. **R3 契约裁决**——需要你拍板保留哪种语义（见上文两个选项）。
4. **R4/R7 投影同步**——按 Phase 4 新契约批量更新测试或补实现。
5. **R6 超时预算**——纯测试基建，机械。
6. **R5 环境标记**——real-provider 3 项加跳过条件。
