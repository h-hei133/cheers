# Step 4 — 5 项未决问题的研究结论与方案建议（2026-09-18）

> 输入：`step-4-orchestration-map.md` §6.3 的 5 项未决问题。
> 参考：`~/projects/pi`（只读），按 `agent-rules/reference-repositories.md` 做定向语义对比。
> 所有数字均为脚本实测（import 图解析 + `analyze-boundaries.py`），未采信估算。

---

## 0. pi 参考的关键发现（先讲，因为它改变了两项判断）

### 0.1 pi 没有本仓的这些概念

`grep -rl "ContextGraph\|TaskLifecycle\|AnalysisBrief" packages/*/src` → **零命中**。

pi 的 5 个包（agent 180 / coding-agent 646 / ai 340 / tui 87 / chord 34 文件）中
**不存在** 上下文图、任务生命周期、分析简报、provider 锚定提案。
这些是本仓特有的能力。**结论：本步的 5 项决策不能靠"pi 怎么做"来回答，
只能靠本仓自己的职责边界 + pi 的可迁移原则。**

### 0.2 pi 的可迁移原则（4 条，均有路径证据）

| # | 原则 | pi 证据 | 对本步的意义 |
|---|---|---|---|
| P1 | **共享契约放在所属包根部，跨运行时线协议另立包** | `packages/agent/src/types.ts`（446 行，agent loop 的全部契约）；`packages/protocol/src/protocol.ts`（110 行，CBOR 帧 + `PROTOCOL_VERSION`，跨进程） | **Q1**：`types.ts` 不该按"谁用得多"决定归属，而该问"它是包内契约还是跨运行时线协议"。本仓无跨运行时消费者 → 归包内某个拥有者 |
| P2 | **harness 是产品运行时，不是测试夹具** | `packages/agent/src/harness/` 含 `runtime/{drive,lane,reducer,transcript,restore}.ts`、`session/`、`tools/`、`compaction/`——真实运行时；而 **scorecard/failure 分类不在 harness，在独立的 `packages/evals/`** | **Q2**：直接命中。追踪/记分/失败分类属**证据与评估**，不属运行时 harness |
| P3 | **禁止引入通用抽象层** | `packages/agent/docs/runtime-simplification.md` 明文：`Do not introduce a generic Procedure interface, runner, scheduler, graph, callback plan, or dependency facade.` | **Q5**：合并三组前必须证明不是"为了整齐而造抽象层" |
| P4 | **域用 kebab-case，子域按关注点分** | `harness/{compaction,session,tools,runtime,execution,utils}`；`coding-agent/src/core/{compaction,tools,extensions}` | **Q4**：目录名应表达关注点；本仓用 camelCase 文件名 + 域目录，与 pi 的 kebab-case 不同，但"域目录承载上下文"一致 |

---

## 1. Q1 — `types.ts`（318 行 / 44 导出 / 73 消费者）的归属

### 1.1 实测数据

| 项 | 值 |
|---|---:|
| 导出 | 44（24 type + 20 interface，**零运行时导出**） |
| 消费者 | **73**（生产 54 + 测试 19） |
| 实际被 import 的符号 | **20**（其余 24 个是内部引用/传递依赖） |
| 消费域 | `session` 25、`core` 14、`orchestration` 8、`result` 2、`verification` 2、`context` 1、`evidence` 1、`presentation` 1 |

**符号-域矩阵**（谁用哪些）：

| 符号 | 域数 | 域 |
|---|---:|---|
| `CodingTaskKind` | 6 | context, core, evidence, orchestration, result, session |
| `CodingResultSummary` | 6 | core, orchestration, presentation, result, session, verification |
| `TerminalReason` | 4 | core, orchestration, presentation, session |
| `CodingVerificationSummary` | 4 | evidence, orchestration, result, verification |
| `OrchestrationStatus` / `CodingActionResultSeed` | 3 | — |
| `AgentExecutionOutput` / `AgentRole` / `OrchestrationResult` / `ContinuationReason` | 2 | core, session |

### 1.2 关键否证：**拆分不成立**

按语义把 44 个导出切成两半（result-family 23 个 vs agent-execution 13 个），
测 73 个消费者各自需要哪半：

| 类别 | 消费者数 |
|---|---:|
| 需要**两半** | **14** |
| 只需 result-family | 44 |
| 只需 agent-family | 15 |

**14/73 = 19% 的消费者需要两半** → 拆分会产生 14 个双向 import。
**这不是一个干净的接缝，拆分不划算。**

### 1.3 归属建议

**建议：保留为单一契约模块，迁至 `session/result/`（或 `result/contract/`），不拆。**

理由：
1. **它是"编码结果契约"，不是"编排契约"**。20 个被用符号里，
   `CodingResultSummary`(45 次)、`CodingVerificationSummary`(7)、`CodingPatchRecord`、
   `CodingWriteEffect` 全是**结果**语义；`OrchestrationResult`/`OrchestrationStatus`
   是历史命名残留（无 orchestration 执行者消费）。
2. **最大消费者是 `session`（25 文件）**，其次 `core`（14）。二者都不属编排。
3. 拆分会造 14 个双向边（§1.2 实测）——违反 P3"不要为整齐造抽象层"。
4. P1 类比：pi 把包内契约放在**被消费最多的包的根部**；本仓消费最多的是
   `session` + `result`，而 `result/` 已有 `terminal/truth.ts`、`projection/*/verdict.ts`
   等终态契约，语义同族。

**备选（若维护者不愿动 73 个 import）**：原地保留，但在文件头加注其真实职责，
并把它从"orchestration 域"的语义中摘出（配合 Q4 的目录处置）。

---

## 2. Q2 — harness 3 文件（1,203 行）的去向

### 2.1 实测数据

**消费者（全部）**：

| 消费者 | 性质 | 用到的文件 |
|---|---|---|
| `context/acquisition/graph.ts` | **生产** | `harnessScorecard`, `harnessTrace` |
| `orchestration/taskLifecycleTrace.ts` | **生产** | `harnessTrace` |
| `harnessTrace.test.ts` / `harnessScorecard.test.ts` / `harnessFailureTaxonomy.test.ts` | 测试 | — |

即：**生产消费者只有 2 个文件**，且都把它当作"证据"字段
（`graph.ts:74 readonly harnessTrace: HarnessTrace`）。

**`core/harness/` 的实际构成**：

| 项 | 值 |
|---|---:|
| 总文件 | 68 |
| 测试文件 | 35 |
| 非测试文件 | **33，全部是 scenario/fixture/report 命名** |
| CLI 可达 | **3**（`browserPublicReadOnlyWebSmoke{Config,Report,Runner}.ts`） |

### 2.2 pi 的对照（决定性）

pi 把**同类关注点**放在两个不同地方：

- **运行时 harness** → `packages/agent/src/harness/`（drive/lane/reducer/restore）——真实运行时
- **记分卡/评估** → 独立包 `packages/evals/`（`pi-harness.ts`、`harness-table.ts`、`summary.ts`）

**本仓的 `harnessTrace`/`harnessScorecard`/`harnessFailureTaxonomy` 属后者**：
它们是**对运行的评估与分类**，不是运行时本身。

### 2.3 归属建议

**建议：迁至 `evidence/` 域，不迁入 `core/harness/`。**

理由：
1. `core/harness/README.md` 明文 "not a product runtime ownership boundary"，
   且其 33 个非测试文件**全是 scenario fixture**——把生产可达的评估契约放进去，
   是把它变成"产品与夹具混居地"，与 README 声明的边界冲突。
2. 二者消费者（`graph.ts`、`taskLifecycleTrace.ts`）都把它当**证据字段**消费。
   本仓 `evidence/` 已有 `types.ts`、`verdictFacade.ts`、`projection/*`——
   同族语义（证据、裁决、分级）。
3. pi 的 P2 对照：评估/记分不属运行时 harness。
4. `harnessFailureTaxonomy`（597 行，4 导出）是**失败分类学**，
   与 `evidence/` 的 `ProductEvidenceLevel`/`not-proven` 分级同族。

**具体建议**：
```
src/evidence/harness/{trace.ts, scorecard.ts, failureTaxonomy.ts}
```
（文件名去掉 `harness` 前缀由目录承载——但**注意 Q4/Step 6 的命名税边界**，
若不想在本步动命名，可先 `src/evidence/harness/harnessTrace.ts` 保持原名。）

---

## 3. Q3 — `context/acquisition/graph.ts` 的 29 边是否一并重构

### 3.1 实测数据（含对映射表的修正）

| 项 | 值 |
|---|---:|
| 行数 | 840 |
| import 数 | 33（其中 27 个 orchestration） |
| function-like 名称 | **15**（上限 20，**未超**） |
| **调用者** | **2 个文件**：`context/acquisition/engine.ts`（3 处）、`context/memory/model.ts` |

**映射表修正**：§3 曾写"只有 1 个调用者"，**实测为 2 个**（`engine.ts` 亦引用）。
已修正。

### 3.2 判断

**建议：本步不重构 graph.ts，只做机械 import 重写。**

理由：
1. **它未超模块上限**（15 ≤ 20），不是必须拆的对象。
2. 它的职责单一：`buildContextGraphPlanningBundle` 把 27 个模块的产物
   组装成一个 planning bundle——**这是合法的组合根职责**，不是错置。
   （真正的错置组合根 `runMvpIntegratedFlow.ts` 已删。）
3. **风险不对称**：graph.ts 是 14 个 orchestration 模块的唯一可达路径。
   在同一批里既搬迁 27 个依赖、又重构该文件本身，一旦出错，
   故障面覆盖整个上下文获取链。**先搬迁、后重构**是更低风险的两步。
4. 若 cluster 拆入 4-5 个域，graph.ts 的 27 条 import 会指向新位置——
   这是**机械改写**，不改行为，可安全随批完成。

**后续（Step 4 执行完后）**：可评估把 `buildContextGraphPlanningBundle`
按"读取计划 / 预算核算 / 评分 / 充分性裁决 / 下一步建议"拆为
`context/acquisition/graph/{bundle,readPlan,budget,scoring,sufficiency}.ts`。
**但这是独立一步，不与搬迁同批。**

---

## 4. Q4 — `orchestration/` 目录是否保留 / 更名

### 4.1 实测数据

| 检查 | 结果 |
|---|---|
| `orchestration` 是否在 `agent-rules/file-placement-and-naming.md` 的**sanctioned owner domains** 列表 | **不在**。该列表为：runtime, turn, context, planning, provider, tools, session, evidence, result, presentation, policy, edit, verification, repair |
| `docs/DOC_STATUS.md` 对 `module-atlas.md` 的标注 | **superseded**（被 `control-plane-atlas.md` 取代） |
| `docs/DOC_STATUS.md` 对 `control-plane-atlas.md` 的标注 | **active** |
| **active 的 control-plane-atlas 引用的 orchestration 文件是否仍存在** | **13 个全部已删**（`runMvpIntegratedFlow`、`workflowIntentProjection`、`approvalAuthorityProjection`、`mutationRoutingProjection`、`mutationExecution`、`patchMutationLane`、`providerOutcomeProjection`、`readInspectModule`、`verificationModule`、`continuationModule`、`browserModule`、`toolRuntimeModule`、`resultSurfaceModule`） |

### 4.2 判断

**建议：不保留 `orchestration/` 目录名；内容按语义迁入 sanctioned 域。**

理由：
1. **名称不在本仓自己的 sanctioned 列表内**，而内容又确非编排执行
   （Step 4 映射表已证：入向 182 : 出向 18，与 `turn/`、`runtime/loop/` 零边）。
2. **active 文档已严重过期**：13/13 引用文件不存在。继续以 `orchestration/`
   为名会持续误导（这正是 `module-atlas.md` 被判 superseded 的同类问题）。
3. 按 `agent-rules` 的"域目录承载上下文"，其内容应落到
   `context/`（图/包）、`planning/`（任务/分析）、`provider/`（提案锚定）、
   `edit/`（编辑提案）、`evidence/`（harness 三件套）。

**命名候选**（若维护者坚持保留单一目录而非拆散）：

| 候选 | 依据 | 评价 |
|---|---|---|
| `planning/context/` | `agent-rules` 的 sanctioned 子域示例里**恰好列了** `planning/context/` | ✅ 有规则直接支持 |
| `context/planning/` | 同上，但反序 | ⚠️ 非示例形式 |
| 保持 `orchestration/` | 无 | ❌ 名不符实 |

**附带建议**：本步应顺带**修正 `control-plane-atlas.md` 的 13 处失效引用**
（它标注为 active，却被当作实现上下文读取）。

---

## 5. Q5 — `agentPlan` / `analysis` / `taskLifecycle` 三组是否合并

### 5.1 实测数据

**17 文件内部边：43 条。边矩阵（from → to）**：

```
agentPlanContext        -> agentPlan, analysisBrief, analysisBriefCalibration,
                           analysisQualityGate, taskContextNeed, taskContextSufficiency,
                           taskExecutionPlan, taskLifecycle
agentPlanProjection     -> agentPlan, agentPlanContext
analysisBrief           -> agentPlan, taskIntent, taskReadPlan
analysisBriefCalibration-> analysisBrief, taskContextSufficiency
analysisQualityGate     -> analysisBriefCalibration, taskContextSufficiency
taskContextAcquisition  -> taskContextNeed
taskContextNeed         -> taskIntent
taskContextResult       -> analysisBriefCalibration, analysisQualityGate,
                           taskContextAcquisition, taskContextNeed, taskContextSufficiency
taskContextSufficiency  -> taskContextAcquisition, taskContextNeed
taskExecutionPlan       -> agentPlan, analysisBrief, taskLifecycle, taskReadPlan
taskIntent              -> agentPlan
taskLifecycle           -> taskIntent, taskStage
taskLifecycleResult     -> analysisBrief, taskExecutionPlan, taskLifecycle, taskReadPlan
taskLifecycleTrace      -> analysisBrief, taskExecutionPlan, taskLifecycle, taskReadPlan
taskReadPlan            -> taskIntent
```

**结构性质**：
- **零环**（DFS 验证）——是一个 DAG。
- sources（无内部入边）：`agentPlanProjection`, `taskContextResult`, `taskLifecycleResult`, `taskLifecycleTrace`
- sinks（无内部出边）：`agentPlan`, `taskStage`

**外部消费者（生产）**——这是决定性数据：

| 组 | 生产消费者 |
|---|---|
| agentPlan | `context/acquisition/graph.ts`、`orchestration/verificationRepairContext.ts`、`planning/quality/model.ts`、`verification/command/plan.ts` |
| analysis | **同样这 4 个** |
| taskLifecycle | **同样这 4 个** |

**三组的消费者集合完全相同（4 个生产文件）。**

### 5.2 判断

**建议：合并为一个子域。**

理由：
1. **消费者集合完全相同**（4/4 重合）——没有任何一组有独立的外部消费者。
   分开只会让同一批消费者写 3 组 import。
2. **内部 43 条边、零环、单一 DAG**——它们本来就是一个流水线，
   被文件名前缀人为切成了三段。这**正是 Step 4 映射表 §2.3 否证过的同一错误**
   （前缀族内聚度最高仅 0.42）。
3. 组间边（task-lifecycle↔analysis 5 条、↔context-graph 8 条）说明它们协同工作。

**但必须避开 P3 陷阱**：合并**不是**造一个"通用任务编排抽象层"。
合并的形态应是**一个承载关注点的目录**，而不是一个统一的
`TaskPlanner` 接口/调度器。具体：

```
src/planning/task/
  intent.ts          (taskIntent)
  stage.ts           (taskStage)
  lifecycle.ts       (taskLifecycle)
  lifecycleResult.ts
  lifecycleTrace.ts
  executionPlan.ts   (taskExecutionPlan)
  contextNeed.ts / contextAcquisition.ts / contextSufficiency.ts / contextResult.ts
  readPlan.ts
  analysisBrief.ts / analysisBriefCalibration.ts / analysisQualityGate.ts
  agentPlan.ts / agentPlanContext.ts / agentPlanProjection.ts
```
即 **17 文件平铺进一个子域**，保留各自单一职责，**不引入新的接口或调度器**。

**备选**：若认为 17 文件过多，可只合并 `agentPlan` + `analysis`（6 文件，
二者互引 5 条），`taskLifecycle` 11 文件独立。但消费者相同的证据支持全合并。

---

## 6. 汇总建议

| Q | 建议 | 依据强度 |
|---|---|---|
| **Q1** `types.ts` | **不拆**，迁 `session/result/`（或 `result/contract/`）；拆分会造 14 个双向边 | 强（实测接缝不干净） |
| **Q2** harness 3 文件 | 迁 `evidence/harness/`，**不进** `core/harness/` | 强（README 声明 + pi 对照 + 消费者当证据用） |
| **Q3** `graph.ts` | **本步只机械重写 import，不重构**；未超上限（15≤20），是合法组合根 | 强（上限实测 + 风险不对称） |
| **Q4** 目录 | **不保留 `orchestration/` 名**；按语义迁入 sanctioned 域；顺带修 `control-plane-atlas` 13 处失效引用 | 强（不在 sanctioned 列表 + active 文档已过期） |
| **Q5** 三组 | **合并为一个子域**（17 文件平铺，**不造抽象层**） | 强（消费者集合 4/4 相同 + 零环 DAG） |

### 6.1 建议的执行顺序（若批准）

风险递增，每步独立可验证：

1. **`patchRecovery/`(8) → `edit/recovery/`** — 消费者全在 edit/restore/compact 侧
2. **`patchResult/`(2) → `edit/result/`**、**`patchParsing/`(1) → `edit/patch/`**
3. **harness 3 文件 → `evidence/harness/`**
4. **17 文件 → `planning/task/`**
5. **provider-proposal(10) → `provider/proposal/`**
6. **edit-proposal(5) → `edit/proposal/`**
7. **context-graph(11) → `context/graph/`**
8. **misc(9) 逐个判定**，含 `types.ts`（Q1）
9. 修正 `control-plane-atlas.md` 失效引用；删除空 `orchestration/`

每步按 `plan.md §2.4.1` 六条纪律：先跑 SCC、按图实测边数、只重算 escaping 边、
校验 `.js` 后缀、PTY 实机验证（触及 `core/commands`/`runtime/execution`/`session/`）、
证明改动仅 import。

### 6.2 与 Step 6 命名税的关系

本步**不改文件名**（Q2 的可选前缀去掉除外）。`src/browser/` 161 个平铺文件的
`browser` 前缀仍留给 Step 6，与 orchestration 命名一并裁定——
但注意 Q4 已给出结论：**`orchestration` 这个名字本身就该消失**，
故 Step 6 的命名税范围应包含"域目录更名"而非仅"文件前缀"。
