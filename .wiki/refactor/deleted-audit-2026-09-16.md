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
