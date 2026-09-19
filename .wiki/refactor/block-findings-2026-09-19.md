# 区块探索发现（2026-09-19）

> 探索坐标见 `block-exploration-2026-09-19.md`。
> **区块只是观察坐标，不是目标架构**——本文件不提议任何按区块的搬迁。
> 所有发现附 `file:line` 或可复核的量化依据。

---

## 1. `runtime/events/` 整域只有测试消费者（3,182 行）

| 文件 | 行数 | 生产消费者 | 测试消费者 |
|---|---:|---:|---:|
| `runtime/events/projection.ts` | **3,006** | **0** | 4 |
| `runtime/events/stream.ts` | 176 | **0** | 2 |

**证据**（value 边反向闭包，排除 `import type`）：

```
runtime/events/projection.ts   prod=0  test=4
runtime/events/stream.ts       prod=0  test=2
```

消费者全是测试文件：`provider/registry/provider.test.ts`、`tools/toolHandoff.test.ts`、
`runtime/events/{projection,stream}.test.ts`。

**动态入口检查**（`plan.md` §2.2 #4）：`grep path.join|import(|spawn|execFile|process.argv`
= **0**。不在公共面（`index.ts` 未导出）。

**影响**：这是 CB-005 同形态的孤立簇——但**更隐蔽**，因为它有 4 个测试引用，
静态可达性分析会把它算作"测试可达"而非"零引用"。

**注意**：判定前必须确认那 4 个测试的**被测对象**是否也是死的
（CB-005 的教训：不是"测试指向死代码"，而是"被测对象本身也死"）。

**置信度**：高（消费者计数可复核）。**处置需裁决**：删，还是保留为测试基建。

---

## 2. `runtime/events/projection.ts` 是 2,626 行的单个函数

| 指标 | 值 |
|---|---:|
| 文件行数 | 3,006 |
| 导出数 | **5**（仅 1 个导出函数 `projectRuntimeEvents`） |
| `projectRuntimeEvents` 函数体 | **约 2,626 行**（311 → 2937） |
| 内部函数 | 4（`sanitizeRecord` / `sanitizeValue` / `sanitizeText` / `deepFreeze`） |

**为什么门禁没抓到**：`analyze:module-facades` 的判据是**声明名数 > 20**，
而本文件只有 5 个声明名。**该判据对"单个巨型函数"是盲的**——
判据衡量的是聚合面，不是函数体长度。

**影响**：这是一个不可维护的单元。任何改动都要在 2,626 行里定位。

**置信度**：高（行数可复核）。

---

## 3. `core/` 依赖 feature 域，违反自身准入规则（190+ 边）

`agent-rules/file-placement-and-naming.md:78-82` 明文规定：

> `core/` must not depend on a feature domain.
> **Direction.** Its imports resolve only within `core/` or to sanctioned
> leaf/cross-cutting domains (`config/`, `observability/`, `artifacts/`,
> `model-adapters/`). **A module that imports a feature domain belongs in that
> domain, not in `core/`.**

**实测越界边**（`core/` → feature 域）：

| 目标域 | 边数 |
|---|---:|
| `browser` | 62 |
| `context` | 27 |
| `presentation` | 25 |
| `memory` | 23 |
| `tools` | 17 |
| `session` | 16 |
| `config` | 15（**sanctioned，不算违规**） |
| `result` | 14 |
| 其余 13 个域 | 41 |

**违规文件集中在 `core/commands/`（63 文件中 17 个）**：

| 文件 | 越界边 |
|---|---:|
| `core/commands/memoryCommandRuntime.ts` | 13 |
| `core/commands/sidebarCommandRuntime.ts` | 8 |
| `core/commands/compactCommandRuntime.ts` | 6 |
| `core/commands/exportCommandRuntime.ts` | 3 |
| `core/commands/sidebarCommandEvents.ts` | 3 |
| `core/commands/browserCommandRuntime.ts` | 2 |
| `core/commands/contextCommandRuntime.ts` | 2 |
| `core/commands/restoreCommandRuntime.ts` | 2 |
| `core/commands/warmupCommandRuntime.ts` | 2 |
| 另 8 个文件 | 各 1 |

**同时违反准入条件 2（Audience）**：`core/commands/` 的消费者是
`entrypoints/slashCommandRegistry.ts`、`cli/interactive/*`、`turn/prompt.ts`、`turn/step.ts`
——**全是 feature 域**，没有一个 `core/` 内部消费者。

**即：`core/commands/` 整体不满足 `core/` 的三条准入条件中的前两条。**

**置信度**：高（规则原文 + 边数可复核）。
**注意**：这**不是**说要把 `core/commands/` 整体搬走——那需要先裁决它属于哪个域。
本文件只报告"与规则不符"，不提议去向。

---

## 4. `planning` ↔ `context` 双向依赖（36 + 27 边）

| 方向 | 边数 |
|---|---:|
| `planning` → `context` | 36 |
| `context` → `planning` | 27 |

**具体证据**：
- `context/acquisition/graph.ts:2,5,18,24,32-37` → 20 条到 `planning/` 的 value 导入
- `planning/task/agentPlanContext.ts:4` → `context/graph/contextPlan.js`（value）
- `planning/quality/model.ts:6` → `context/graph/contextGraphReadiness.js`（value）
- `planning/runtime/engine.ts:11` → `context/acquisition/engine.js`（value）

**重要更正**：**未构成 import 环**。用 Tarjan 独立复算（仅 value 边）：
**SCC > 1 的强连通分量 = 0**，与 `verify:import-cycles` 一致。

即：域级双向，但**文件级无环**——`graph.ts → planning → context/graph/*`，
而 `context/graph/*` 不回指 `graph.ts`。

**影响**：域级双向依赖意味着两个域的边界不清晰，改动易互相牵连；
但**不构成技术债**（无环）。属"可改善"而非"必须修"。

**置信度**：高。

---

## 5. 大文件分布（>600 行，共 14 个）

| 文件 | 行数 |
|---|---:|
| `runtime/events/projection.ts` | **3,006** |
| `core/query/runtime/harness.ts` | 967 |
| `edit/multifile/model.ts` | 868 |
| `provider/request/attempt.ts` | 857 |
| `context/memory/model.ts` | 853 |
| `edit/recovery/model.ts` | 844 |
| `context/acquisition/graph.ts` | 840 |
| `context/readDeliveryProjection.ts` | 827 |
| `verification/result/boundary.ts` | 807 |
| `provider/request/boundary.ts` | 800 |
| `provider/registry/provider.ts` | 745 |
| `repair/handoff/boundary.ts` | 736 |
| `entrypoints/cliApprovalModule.ts` | 736 |
| `core/shell/recovery.ts` | 711 |

**观察**：除 `projection.ts` 外，其余均在 700–970 区间，且**多数已有拆分记录**
（B4 阶段拆过 `edit/multifile/model.ts`、`core/query/runtime/harness.ts` 等）。
`projection.ts` 是唯一超出量级的异常值。

---

## 6. 待子代理回报的区块

| 区块 | 负责 |
|---|---|
| A 执行内核 | `BlockA`（scout） |
| D 浏览器 | `BlockD`（scout） |

回报后并入本文件。

---

## 7. `core/query/runtime/` 有 7 个孤儿文件（1,257 行）

value 边反向闭包（排除 `import type`）：

| 文件 | 行数 | 生产消费者 | 测试引用 | 动态入口 |
|---|---:|---:|---:|---:|
| `actionAuthority.ts` | 312 | **0** | **0** | 0 |
| `proof.ts` | 323 | **0** | **0** | 0 |
| `policy.ts` | 272 | **0** | 1 | 0 |
| `harnessState.ts` | 177 | **0** | **0** | 0 |
| `batch.ts` | 143 | **0** | **0** | 0 |
| `decision.ts` | 30 | **0** | **0** | 0 |

**合计约 1,257 行**，全部通过 §2.2 检查 4（无动态入口）。

**注意 `events.ts` 的反例**：它被 **31 个文件**引用，但**全是 `import type`**——
`grep` 会显示"31 个消费者"，而 value 边为 **0**。
`QueryEvent` 是纯类型，被 `turn/`、`session/`、`entrypoints/` 广泛使用。
**这正说明"消费者计数"必须区分 value 与 type 边**，否则会误判。

**置信度**：高。

---

## 8. 方法论提醒（写给自己与后续探索）

1. **`import type` 让死代码看起来是活的**——本仓 31 个文件 type-import `events.ts`，
   而它 0 个 value 消费者。计数必须分离两类边。
2. **"零引用"必须排除动态入口**——已有一个真实教训
   （`test-utils/longSessionDurabilityProcess.ts` 经 `spawnSync` 启动，静态分析误报）。
3. **门禁判据有盲区**——`analyze:module-facades` 按"声明名数 > 20"判定越界，
   对"单个巨型函数"完全盲（`projection.ts` 只有 5 个声明名、3,006 行）。
4. **域级双向 ≠ 有环**——`planning`/`context` 双向 63 条边，但 Tarjan 复算
   **0 个强连通分量**。域级观察与文件级判据是两回事，不可互相代替。
