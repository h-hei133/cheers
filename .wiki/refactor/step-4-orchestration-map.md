# Step 4 — orchestration 聚类映射表（2026-09-18 重算）

> 依据 `plan.md §3.3`：按**存活文件**重算（Step 2.5-C-3 删除了 289 个 orchestration 文件，
> 原 412 → 123）。方法遵循 `plan.md §2.4.1` 搬迁纪律。
>
> **本步的产出是"归属判定"，不是搬迁执行。** 判定结果见 §6。

## 1. 现状

| 指标 | 值 |
|---|---:|
| `orchestration/` 总文件 | 123（生产 68 + 测试 55） |
| 平铺（maxdepth 1） | 101（生产 57 + 测试 44） |
| `patchRecovery/` | 16（生产 8 + 测试 8） |
| `patchResult/` | 4（生产 2 + 测试 2） |
| `patchParsing/` | 2（生产 1 + 测试 1） |
| 可达性 | **CLI 可达 66 / 123**（生产 68 中 66 可达，2 个 opaque） |
| 删除前对照 | `7a59ab23^` 时 412 文件 → 现 123（**删除 289**） |

**2 个 opaque 文件**：`gitChangeSetAttribution.ts`、`liveProviderSmokeFallback.ts`。

## 2. 耦合测量

### 2.1 平铺层内部

| 边 | 数量 |
|---|---:|
| 平铺→平铺（内部） | **262** |
| 平铺→外部（escaping） | 22（17 文件） |

escaping 目标分散：`context/acquisition/code` 7、`patchRecovery` 4、`workflow` 2，
以及 `verification`/`planning/quality`/`edit/patch/{apply,plan}`/`result`/`browser`/`planning/action` 各 1。

### 2.2 连通分量（生产、无向）

**3 个分量**：主分量 **55 文件** + `editSnapshot.ts` 孤立 + `liveProviderSmokeFallback.ts` 孤立。

### 2.3 前缀族 ≠ 模块边界（关键否证）

按文件名前缀分组后测**内聚度**（intra / (intra+out+in)）：

| 前缀族 | 文件 | intra | out | in | 内聚度 |
|---|---:|---:|---:|---:|---:|
| `contextGraph*` | 6 | 8 | 3 | 8 | **0.42** |
| `providerAnchor*` | 6 | 8 | 10 | 1 | **0.42** |
| `taskContext*` | 4 | 6 | 12 | 5 | 0.26 |
| `taskLifecycle*` | 3 | 2 | 10 | 3 | 0.13 |
| `agentPlan*` | 3 | 4 | 14 | 4 | 0.18 |
| `editRepair*` | 2 | 1 | 6 | 2 | 0.11 |
| `contextPacket*` | 2 | 1 | 4 | 8 | 0.08 |
| `providerEdit*` | 2 | 1 | 2 | 9 | 0.08 |
| `analysisBrief*` | 2 | 1 | 4 | 8 | 0.08 |

**无一族超过 0.42**；族间边 112 > 族内边 32。
**结论：前缀族不构成合法的子域边界**，按前缀切分会产生大量跨目录边。

### 2.4 语义聚类（9 组）与其内聚度

| 组 | 文件 | 行数 | CLI 可达 |
|---|---:|---:|---:|
| context-graph（`contextGraph/Packet/Plan/Budget/Discovery`） | 11 | 2,031 | 11/11 |
| task-lifecycle（`taskIntent/Stage/Lifecycle/Context*/Read/Execution`） | 11 | 1,792 | 11/11 |
| provider-proposal（`providerAnchor*/Edit*/Output/Proposal`） | 10 | 2,138 | 10/10 |
| edit-proposal（`editProposalReview/editRepair*/generatedEdit/fencedEdit`） | 5 | 1,467 | 5/5 |
| agent-plan（`agentPlan*`） | 3 | 653 | 3/3 |
| analysis（`analysisBrief*/QualityGate`） | 3 | 526 | 3/3 |
| harness（`harness*`） | 3 | 1,203 | 3/3 |
| runtime-projection（`runtimeHandoff/OutcomeProjection`） | 2 | 691 | 2/2 |
| misc | 9 | 1,583 | 7/9 |

（平铺生产层合计 57 文件 / **12,084 行**）

语义聚类内聚度 = **0.47**（intra 68 / inter 76）——**优于前缀族，但仍低于 0.5**。

### 2.5 域间耦合方向（决定归属的关键）

**出向**（cluster → 其他域，仅 18 边）：

| 目标域 | 边 |
|---|---:|
| `context/acquisition/code` | 7 |
| `workflow` | 2 |
| `edit/patch/plan`、`edit/patch/apply`、`edit/result`、`result/projection/shell`、`planning/quality`、`planning/action`、`verification`、`browser` | 各 1 |

**入向**（其他域 → cluster，182 边 / 103 文件）：

| 来源域 | 边 |
|---|---:|
| `context` | 51 |
| `session` | 35 |
| `planning` | 26 |
| `core` | 19 |
| `verification` | 12 |
| `presentation` / `result` / `edit` | 各 2 |
| `evidence` | 1 |

**入向 182 : 出向 18 ≈ 10:1** → 这是**被广泛消费的模型/契约层**特征，不是对等域。

## 3. 可达性通路

- CLI 可达 **66/123**。其中 **14 个仅经由 `context/acquisition` 可达**
  （屏蔽 `context/acquisition` 后失去）：`agentPlanContext`、`agentPlanProjection`、
  `contextGraphBudget`、`contextGraphDiscovery`、`contextGraphResult`、`contextPacketResult`、
  `contextPlan`、`harnessFailureTaxonomy`、`harnessScorecard`、`harnessTrace`、
  `runtimeOutcomeProjection`、`taskContextResult`、`taskLifecycleResult`、`taskLifecycleTrace`。
- **`context/acquisition/graph.ts`（840 行）单文件引入 27 个 orchestration 模块**——
  它是整个 cluster 的主要消费者与可达性来源。
- **但 `graph.ts` 自身只有 2 个调用者**（`context/acquisition/engine.ts` 3 处、
  `context/memory/model.ts`）。即：
  **一个近乎叶子的 840 行文件，承担了 27 条 orchestration 边的汇合点**——
  这解释了为何 14 个模块"仅经由 acquisition 可达"。若该文件或其调用链变动，
  这 14 个模块的可达性会整体改变。
  （**勘误**：本节初版写"只有 1 个调用者"，实测为 2 个；见
  `step-4-decision-research.md` §3.1。）
- 原 composition root `runMvpIntegratedFlow.ts` **已在 Step 2.5-C-3 删除**（`7a59ab23`），
  `module-atlas.md` 中"orchestration 是 agent loop 组合根"的描述**已过期**。
- 直接入口（CLI 可达文件直接 import orchestration）共 29 个目录，最大三个：
  `context/acquisition`（29 边）、`planning/quality`（15 边）、`verification/command`（9 边）。

## 4. 双向耦合（阻塞点）

**存在真实双向依赖**：

| 方向 | 证据 |
|---|---|
| `orchestration/contextGraph.ts` ← `context/acquisition/code/{facts,trace,staleness}.ts` | 4 边 |
| `orchestration/*` → `context/acquisition/code/{trace,impact,staleness}.ts` | 7 边 |

**但无环**：`orchestration` 中**零文件** import `context/acquisition/graph.ts`，
且 `context/acquisition/code/*` 不 import `graph.ts`。
故当前全仓 SCC = 0（与 §2.4.1 基线一致）。

`context/acquisition/engine.ts` 亦 import `orchestration/{types,workflowTaskPlanner}`。

### 5. 子目录判定

| 目录 | 文件 | 判定 |
|---|---:|---|
| `patchRecovery/` | 16（生产 8） | **不属 orchestration**。8 个生产文件全部 CLI 可达，职责是 `/restore` 恢复权威存储 + 恢复面投影 + 恢复原语。消费方：`core/commands/restoreCommandRuntime`、`runtime/execution/service`、`edit/patch/plan/hunkSet`、`cli/interactive/picker/restore`、`context/compact/{command,continuity}`。**候选归属：`edit/recovery/`（已有该目录，现仅 2 文件）或新建 `recovery/`。** |
| `patchResult/` | 4 | **不属 orchestration**。`editCapability{CloseoutManifest,Readiness}` 是编辑能力清单/就绪度契约。消费方：`context/compact/{command,continuity,delivery}`、`context/startup`。**候选归属：`edit/result/`。** |
| `patchParsing/` | 2 | **不属 orchestration**。`PatchOperationKind`/`PatchHunk` 等补丁解析类型。消费方：`edit/patch/plan/types`、`edit/patch/status/mixedOperation`。**候选归属：`edit/patch/`。** |

三个子目录的共同特征：**消费者全在 edit / restore / compact 侧，无一在 orchestration 内部**。

## 6. 归属判定（本步结论）

### 6.1 `orchestration/` 的真实性质

**它是「被广泛消费的上下文/任务模型与投影层」，不是编排执行域。**

依据：
1. 入向 182 : 出向 18（10:1）——消费者远多于生产者。
2. 55 文件主分量中，`types.ts` 被 **7 个顶层域**引用；`contextGraph`/`agentPlan`/
   `taskLifecycle`/`taskExecutionPlan`/`taskContextSufficiency`/`analysisQualityGate`/
   `testImpactPlan` 各被 3 个域引用。
3. 主分量出向仅 18 边，且 7 边指向 `context/acquisition/code`——即**它自身几乎没有对外行为**，
   主要是数据形状 + 纯投影函数。
4. 主分量 55 文件中 **12 个是 sources**（无 cluster 内入边）：`agentPlanProjection`、
   `contextGraph{Discovery,Readiness,Result}`、`contextPacketResult`、
   `gitChangeSetAttribution`、`harnessScorecard`、`providerAnchoringResult`、
   `taskContextResult`、`taskLifecycle{Result,Trace}`、`verificationRepairContext`——
   `*Result`/`*Projection`/`*Trace` 一族，典型的"产出投影"角色。
5. **真正的编排执行不在 `orchestration/`**：`orchestration/` 与 `turn/`、
   `runtime/loop/` 之间**零 import 边**（双向核验均为空）。
   执行侧在 `turn/`（12 文件）、`runtime/loop/`（12 文件）、`planning/`（7 文件）。
   **该零边事实同时独立佐证了 CB-005（`turn` 与编排层不连通）**——
   本步从 import 图角度再次确认，与 `deleted-audit` 附十的结论一致。

**名称与内容不符**：目录名 `orchestration` 暗示编排执行，实际内容是
上下文图模型、任务生命周期、provider 提案锚定、分析简报、harness 追踪的**契约与投影**。

### 6.2 候选目标结构（待维护者裁决）

| 语义组 | 文件 | 候选归属 | 依据 |
|---|---:|---|---|
| context-graph | 11 | `context/graph/`（已有目录，现仅 1 文件 `ast/parser.ts`） | 上下文图模型 + 评分 + 就绪度 |
| task-lifecycle | 11 | `planning/`（已有 `planning/{action,execution,grounded,handoff,quality,runtime}`） | 任务意图/阶段/生命周期/读取计划 |
| provider-proposal | 10 | `provider/`（已有 `{registry,request,response}`） | provider 提案锚定与校验 |
| edit-proposal | 5 | `edit/`（已有 `{authority,multifile,patch,recovery,result}`） | 编辑提案/修复上下文 |
| agent-plan | 3 | `planning/` | agent 计划与投影 |
| analysis | 3 | `planning/quality/` | 分析简报与质量门 |
| harness | 3 | `core/harness/`？ | **须先核实**：`core/harness/README.md` 规定该目录是 dev/eval 表面、不 bulk-move；但这 3 个文件是生产可达的追踪/记分卡 |
| runtime-projection | 2 | `result/` 或 `runtime/` | 运行终态与交接投影 |
| misc（9） | 9 | 逐个判定 | 含 `types.ts`（44 导出，7 域消费）——**须单独裁定** |
| `patchRecovery/`（8 prod） | 8 | `edit/recovery/` 或新建 `recovery/` | 恢复权威 |
| `patchResult/`（2 prod） | 2 | `edit/result/` | 编辑能力契约 |
| `patchParsing/`（1 prod） | 1 | `edit/patch/` | 补丁解析类型 |

### 6.3 未决问题（须维护者裁决，本步不擅自决定）

> **研究已完成**：5 项的实测结论与方案建议见 `step-4-decision-research.md`。
> 含 2 处对本文的勘误（`graph.ts` 调用者数、Q5 消费者集合）。

1. **`types.ts`（318 行、44 导出、7 域消费）的归属**。它是全仓最广被引用的契约文件之一，
   含 `CodingResultSummary` / `OrchestrationResult` / `AgentRole` 等。
   候选：`result/`（终态契约）、`session/`（会话结果）、或保留为 `orchestration/` 的公共契约面。
2. **harness 3 文件（1,203 行）是否迁入 `core/harness/`**。该目录 README 明文
   "not a product runtime ownership boundary"，但这 3 个文件是**生产可达**且被
   `context/acquisition/graph.ts` 消费。需裁决：是"harness 概念的生产侧"还是"产品追踪能力"。
3. **`context/acquisition` 的 29 边**。它是 cluster 的主要消费者；若 cluster 拆入多个域，
   `graph.ts`（840 行）需同时指向 4-5 个新位置，其自身是否应拆分须一并评估。
4. **是否保留 `orchestration/` 目录**。若全部拆出，该目录消失；若保留，
   应改为表达其真实职责的名称（当前名与内容不符）。
5. **`agentPlan` / `analysis` / `taskLifecycle` 三组是否合并**为统一的"任务规划"子域
   （它们互相引用密集：task-lifecycle↔analysis 5 边、task-lifecycle↔context-graph 8 边）。

## 7. 验证纪律（本步适用）

- 本步为**判定**，零代码改动 → 不跑构建/测试（`plan.md §2.4` + `agent-rules` 规则）。
- 若后续执行搬迁：按 §2.4.1 六条纪律，**先跑 SCC**（基线全仓 0 环），
  按 import 图**实测**边数，只重算 escaping 边，并做 PTY 实机验证
  （触及 `core/commands`、`runtime/execution`、`session/`）。
