# 已删除文件功能与价值审查总账（2026-09-16）

## 结论先行

此前三次删除共移除 **403 个生产文件**，原判据只有 CLI import BFS + 测试覆盖，没有功能价值审查。该判据不足，审查发现：

- 已确认并修复的真实断链：`edit/authority/workspace.ts`、`orchestration/editSnapshot.ts`。
- 已确认的高价值但未接线能力：终态真实性、任务相关验证阶梯、跨文件修复、AST 代码图谱、LSP 自修复、Swarm 分发、部分 provider 适配器等。
- 已确认的纯废弃路线：apply_patch 解析/验证/应用链。CLI 从未注册 `apply_patch`，活轨明确拒绝 unified diff / apply_patch 输入。
- 已确认的纯迁移残留：大量平铺→子目录 re-export shim。

**当前禁止继续删除任何审查未完成的历史文件。** 恢复必须按本文件的断链/价值等级分批，由维护者裁决后执行。

## 一、删除范围

| 提交 | 生产 | 测试 | 当前审查状态 |
|---|---:|---:|---|
| `0e875e37` 产品 facade | 5 | 0 | 5 个均为纯 re-export，删除合理 |
| `7a59ab23` 主簇 | 316 | 257 | G2/G4 完整；G1/G3 已有重点结论，逐文件总表仍待补齐 |
| `42d63bd7` Step 2.6 | 82 | 0 | 82 + facade 5 +遗漏 2 已完成审查 |
| **合计** | **403** | **257** | |

## 二、已修复断链

| 文件 | 断链事实 | 处置 |
|---|---|---|
| `edit/authority/workspace.ts` | 活轨写入曾是裸 `fs.writeFile`；删除的实现具备 `O_NOFOLLOW`、`fstat`、`/proc/self/fd` realpath 复验 | 已恢复并接入 `runtime/execution/service.ts` |
| `orchestration/editSnapshot.ts` | `/undo` / `/restore` 读取 `.sisyphus/edit-snapshots`，但生产写入者被删，曾恒报 `Nothing to undo` | 已恢复并接入写入前快照捕获 |

验证：符号链接逃逸拒绝、工作区外写拒绝、快照落盘、`/undo` 输出最近编辑与 `/restore` 命令；`tsc` clean；全量测试稳定通过（并行偶发 Rust daemon 抖动）。

## 三、已确认废弃路线（不恢复）

### apply_patch 路线

涉及 `orchestration/patchParsing/*`、`orchestration/patchVerification/*`、`orchestration/patchApplication/*`、`edit/patch/plan/*` 等。

证据：

1. 删除前与当前 `core/tools/registry.ts` 都只有 `read/write/edit/glob/bash`，从未注册 `apply_patch`。
2. 活轨在 `core/query/actionableBlockerModule.ts`、`session/actionableFailureContinuity.ts`、`result/projection/shell/assembly.ts` 明确提示：`do not pass unified diff or apply_patch syntax`。
3. 活轨 `edit` 是单文件字符串替换；历史 patch 层是多文件 add/delete/move/update 计划。恢复文件不会恢复能力，接入需要新增工具面、审批策略、模型提示词，属于新功能。

处置：不恢复；如未来需要多文件原子 patch，另立 feature/backlog。

## 四、已审查并判定有价值的候选

### A. 主簇 G2：edit / repair / proposal（68 文件）

审查结论：30 个死残留；**38 个未被等价替代**。最高价值能力：

| 能力 | 代表文件 | 现状 |
|---|---|---|
| 写授权与 TOCTOU 防护 | `edit/authority/approval/{decision,permission,production}.ts`、`projection/approval.ts` | 无等价 live 实现；`workspace.ts` 已恢复 |
| 失败写入效果语义 | `edit/result/workspace/writeFailureState.ts` | 无；活轨错误主要是字符串 |
| journal failure projection | `edit/result/journal/failure/consumer.ts` | live journal 有模型但无生产构造器 |
| 跨文件/混合文件变更 | `edit/multifile/mixedFileOperationWriter.ts` | 无等价完整 writer |
| 最终 stale-read 复验 | `edit/write/runtime/finalRead.ts` | 无 digest-bound approval→write 复验 |
| 跨文件修复 | `repair/flow/{stage,crossFilePlanning}.ts` | 无等价 |
| 修复重开/指令归一化 | `repair/handoff/state/reopen.ts`、`repair/proposal/{singleFile,groundedAnswer}.ts` | 无等价 |
| provider proposal / anchored proposal | `proposal/{providerProposalFacade,anchoredProposalStage}.ts` | route-era/未接线，需裁决 |

### B. 主簇 G4：verification / planning / result / evidence / session（47 文件）

已确认的高价值候选：

| 文件 | 能力 | 现状 |
|---|---|---|
| `verification/taskRelevantVerificationRoute.ts` | 721 行验证阶梯：focused test → package test → build → typecheck → readback → blocked；按文件覆盖与 authority gating | 无 live 等价，最高优先级 |
| `verification/command/selection.ts` | 按 workspace manifest 自动选择验证命令 + 两次重试 | live 只有静态命令计划，无自动选择 |
| `verification/command/{runner,result,verificationStage}.ts` | 实际 bash 验证执行、结果投影、失败分类、retry | live 只有 plan 半边 |
| `verification/result/failure/{classifier,outcome}.ts` | 12 类失败 taxonomy、blockerKind、repairEligible、DoNext | 无等价 |
| `result/terminal/queryTerminalTruth.ts` | 8 分支终态真实性分类器 | live `turn/projection.ts` 仅 error/completed + approval refusal |
| `session/continuation/{turnFacts,workflowPlanningContinuity}.ts` | proofGap 与 seedInfluence 语义 | live 测试仍断言这些 marker，但生产来源被删 |
| `session/inlineContinuityContext.ts` | 跨进程 `/continue` 上下文块解析 | 无等价 |
| `evidence/projection/{claim/ledger,repair/continuation,patch/base}.ts` | claim ledger、continuation transform、stale-read digest | 无等价 |
| `policy/commandIntentPolicy.ts` | 验证命令检测与 opt-out | allowlist 仍存在，策略实现被删 |

### C. Step 2.6 + facade + 遗漏 2（89 文件）

判定：51 个纯 shim/迁移残留；其余高价值候选：

- `context/graph/{callGraph,symbolTable,ast/scopeTree,ast/graphRag}.ts`：TypeScript AST 符号表、调用图、作用域分派、GraphRAG；活轨只有文件级 context graph，无等价。
- `edit/repair/lspRepairLoop.ts` + `edit/patch/gauntlet/astGauntlet.ts`：AST 预检 → 写入 → LSP 诊断 → 模型重试 → 回滚闭环；无等价。
- `edit/patch/plan/{validator,operation}.ts`：patch plan 类型仍存活，但构建/验证器消失；是否恢复取决于是否未来新增 patch 工具。
- `core/context/browserToolServerBackend.ts`、`core/context/pwReport.ts`：browser tool-server / Playwright 报告契约，无等价。
- `orchestration/swarm/{dispatcher,convergence,types}.ts`：子代理分发、收敛/共识；无等价。
- `session/store/sessionTree.ts`：可变会话树、checkpoint、rewind；活轨只有只读投影。
- `planning/runtime/proposal/{attempt,context}.ts`：provider retry/failure taxonomy 与受边界保护的 workspace prompt context。
- `presentation/components/box.ts`：终端盒渲染工具，无等价导出。

51 个 shim 的目标均存活（例如 `session/approvalAuditProjection.ts` → `session/approval/auditProjection.ts`、`runtime/execution/executionService.ts` → `runtime/execution/service.ts`），删除合理。

### D. G3：core / adapters（初步审查）

API 额度在生成完整逐文件表前耗尽，但已确认一个高优先级断链：

- `model-adapters/providers/openai/OpenAIModelAdapter.ts`
- `model-adapters/providers/anthropic/AnthropicModelAdapter.ts`
- `model-adapters/client.ts` / `registry.ts` / `retryPolicy.ts` / `providerFetch.ts`

活轨 `core/shell/providerReadiness.ts:97` 仍明确报告：配置了非 openai provider，但当前 real provider adapter 尚不支持；配置层仍保留 Google / ClaudeCode / Antigravity / ChatGPT account-auth 等 provider 语义，而对应 adapter 已删除。该组应按**断链/能力丢失**继续核验，不得按死码处理。

## 五、当前数字与决策分层

| 层级 | 含义 | 数量/状态 |
|---|---|---|
| 已恢复断链 | 消费者存活 + 生产者缺失 | 2 个文件，已修复 |
| 明确不恢复 | 纯 shim、迁移归并、废弃 apply_patch 路线 | 大量，证据充分 |
| 未接线但有价值 | 完整实现、无等价物、无活消费者 | G2 38、G4 约 13、Step2.6 约 15、G3 至少 provider 适配器组 |
| 尚未完整核验 | G1 orchestration 154、G3 逐文件 46 | **禁止做删除/恢复决策** |

## 六、推荐路线（停止点）

1. **停止所有删除**，保留当前工作树与恢复的两个安全修复。
2. **先裁决断链**：provider adapter 断链、终态真实性/verification consumer 断链，优先恢复而不是继续清理。
3. **将未接线能力登记 backlog**，不直接恢复全部历史体系：AST 图谱、LSP repair、Swarm、任务验证阶梯、跨文件 repair 等分别评估。
4. **G1/G3 完整逐文件表补齐后**，再决定是否恢复；不能用域级印象替代逐文件证据。
5. 任何未来删除必须先做：功能读审、活轨等价核验、字符串路径/动态入口检查、消费者存活检查。

## 七、审计口径

- **断链**：活轨消费者仍在，生产者被删，必须恢复并接线。
- **未接线有价值**：实现完整且无等价物，交裁决。
- **废弃路线**：消费者/生产者同批消失且活轨明确拒绝该输入，不恢复。
- **纯死码**：re-export shim、被活轨内联归并、空壳、同批唯一消费者一起删除，删除合理。

## 八、审查阶段校正（2026-09-16）

本轮审查再次发现：不能把"完整实现"自动等同于"断链"。

- G2 的 apply_patch 解析/验证/应用层最初被判为能力损失，后经核对确认是**废弃路线**：删除前后均无 `apply_patch` 工具，活轨还明确拒绝该语法。
- G4 的终态真实性、任务相关验证、continuation proof-gap 等仍是**未接线但有价值**；其依赖链与活轨消费者关系需要按单项恢复，而不是整簇恢复。
- Step 2.6 的 82 文件审查确认大量 shim/内联归并，但 AST 图谱、LSP 自修复、Swarm、会话树等属于独立能力。
- G3 的 provider 适配器需要单独保留审慎结论：活轨 `turn/step.ts` 对 OpenAI-compatible 请求有自身实现；`providerReadiness.ts:97` 明确表示非 openai provider 尚未由当前 real adapter 支持。不能把所有已删 adapter 不加区分地判为断链，需区分 OpenAI 的部分替代与 Google/ClaudeCode/Antigravity 等配置已存在但执行适配缺失的能力。

因此统一决策顺序固定为：**先断链 → 再未接线价值 → 再废弃路线 → 最后纯死码**。任何后续恢复必须以"消费者存活"或"维护者明确裁决"为前提，不按目录批量恢复。

## 九、G1 orchestration 分组结论（154 文件）

> **本节已被逐文件审查取代（2026-09-17）。** 原判为"仅有分组结论"，实为提取错误。
> 完整逐文件表见 `audit-raw/R1_PatchRoute.json`（G1a 26）、`R2_EditChain.json`（G1b 57）、
> `R3_OrchRest.json`（G1c 71）。下列分组结论保留作快速索引。

> G1 子代理完成了关键域读审，但因外部额度中止未生成逐文件 JSON。以下按**能力簇**而不是文件逐行裁决；完整路径清单见 `/tmp/G1_orchestration.txt` 的审计原始清单。恢复时仍需对目标簇重新计算依赖闭包。

| 能力簇 | 代表文件 | 判定 | 证据/理由 |
|---|---|---|---|
| apply_patch 解析/验证/应用 | `patchParsing/*`, `patchVerification/*`, `patchApplication/*`, `patchContract/*`, `patchMutationLane.ts` | 废弃路线 | CLI 删除前后均无 apply_patch 工具；活轨明确拒绝该语法 |
| patch route/result 表面 | `patchResult/*` | 大部已替代 | 活轨 `edit/multifile/model.ts`（1710 行）+ `edit/result/perFilePatchResultProjection.ts` 为更新实现；smoke/gate 文件属历史门禁 |
| edit snapshot | `editSnapshot.ts` | 断链 | 已恢复并接线；修复 `/undo` 永远无快照 |
| fenced/target-set edit | `fencedEdit*.ts`, `targetSetEdit*.ts`, `editProposal*.ts`, `proposalHunkSet*.ts`, `exactHunkApply.ts` | 未接线有价值/部分被替代 | 活轨 multi-target 模型存在，但缺历史 route runners；恢复应按明确产品需求，不整簇恢复 |
| task lifecycle 路由 | `taskLifecycle{Activation,Handoff,Router}.ts` | 未接线有价值 | 底层 `taskLifecycleResult/taskIntent/taskLifecycle/taskReadPlan/taskStage/taskExecutionPlan` 均存活；route/activation wiring 被删 |
| task-relevant verification | `taskRelevantVerificationRoute.ts`, `verificationModule.ts`, `verificationRepair*.ts`, `verificationResultProjection.ts` | 未接线有价值 | 活轨保留 verification plan/model，但缺 run/classify/retry/relevance 执行半边 |
| provider proposal/anchoring | `provider*.ts`, `anchored*.ts`, `contextAwareProvider*.ts` | 混合：部分未接线、部分历史 smoke | 活轨有 `provider/` 新链与 `providerEditProposal/providerOutputValidator/fencedEditPlanner`；旧 exact-patch/smoke 路线不可整批恢复 |
| planning runtime / realTaskLoop | `planningRuntimeProduct*.ts`, `realTaskLoop*.ts` | 废弃路线 | 硬编码或依赖 `runMvpIntegratedFlow` / Phase 4 路由；入口已移除 |
| read/inspect/context intent | `readInspect*.ts`, `readContinuationTarget.ts`, `workflowIntentProjection.ts`, `workspaceTargetProjection.ts` | 部分被替代 | 活轨 `context/acquisition/*` 与 `planning/runtime/engine.ts` 已承担大部分；个别双语 intent/target 逻辑可作为 backlog |
| browser orchestration | `browserModule.ts` | 废弃旧入口 | 活轨 browser runtime/skill/receipt 链已接入 CLI |
| tool lifecycle/runtime wrappers | `toolRuntimeModule.ts`, `toolLifecycleEvents.ts` | 已替代 | 活轨 `turn/tools.ts`, `tools/dispatch/*`, `core/tools/*` |
| recovery/edit repair | `editRecovery*.ts`, `editRepair*.ts`, `editRollback.ts` | 未接线有价值 | 与已恢复 snapshot/authority 同域；是否恢复需按 live recovery model 缺口逐项核验 |

### G1 高价值候选（进入裁决队列）

1. `taskLifecycleActivation.ts`, `taskLifecycleHandoff.ts`, `taskLifecycleRouter.ts`
2. `taskRelevantVerificationRoute.ts`, `verificationModule.ts`, `verificationRepairBridge.ts`, `verificationRepairFlow.ts`, `verificationRepairIterationFlow.ts`, `verificationRepairLoop.ts`, `verificationRepairPlanner.ts`, `verificationRepairResult.ts`, `verificationResultProjection.ts`
3. `fencedEditActivation.ts`, `fencedEditOutcome.ts`, `fencedEditResult.ts`, `fencedEditRoute.ts`
4. `targetSetEditJournal.ts`, `targetSetEditPlan.ts`, `targetSetEditPolicy.ts`, `targetSetEditRecovery.ts`, `targetSetEditRecoveryWorkflow.ts`, `targetSetEditResult.ts`, `targetSetEditRoute.ts`, `targetSetEditTransaction.ts`, `targetSetEditVerification.ts`
5. `editRecoveryApply.ts`, `editRecoveryOutcome.ts`, `editRecoveryPlan.ts`, `editRecoveryResult.ts`, `editRepairPlanner.ts`, `editRepairResult.ts`, `editRollback.ts`

以上不是断链的自动恢复清单，而是**未接线能力裁决清单**。

## 十、G3 core / adapters 分组结论（46 文件）

> **本节已被逐文件审查取代（2026-09-17）。** 完整表见 `audit-raw/R4_Browser.json`（G3a 16）、
> `R5_CoreAdapters.json`（G3b 30）。下列分组结论保留作快速索引。

| 能力簇 | 文件 | 判定 | 证据 |
|---|---|---|---|
| 旧 browser transaction | `core/context/browser{Obs,Repair,Score,Tool,Trace,Txn,TxnEvidence,TxnReport,TxnTypes}.ts`, `pwAdapter.ts`, `browser/browserIntentPlanning.ts`, `core/harness/browserTxn*`, `pw*` | 废弃/已替代 | 活轨 browser runtime/skill/receipt/commandRunner 链；旧 txn 路线整体入口消失 |
| context read planning | `context/{contextPlanningIntent,readContinuationPlanning,readIntentPlanning,readTargetPlanning,workflowReadPlanBranch}.ts` | 大部被替代，少量 intent 价值 | 活轨 `context/acquisition/*`, `planning/runtime/engine.ts`; 双语 read-window/fragment 规划可作为 backlog |
| query terminal truth dependencies | `core/query/mapping/{capabilityClassification,mapper}.ts`, `runtime/{trajectory,transitions}.ts`, `terminal/classificationProjection.ts` | **高价值恢复候选** | `result/terminal/queryTerminalTruth.ts` 的依赖；可恢复完整终态真实性，但不是单文件恢复 |
| runtime receipt | `core/runtime/{runtimeReceipt,runtimeReceiptProjection}.ts` | 大部已替代 | 活轨 `runtime/execution/{receipt,error,service}.ts` |
| tool runtime/provenance | `core/tools/{approvalFlow,approvalProvenance,prefilter,runtime,toolExecutionProvenance,toolLifecycleProjection,toolResultProjection}.ts` | 大部已替代 | 活轨 `turn/tools.ts`, `tools/dispatch/*`, `core/tools/toolResultLifecycle.ts`; provenance 细节可单独比较 |
| model client / retry | `model-adapters/{client,registry,retryPolicy}.ts` | 未接线有价值/部分替代 | 活轨 `turn/step.ts` 自建 OpenAI-compatible 请求，但缺旧 client health/fallback/retry 抽象 |
| OpenAI/Codex/Google adapter | `providers/openai/{OpenAIModelAdapter,normalize,wireTypes}.ts` | **部分被替代，部分能力缺失** | 活轨 step 覆盖基础 OpenAI-compatible streaming；旧 adapter 含 Codex account endpoint、token refresh、Google account refresh、请求/错误 normalization，不能整体判死 |
| Anthropic adapter | `providers/anthropic/AnthropicModelAdapter.ts` | **未接线有价值/执行能力缺失** | 配置面仍有 provider 类型；`providerReadiness.ts` 明确非 openai 当前不受 real adapter 支持 |
| provider index/prompt | `provider/index.ts`, `provider/request/prompt.ts` | index 为 shim；prompt 需裁决 | 新 `provider/request/*` 存活；旧 context-aware prompt 是否被 turn/prompt 覆盖需逐符号比较 |
| tool dispatcher | `tools/dispatch/dispatcher.ts`, `tools/index.ts` | 已替代/shim | 活轨 `tools/dispatch/executor.ts` 与核心 registry |

### G3 优先裁决

1. **Provider 适配能力**：Anthropic、Codex account-auth、Google account-auth refresh/normalization。当前配置/凭据面保留，但 real provider adapter 对非 openai 明确返回 unsupported。
2. **完整终态真实性闭包**：`capabilityClassification.ts` + `transitions.ts` + `classificationProjection.ts` + `queryTerminalTruth.ts`。
3. 工具 provenance/lifecycle 细节是否被新工具循环完整覆盖。

## 附二：验证脚本断链（2026-09-17，清理造成的第二类真实破坏）

主簇删除同时打断了 `scripts/` 下的验证脚本。这类断链 **import 图与 `tsc` 都看不见**，
因为脚本用 `path.join(...)` 拼路径后动态 `import()` 或传给 `tsx`。

### A. 直接断链（5 个脚本，正确报错）

| npm script | 退出码 | 失败原因 |
|---|---:|---|
| `verify:real-user-capabilities:three-file-guarded-write` | 1 | `MODULE_NOT_FOUND` |
| `verify:real-user-capabilities:single-file-move-evidence` | 1 | `MODULE_NOT_FOUND` |
| `verify:real-user-capabilities:single-file-delete-evidence` | 1 | `MODULE_NOT_FOUND` |
| `verify:real-user-capabilities:mixed-operation-evidence` | 1 | `MODULE_NOT_FOUND` |
| `verify:real-user-capabilities:three-file-planning-no-write` | 1 | `MODULE_NOT_FOUND` |

共同根因：这 5 个脚本都引用已删的 `orchestration/mutationRoutingProjection.ts`
（导出 `projectApplyPatchRuntimeMutationRoute`）。

另有 `scripts/verify/index.mjs` 通过 `pathToFileURL` 引用 7 个已删模块，影响
`verify:real-user-capabilities*` 系列。

### B. 已失效但仍报通过（最危险，1 个脚本）

`scripts/verify-edit-capability-closeout.mjs`（`npm run verify:edit-capability-closeout`）：

- 脚本列出 **98 个测试路径**，其中 **75 个已不存在**。
- 它把这些路径原样传给 `npm run test -- <paths>`；vitest 对不存在的文件**不报错**，
  只跑存在的 23 个，返回 0。
- 于是脚本打印全部 marker 并输出 `[pass] edit-capability-closeout`，`process.exit(0)`。

**实测退出码 0，但覆盖已从 98 项缩到 23 项。** 这是"验证脚本静默说谎"——
它声称能力就绪，实际大部分证据已消失。比 A 类危险得多，因为没有任何信号提示。

### C. 结论

- 删除前只检查了 `src/` 的 CLI 可达性，**没有检查 `scripts/` 的引用**。
- 验证脚本是"能力就绪"的证据来源；脚本失效会让后续判断失真。
- 处置见转接包 §6。

## 附三：契约级断链（2026-09-17，子代理审查 + 自查确认）

符号级扫描为零（附一），但**契约级**断链存在。这类断链的形态是：
活轨**读取**某个数据/标记，但**没有任何活轨代码写入它**。`tsc` 不报错，
因为类型仍在（可选字段），只是永远为空。

### 断链 1（最严重）：`CodingResultSummary.provenance.toolExecutions`

| | |
|---|---|
| **读取者**（全部 CLI 可达） | `core/shell/sessionTerminalState.ts:1077`（`hasApprovedBashExecutionFailureProvenance`）、`session/continuation/sessionToolContinuity.ts:8`、`session/continuation/stoppedSessionContinuity.ts:234`、`presentation/surface/model.ts:1962` |
| **写入者** | **无** |
| **被删的生产者** | `core/tools/approvalProvenance.ts`、`core/tools/toolExecutionProvenance.ts`（经已删的 `orchestration/codingResultProvenance.ts` 聚合） |
| **后果** | 字段恒为 `undefined`。`sessionTerminalState.ts` 里那条"审批过的 bash 执行失败"分支永不触发；工具执行来源（approval/provenance）在终端与 surface 上永不显示。 |

### 断链 2：浏览器连续性标记前缀

| | |
|---|---|
| **读取者**（CLI 可达） | `session/sessionContinuationProjection.ts:57-60` 声明关键前缀 `browser-agent-transaction-trace:` / `browser-agent-transaction:` / `browser-agent-observation:` / `browser-observation:` |
| **写入者** | 无。`core/context/browserAgent.ts:178-180` 自己也只**过滤**这些前缀，不产出。 |
| **被删的生产者** | `core/context/browserTrace.ts`、`browserTxnEvidence.ts`、`browserObs.ts` |
| **后果** | 连续性投影期待这些标记以判断浏览器事务续跑，但活轨浏览器链产出的是 `browser-command-runner:*` / `browser-runtime-receipt:*`。前缀列表已成为永不匹配的死条件。 |

### 断链 3（半孤儿）：`browserAgent.ts` 的消费端被删

| | |
|---|---|
| `core/context/browserAgent.ts` | CLI 可达（`detectBrowserAgentPlan`） |
| 调用者 | 无。原调用者 `orchestration/browserModule.ts` 已删 |
| 唯一引用 | `orchestration/workflowTaskPlanner.ts` 只 `import type { BrowserAgentPlan }`，且无任何活轨代码赋值 `browserPlan:` |
| 后果 | 该文件仍在 CLI 可达集内，但**调用图上是死的**。可达性 BFS 掩盖了这一点。 |

### 方法论升级

之前只定义了"引用型"与"契约型"两类。本次新增第 3 类：

| 类别 | 表现 | 检测 |
|---|---|---|
| 引用型 | import 不存在的模块 | `tsc` / import 图 |
| 契约型 | 活轨读、无人写（数据/标记/字段） | 对每个被读的字段，反查写入点 |
| **半孤儿** | 文件在可达集内，但无调用者 | 对每个导出函数，反查调用点（可达性 BFS 不覆盖） |

**"在 CLI 可达集内"不等于"被调用"**。可达性只说明它被 import 链拉进来了（例如仅被 `import type` 引用），不说明逻辑上还有人调用它。

## 附四：10 项候选的「是否多余 / 是否适配」核验（2026-09-17）

### 为什么需要这一轮

此前 §12 的"高价值候选"表只回答"实现是否完整、活轨有无语义相似物"。
**它没有回答三个更关键的问题**，因此可能把"多余"或"不适配"的能力列为待恢复：

| 问题 | 含义 | 若为否 |
|---|---|---|
| **Q1 输入是否有生产者** | 该能力读的数据，活轨今天还产生吗 | 恢复得到一段**没有输入**的代码 → 不适配 |
| **Q2 输出是否有消费者** | 有活轨代码引用它的导出吗 | 无消费者 ≠ 无用，但需说明接线点 |
| **Q3 活轨是否已有同形状能力** | 是否只是**未接线**而非缺失 | 则应**接线**而非**恢复**（避免第三套实现） |

### Q2 结果：全部为零

10 项候选的核心导出符号（共 60 余个）在活轨 `packages/ts-shell/src` 中**零符号引用**。
仅 3 个命中为普通词误报（`invalid`、`stringField`、`sleep`，分别是字符串/字段名/同名测试辅助）。

### Q1 结果：输入契约分化

| 候选 | 关键输入类型 | 活轨状态 | 结论 |
|---|---|---|---|
| 1 终态真实性 | `CodingResultSummary` | **活轨 46 处**（`orchestration/types.ts` 等） | ✅ 输入存在 |
| | `VerificationCommandPlan` | 活轨 2 处 | ✅ |
| | `QueryTerminal` | **活轨无** | ⚠️ 需改接 `turn` 侧类型 |
| 2 任务相关验证阶梯 | `PerFileVerificationCoverage`、`TaskRelevantVerificationAuthority`、`ChangedFile` | **活轨全无** | ❌ **不适配**：需重建整套输入契约 |
| 3 target-set 批回滚 | `RecoveryAuthorityStoredRecord` | 活轨 3 处 | ✅ |
| | `RouteScopedEditJournal` | 活轨 11 处 | ✅ |
| | `WorkspaceWriteFailureState` | **活轨无** | ⚠️ 需降级为字符串错误 |
| 4 provider 原始解析 | `ProviderEditRawProposal` | 活轨 3 处（消费者**在用**） | ✅ **输入有消费者，只缺生产者** |
| | `ModelRequest` | 活轨 3 处 | ✅ |
| 5 重试退避 | `ModelProviderConfig` | 活轨 1 处 | ✅ |
| | `RetryPolicy` | **活轨无** | 需新建 |
| 6 taskLifecycle 编排 | `TaskLifecycleResult` | **活轨无** | ⚠️ |
| | `TaskIntent`/`TaskReadPlan`/`TaskStage`/`TaskExecutionPlan` | 活轨 2–8 处 | ✅ 底层全活 |
| 7 AST 代码图谱 | `SymbolTable`/`CallGraph`/`ParsedSourceFile` | **活轨全无** | ❌ 需新建 |
| 8 LSP 自修复 | `LspClient`/`FileMutationQueue` | **活轨无**（`fileMutationQueue` 实现存在但无该接口名） | ⚠️ 部分存在 |
| 9 跨文件 repair | `CodingResultSummary` | 活轨 46 处 | ✅ |
| | `RepairContinuityEvidence` | **活轨无** | ❌ |
| 10 Swarm 分发 | `SubAgentTask`/`SubAgentResult` | **活轨全无** | ❌ |

### Q3 结果：三项为"活轨已有但未接线"

按语义/数据形状搜索（非符号名）后的决定性发现：

**候选 1（终态真实性）—— 判定为"已有等价，但未汇合"**

活轨确实存在等价能力：

- `evidence/verdictFacade.ts`：产出 `ProductVerdict`，含 `status: COMPLETE|PARTIAL|BLOCKED|NOT_PROVEN`、
  `terminalClassification: "stopped"`、`notProvenReasons` / `partialReasons` / `blockedReasons`，
  并有**防升级断言**（"attempted to upgrade a non-live-success legacy result to COMPLETE"）。
  其消费者 `repair/iteration/projection.ts`、`result/projection/repair/verdict.ts`、
  `verification/verificationFacade.ts` 均 CLI 可达。

但它**不在回合终态的路上**：

| 路径 | 位置 | 是否写回合终态 |
|---|---|---|
| A 内核终态 | `turn/projection.ts:concludeRun` | ✅ **唯一写入者**（`query.completed`） |
| B 裁决投影 | `evidence/verdictFacade.ts` → `repair/iteration/projection.ts` → `repair/handoff/*` | ❌ 止于 repair/handoff 与公共 API 层 |

决定性证据：`concludeRun(messages, prompt, sessionId, steps)` —— **签名里没有 `codingResult` / `verification`**，
结构上无法考虑验证结果；而 `turn/*.ts` 全文 **零次**出现 `codingResult`
（`grep codingResult packages/ts-shell/src/turn/*.ts` = 空），即活轨 turn **从不产生** `CodingResultSummary`。

→ **处置：接线，而非恢复。** 恢复被删的 `queryTerminalTruth.ts`（149 行 + 3 依赖）会得到**第三套**终态判定。

**候选 3（target-set 批回滚）—— 判定为"部分已有"**

活轨已有：`restorePrimitive` / `restorePreview` / `restoreCommandRunner` / `recoveryAuthorityStore`
（全活）+ `editSnapshot.ts` 已恢复。
活轨**无**：`target-set-subset` 子集批回滚概念（语义搜索 `子集回滚` = 0 命中）。

→ **处置：接线 + 小幅补全**，而非整簇恢复 850+ 行。

**候选 4（provider 原始解析）—— 判定为"真断裂，消费者存活"**

活轨 `orchestration/providerEditProposal.ts` / `providerOutputValidator.ts` / `providerProposalAnchors.ts`
**均存活且在用 `ProviderEditRawProposal` 类型**，但活轨**零**解析函数：
`extractJsonObject` / `parseProviderExactPatch` / `looksLikeDiff` / `extractUnifiedDiffHunks` 全部 0 命中。

→ **处置：这是最干净的恢复项**——输入类型有消费者、只缺生产者，接线点明确。

**候选 7（AST 代码图谱）—— 判定为"不适配"**

活轨 `context/graph/ast/parser.ts` 提供 `parseSourceSymbols` / `ASTParsedSymbol`（token 级），
但**无** `SymbolTable` / `CallGraph` / 图构建与排序（语义搜索 = 0）。
被删代码依赖 `ParsedSourceFile` 这一类型，活轨不存在。

→ **处置：不在当前架构下恢复**。若需要，属**新功能**（需先定输入契约），登记 backlog。

**候选 10（Swarm 分发）—— 判定为"不适配当前项目"**

活轨无 `SubAgentTask` / `SubAgentResult`；`swarm` 仅 1 处命中（无关的 sidebar 质量检查）。
活轨已有的多 agent 能力是 `core/tools/taskTool.ts`（子任务工具）与 `core/research/deepResearcher.ts`
（研究型并行），形状不同。

→ **处置：登记 backlog，不恢复**。

### 修正后的处置表（取代 §12 的"高价值候选"）

| # | 候选 | 原建议 | **核验后处置** | 依据 |
|---|---|---|---|---|
| 1 | 终态真实性 | 恢复（4 文件） | **接线**（`verdictFacade` → `concludeRun`） | Q3：已有等价能力，未汇合 |
| 2 | 任务相关验证阶梯 | 恢复 | **登记 backlog** | Q1：`PerFileVerificationCoverage` 等输入契约活轨全无 |
| 3 | target-set 批回滚 | 恢复 | **接线 + 小幅补全** | Q3：底座全活，仅缺子集概念 |
| 4 | provider 原始解析 | 恢复 | **恢复**（唯一干净项） | Q1+Q2：输入类型有消费者，只缺生产者 |
| 5 | 重试退避降级 | 恢复 | **恢复**（`retryPolicy`） | Q1：`ModelProviderConfig` 活轨存在；活轨 fallback 明示 `executesFallback: false` |
| 6 | taskLifecycle 编排 | 裁决 | **登记 backlog** | Q1：底层全活但 `TaskLifecycleResult` 缺；需先定产品语义 |
| 7 | AST 代码图谱 | 恢复 | **登记 backlog（属新功能）** | Q1+Q3：输入契约与图构建全无 |
| 8 | LSP 自修复 | 恢复 | **接线**（`postMutationLspGuard` 已存在） | Q3：活轨已有 LSP 守卫，缺自修复循环编排 |
| 9 | 跨文件 repair | 恢复 | **登记 backlog** | Q1：`RepairContinuityEvidence` 活轨无 |
| 10 | Swarm 分发 | 恢复 | **登记 backlog** | Q1+Q3：契约与能力全无，形状不同 |

### 汇总

| 处置 | 数量 | 项 |
|---|---:|---|
| **接线**（活轨已有等价能力） | 3 | 1 终态真实性、3 批回滚、8 LSP 自修复 |
| **恢复**（真缺失且适配） | 2 | 4 provider 解析、5 重试退避 |
| **登记 backlog**（不适配/需新设计） | 5 | 2、6、7、9、10 |

**这轮核验的价值**：原计划的 10 项"恢复"中，实际只有 2 项该恢复；
5 项不适配当前架构（恢复会得到无输入或第三套实现的代码）；
另 3 项经附五进一步核实后为"活轨已有能力"或"需新功能"，**均不该按原计划恢复**。

### 方法论补充（写入审查口径）

判定"未接线有价值"时，必须额外回答：

1. **输入契约在活轨是否存在**——否则是"不适配"，不是"未接线"。
2. **活轨是否已有同形状能力**（按数据形状/状态枚举搜索，不按符号名）——
   否则会把"接线问题"误判成"缺失"。
3. **同名陷阱**——活轨 `result/terminal/truth.ts`（`selectContinuityTerminalSource`，17 行）
   与被删 `result/terminal/queryTerminalTruth.ts`（`deriveTruthfulTerminal`，149 行）**完全不同**。
   本文档此前"活轨只有 2 分支"的判断，就漏查了这个同名文件。

## 附五：接线可行性核实（2026-09-17）——附四的处置建议需再修正

附四判定候选 1（终态真实性）为"活轨已有等价能力，应接线"。**进一步核实接线点后，
该结论需要修正**：活轨的裁决能力本身也不在回合链上。

### 核实过程与证据

**第 1 步：`verdictFacade` 的哪个导出真的有调用者**

| 导出 | 非测试调用者 |
|---|---:|
| `projectRuntimeTerminalVerdict` | **0** |
| `buildProductEvidenceRow` | **0** |
| `toReportSafeProjection` | **0** |
| `assertNoProductVerdictSuccessUpgrade` | **0** |
| `projectProductVerdictFromClaims` | 3（`repair/iteration/projection.ts:189`、`result/projection/repair/verdict.ts:43`、`verification/verificationFacade.ts:111`） |

即：附四所称的"等价能力"中，**只有 `projectProductVerdictFromClaims` 真正被使用**，
其余 4 个是零调用者的定义。

**第 2 步：`codingResult` 的生产者链到不了 turn**

活轨确有 `CodingResultSummary` 生产者：

```
runtimeOutcomeProjection.ts  projectRuntimeCodingOutcome / projectRuntimeMutationOutcome
        ↑
contextPacketResult.ts:73    ← context/acquisition/graph.ts
taskLifecycleResult.ts:81    ← context/acquisition/graph.ts
        ↑
context/memory/model.ts
        ↑
session/continuation/readiness.ts、session/replay/state.ts、planning/runtime/engine.ts
```

**但这条链与 turn 无关**：
- `grep acquisition packages/ts-shell/src/turn/*.ts` = **空**（turn 不调用 acquisition）
- `grep acquisition entrypoints/cliRuntimeInvocation.ts` = **空**

**第 3 步：turn 侧的验证结果形态**

活轨 turn 期间确实跑验证——`cliRuntimeInvocation.ts:167` 注册 3 个内置 hook
（`postMutationLspGuard`、`affectedUnitTestRunner`、`evidenceReceiptCollector`）。
但其产出**不是终态数据**，而是**注入下一轮的工具输出文本**：

```
turn/tools.ts:161  afterToolCall → hooks.dispatch({ eventName: "PostToolUse", ... })
turn/tools.ts:175  if (decision.feedback) output = `${output}

[Verification feedback]
${decision.feedback}`
```

即验证失败以 `[Verification feedback]` 文本进入**模型上下文**（驱动自我修复），
而**不进入** `OrchestrationResult`。`TurnProjection` 也只记录 `openCalls` 与 `steps`
（`turn/projection.ts:17-80`），不累积验证状态。

### 修正后的结论

| 附四原判 | **修正后** |
|---|---|
| 候选 1 终态真实性 = **接线**（`verdictFacade` → `concludeRun`） | ❌ 接线路径不存在。`concludeRun` 的输入（messages/prompt/sessionId/steps）与 `verdictFacade` 的输入（claims/provenance/redaction/cleanup）**之间没有可桥接的中间数据**；活轨 turn 侧不累积任何验证状态 |
| 候选 3 批回滚 = **接线 + 小幅补全** | ⏸ 待核实（`restorePrimitive` 的输入契约需同样核实） |
| 候选 8 LSP 自修复 = **接线** | ⚠️ 部分成立：`postMutationLspGuard` 已存在且工作，但它是"注入反馈给模型"，不是"自动修复循环"。**两者是不同机制**，不是接线关系 |

**候选 1 的真实性质**：既不是"多余"，也不是"可接线"，而是
**活轨在架构上缺少"把验证结果反映到回合终态"这一环节**。

- 若要做，属于**新功能**：需要在 `TurnProjection` 中累积验证状态，
  并把该状态传给 `concludeRun`（改签名 + 改调用点 + 定义状态来源）。
- 被删的 `queryTerminalTruth.ts` 可作为**算法参考**（8 个降级分支的判据），
  但它读 `CodingResultSummary`，该类型在 turn 链上无生产者，**不能直接恢复使用**。

### 附五续：候选 3（批回滚）核实结果——活轨已有该能力

被删 `orchestration/targetSetEditRecovery.ts` 的核心导出：

```ts
export async function buildTargetSetPartialRecoveryPlan(input: {
  readonly route: TargetSetEditRoute;
  readonly confirmedSnapshotIds?: readonly string[];
  ...
}): Promise<EditRecoveryPlan>
```

其实现是：按 `confirmedSnapshotIds` 过滤出已写入的目标 → 调 `buildEditRecoveryPlan({ mode: "target-set-subset", ... })`。

**活轨 `/restore` 已提供同一能力**：

```ts
// orchestration/patchRecovery/restoreCommandContract.ts:9-11
export type RestoreCommandRecordSelection =
  | { readonly kind: "all" }
  | { readonly kind: "records"; readonly recordIds: readonly string[] };
```

即活轨支持 `recordSelection: { kind: "records", recordIds: [...] }` —— **任意记录子集回滚**，
正是 `confirmedSnapshotIds` 的语义。且活轨链路完整可达：

```
/restore  →  restoreCommandRuntime.ts  →  restoreCommandRunner.ts
           →  runExplicitRestoreBridge  →  restorePreview / restorePrimitive
```

**故候选 3 的处置修正为：活轨已有等价能力，不需要接线也不需要恢复。**
被删代码的附加价值仅是 `EditRecoveryPlan` 的 11 种终态分类与 `staleTargetState`
（`staleTargetState` 活轨 0 处、`post-rollback-verification` 活轨 0 处），属**细节增强**，非缺失能力。

### 对附四处置表的再次修正

| # | 候选 | 附四处置 | **附五修正** |
|---|---|---|---|
| 1 | 终态真实性 | 接线 | **新功能**（turn 侧无验证状态累积）；登记 backlog |
| 3 | target-set 批回滚 | 接线 + 补全 | **已有能力**（`/restore` 的 `recordSelection.recordIds` 即子集回滚）；不恢复 |
| 8 | LSP 自修复 | 接线 | **不接线**：现有 hook 机制（注入反馈给模型）与自修复循环（自动重试回滚）是不同设计 |
| 4 | provider 解析 | 恢复 | 维持（输入类型有消费者，证据明确） |
| 5 | 重试退避 | 恢复 | 维持 |

### 方法论教训（第 3 次同类）

附四的方法论是"按数据形状搜索活轨，判断是否已有等价能力"。
**但"活轨有这个函数"不等于"该函数在需要的链路上"**。

判断"是否可接线"必须再走一步：**从目标调用点反向追踪，
确认存在一条数据可流通的路径**。仅凭"两侧都有同名概念"就判"可接线"，
与之前"仅凭可达性就判可删除"是同一类错误——**用间接证据替代直接证据**。

## 附六：验证脚本假阳性已修（2026-09-17，Step 2.7 首项）

### 失效机制

两个 gate 脚本把测试路径列表原样传给 `npm run test -w packages/ts-shell -- <paths>`。
**vitest 对不存在的路径不报错**，只跑存在的那些并返回 0。于是脚本继续打印全部
`report field` / `marker` 行并输出 `[pass]`、`process.exit(0)`。

| 脚本 | 声明目标 | 实际存在 | 修复前行为 |
|---|---:|---:|---|
| `verify:edit-capability-closeout` | 98 | 23 | 打印全部 claim + `[pass]`，`exit 0` |
| `verify:browser-txn-gate` | 14 | **0** | 打印 `[pass]`，`exit 0` |

### 修复

在两个脚本中于 `run(...)` 之前加入目标存在性校验：缺失即列出全部缺失路径并以 `exit 1` 失败。
导入 `existsSync`，与仓库既有模式（`scripts/verify-cli-entry.mjs` 的 `missing=` 报告）一致。

修复后实测：

```
[product-regression] edit-capability-closeout - declared 98, present 23, missing 75
[product-regression] browser-txn-gate - declared 14, present 0, missing 14
退出码 = 1（两者）
```

### 影响面

两个 gate **不在主门禁**（`npm run validate`、`npm test`）内，属独立调用，
因此修复不会拖红主流程。`npm run validate` 仍通过。

### 遗留：两个 gate 本身已过期，需裁决

修好"不再说谎"之后，暴露出更根本的问题——**它们的声明已经与现实脱节**：

| 脚本 | 问题 | 建议 |
|---|---|---|
| `verify:browser-txn-gate` | 声称的整条链（`browserTxn` / `browserTrace` / `browserScore` / `browserTxnEval` / `pwAdapter`）在活轨**全部不存在**（各 0 文件）。它是为已删除的旧事务式浏览器路线服务的门禁。活轨现役评测链是 `eval/browser/*`（`benchmarkModel` / `benchmarkReport` / `benchmarkRunner`）。 | **删除该 gate** 及 `package.json:74,76` 两条注册；同步修正 `docs/design/browser-eval-gate.md`、`docs/architecture/module-atlas.md:957` 的 `keep` 标注 |
| `verify:edit-capability-closeout` | 声明 98 项，仅 23 项存在（覆盖 provider 链、anchor 链、restore 链，仍有价值）。其 `report field` 行声称的能力中有多项对应实现已删（如 `targetSetEditRoute` / `fencedEditRoute` / `editRecoveryPlan` 均 0 文件）。 | **收窄到 23 项实存目标**，并删除对应已失效的 `report field` 行；或整体废弃 |

**处置建议**：`browser-txn-gate` 直接删除（服务对象已不存在，无替代价值）；
`edit-capability-closeout` 收窄保留（仍覆盖活轨的 provider/anchor/restore 链）。

两者均需维护者裁决，因为它们改变 `package.json` 的 scripts 注册面
（`agent-rules` 规定 package scripts 变更需明确任务范围）。

### 方法论意义

这是"清理造成破坏"的**第四类**（前三类：引用型 / 契约型 / 半孤儿断链）：

| 类别 | 表现 | 检测 |
|---|---|---|
| **验证型失效** | 验证脚本声称覆盖 N 项，实际只跑 M 项（M<N）仍报通过 | 校验声明目标是否都存在；**不可信任只输出 `[pass]` 而不报告覆盖数的门禁** |

危险度最高：它不报错、不改行为、只让**所有后续验证失去可信度**。

## 十一、统一执行路线（收束）

### 阶段 1：停止删除（已完成）

不再依据 `cli:false` 单独删除任何代码。后续删除必须先完成功能审查、等价实现核验、动态入口检查和消费者存活检查。

### 阶段 2：断链修复（已完成两项）

已修复：工作区写授权、编辑快照写入。

仍需单独闭包和验证：provider adapters（非 openai 配置面与执行能力）、完整终态真实性/verification consumers。两者不能按"整簇恢复"处理。

### 阶段 3：未接线能力裁决（待所有者决定）

按能力而非文件决策：任务相关验证阶梯、跨文件 repair、AST 图谱、LSP 自修复、Swarm 分发、会话树、Playwright 报告/后端、continuation proof-gap、provider proposal。

每项先登记能力边界、输入输出、现有替代和接线成本；不得把"实现完整"直接等同于"必须恢复"。

### 阶段 4：明确废弃/迁移残留（可维持删除）

纯 re-export shim、活轨已内联归并的模块、消费者与生产者同批消失且活轨明确拒绝的 apply_patch 路线，可保持删除；但需保留本审查证据，不得重新用"未引用"作为唯一理由。

## 十二、当前唯一可信总账

### 审查覆盖率：100%

| 组 | 文件 | 交付 |
|---|---:|---|
| G2 edit/repair/proposal | 68 | ✅ 逐文件表 |
| G4 verification/planning/result/evidence/session | 48 | ✅ 逐文件表 |
| Step 2.6 | 82 | ✅ 逐文件表 |
| facade | 5 | ✅ 逐文件表 |
| **G1a** apply_patch 路线 | 26 | ✅ 逐文件表 |
| **G1b** 编辑链 | 57 | ✅ 逐文件表 |
| **G1c** orchestration 其余 | 71 | ✅ 逐文件表 |
| **G3a** browser | 16 | ✅ 逐文件表 |
| **G3b** core/adapters | 30 | ✅ 逐文件表 |
| **合计** | **403** | **100%** |

原始结果存档：`.wiki/refactor/audit-raw/*.json`（5 份，含 summary / files / report）。

> **勘误**：本文件与转接包曾记载"G1/G3 仅分组结论、覆盖率 50%"。
> 该结论错误——5 个子代理**均已通过 `yield` 提交完整 payload**，
> 是提取脚本只读取了 assistant 文本块、遗漏 `toolResult.details.data` 所致。
> 实际覆盖率 100%。与 `editSnapshot.ts` 行数错误同属一类：**未核验即下结论**。

### 已确认的真实破坏（全部已定位）

| # | 类型 | 内容 | 状态 |
|---|---|---|---|
| 1 | 契约型 | 写路径丢失 `O_NOFOLLOW` / 描述符复验（`workspace.ts`） | ✅ 已恢复接线 |
| 2 | 契约型 | `/undo` 快照无人写入（`editSnapshot.ts`） | ✅ 已恢复接线 |
| 3 | 契约型 | `provenance.toolExecutions` / `approvalDecisions`：5 个 CLI 可达读取者、**零写入者**；二级断链：兜底 evidence 写入者 `edit/authority/projection/approval.ts` 也已删 | ⚠️ 待修 |
| 4 | 契约型 | `disabledTools` / `hiddenToolPrefixes` 用户可配置，**零执行者**（唯一执行者 `prefilter.ts` 已删）→ 用户设置被静默忽略 | ⚠️ 待修 |
| 5 | 能力级 | OpenAI account-auth：`/connect login openai --account` 可存储并显示 connected，但活轨 `step.ts` 只发 `Bearer ${apiKey}`（account-auth 下为 `undefined`）→ 对话必然失败；codex 端点知识仅在已删的 `normalize.ts` | ⚠️ 待修 |
| 6 | 契约型 | `planning/handoff/mutation.ts` 产出 `executionLane: existing-exact-fenced-route / existing-target-set-route`，指向已删的 `fencedEditRoute` / `targetSetEditRoute` | ⚠️ 待裁决 |
| 7 | 契约型 | 活轨证据标签正则仍识别已删生产者（`anchored-*` / `provider-smoke-*` / `real-task-loop-*` / `context-aware-provider`）于 `session/sessionResultParity.ts`、`continuationEvidenceParity.ts`、`harnessFailureTaxonomy.ts` | ⚠️ 待裁决 |
| 8 | 契约型 | `pwStatus.ts:16` 输出 `Eval mode: available-via-pwEval`，`pwEval.ts` 已删 → 界面说谎 | ⚠️ 待修 |
| 9 | 契约型 | `capabilityBoundaryProjection.ts:14-20` focused-test 白名单含 2 个不存在的测试路径（删除前即存在，非本次新增） | ⚠️ 待修 |
| 10 | 脚本 | 5 个 `verify:real-user-capabilities:*` `MODULE_NOT_FOUND`，退出码 1（诚实报错） | ⚠️ 待修 |
| 11 | 脚本 | **`verify:edit-capability-closeout` 假阳性**：98 项中 75 项已不存在，仍打印全部 marker + `[pass]` + `exit 0` | ⚠️ **必须修** |
| 12 | 脚本 | `verify:browser-txn-gate` 退出码 1，14/14 测试目标全缺（诚实报错） | ⚠️ 待裁决 |

### 已确认无问题

- **引用型（编译级）断链为零**：403 个已删文件的导出符号无一被活轨当符号引用（附一、G1a/G1b/G1c/G3a/G3b 五组独立穷举一致）。
- 纯 re-export shim / 活轨已内联归并：可维持删除。
- `apply_patch` 解析/验证/应用路线：废弃路线，不恢复（G1a 确认 26 文件零断链，且活轨明文否决该输入形态）。
- `sessionContinuationProjection.ts:57-60` 的 browser 前缀：**非断链**（是压缩保序白名单，非功能消费者）。

### 高价值未接线候选（**已核验，处置见附四**）

> **附四已完成"是否多余 / 是否适配"核验，下表仅为原始候选清单。**
> 核验后实际只有 **2 项该恢复**，**3 项应接线**（活轨已有等价能力），
> **5 项不适配当前架构**（输入契约在活轨不存在）。请以附四为准。

| 序 | 能力 | 代表文件 | 规模 |
|---|---|---|---|
| 1 | 终态真实性判据（verification/taskSatisfaction/failedFiles → stopped） | `core/query/mapping/capabilityClassification.ts`、`terminal/classificationProjection.ts`、`result/terminal/queryTerminalTruth.ts` | 8 分支 |
| 2 | 任务相关验证阶梯 | `verification/taskRelevantVerificationRoute.ts` | 721 行 |
| 3 | target-set 子集批回滚 | `editRecoveryPlan/Apply/Result/Outcome`、`editRollback`、`targetSetEditRecovery` | 850+ 行 |
| 4 | provider 原始输出解析 | `orchestration/patchContract/parser.ts`（输出类型 `ProviderEditRawProposal` **活轨在用**，但无人解析原始文本） | 672 行 |
| 5 | 重试/退避/降级 | `model-adapters/retryPolicy.ts`、`client.ts`（活轨 fallback 明确 `executesFallback: false`） | 301 行 |
| 6 | taskLifecycle 编排层 | `taskLifecycle{Activation,Handoff,Router}.ts`（底层全活，仅编排被删） | — |
| 7 | AST 代码图谱 | `context/graph/{callGraph,symbolTable,ast/scopeTree,ast/graphRag}.ts` | — |
| 8 | LSP 自修复循环 | `edit/repair/lspRepairLoop.ts`、`edit/patch/gauntlet/astGauntlet.ts` | — |
| 9 | 跨文件 repair | `repair/flow/{stage,crossFilePlanning}.ts`、`repair/proposal/*` | — |
| 10 | Swarm 分发 | `orchestration/swarm/{dispatcher,convergence,types}.ts` | — |

（完整逐文件表见 `audit-raw/*.json` 的 `files` 与 `report` 字段，共 403 条。）
## 附：符号级断链穷尽扫描（2026-09-17）

### 方法（可复现）

1. 从 git 恢复 403 个已删生产文件的删除前内容到 `/tmp/audit-pre/`。
2. 提取其导出符号：403 文件共 1563 个符号。
3. 扣除活轨（全部 `packages/ts-shell/src/**`）已声明的同名符号（4477 个），得到**活轨不存在的独有符号 1442 个**。
4. 用单一交替正则扫全部 962 个活轨 CLI 可达文件 + `scripts/` + `contracts/`，找独有符号的出现。
5. 二次过滤：若提及该符号的活轨文件**自己也声明了同名符号**（内联重实现），判定误报。

### 结果

| 阶段 | 命中文件数 |
|---|---:|
| 初筛（符号出现） | 45 |
| 扣除 barrel 聚合文件（`readInspectModule.ts` / `editPatchModule.ts` 等，其"导出"实为存活文件的重导出） | 32 |
| 扣除活轨内联重实现 / 字段名 / 字符串 / 注释 | **0** |

**最终结论：403 个已删生产文件中，没有任何一处的导出符号被活轨代码当作符号引用。符号级断链为零。**

### 四例误报的真相（留作判据样本）

| 候选 | 实际 |
|---|---|
| `invalid`（`patchContract/parser.ts` → `artifacts/workflow/correction.ts:96`） | 字符串字面量 `"invalid"` |
| `verificationStatus` / `verdictStatus`（→ `core/query/runtime/taskState.ts:340`、`edit/multifile/model.ts:317`） | 对象字段名，非导入 |
| `ToolRuntime`（→ `core/tools/registry.ts:34`） | 注释文本 |
| `buildPrompt`（→ `sandbox/escalationWorkflow.ts:69,87`） | 本地 `private buildPrompt` 方法 |

### 与已发现的 2 个断链不矛盾

`edit/authority/workspace.ts` 与 `orchestration/editSnapshot.ts` 的断链**不是符号级**，而是**行为契约级**：

- `workspace.ts`：活轨 `writeTextFile` 从**未导入**它，而是自行用裸 `fs.writeFile` 实现写入。无符号引用，但**安全语义缺失**（无 `O_NOFOLLOW`、无描述符复验）。
- `editSnapshot.ts`：活轨 `/undo` 读取 `.sisyphus/edit-snapshots` 目录契约，但**无人写入**。无符号引用，但**数据来源缺失**。

**这是本次审查最重要的方法论结论**：符号级扫描（import 图、re-export 图、导出符号引用）只能发现"引用型断链"，**发现不了"契约型断链"**——后者表现为"活轨自己实现了一半，另一半的生产者被删"。

判定契约型断链必须靠：读活轨实现，问"它期待的数据/保证由谁提供"，再看提供者是否还在。

### 本次由此新增的判据（写入转接包）

- `tsc -p tsconfig.build.json` 零 "Cannot find module" ⇒ 不存在未解析 import ⇒ 符号级断链必为零。
- 因此**任何删除都不会造成编译错误**，删除的危险性只在行为/数据契约层。这既解释了为什么之前三轮删除 Build 全绿却仍破坏了功能，也说明编译通过不能作为删除安全的证据。
