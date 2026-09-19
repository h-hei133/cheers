# 区块探索发现（2026-09-19）

> 探索坐标见 `block-exploration-2026-09-19.md`。
> **区块只是观察坐标，不是目标架构**——本文件不提议任何按区块的搬迁。
> 所有发现附 `file:line` 或可复核的量化依据。

---

## 1. `runtime/events/` 整域只有测试消费者（3,182 行）

| 文件 | 行数 | 生产消费者 | 外部测试消费者 | 域内测试 |
|---|---:|---:|---:|---:|
| `runtime/events/projection.ts` | **3,006** | **0** | 2 | 1 |
| `runtime/events/stream.ts` | 176 | **0** | 1 | 1 |

**证据**（value 边反向闭包，排除 `import type`；外部消费者已逐行核实）：

```
runtime/events/projection.ts   prod=0  external-test=2  internal-test=1
runtime/events/stream.ts       prod=0  external-test=1  internal-test=1
```

- **外部**测试消费者：`provider/registry/provider.test.ts:4`（引 `projection`）、
  `tools/toolHandoff.test.ts:5-6`（同时引 `stream` 与 `projection`）
- **域内**测试：`runtime/events/projection.test.ts`、`runtime/events/stream.test.ts`

消费者全是测试文件：`provider/registry/provider.test.ts`、`tools/toolHandoff.test.ts`、
`runtime/events/{projection,stream}.test.ts`。

**动态入口检查**（`plan.md` §2.2 #4）：`grep path.join|import(|spawn|execFile|process.argv`
= **0**。不在公共面（`index.ts` 未导出）。

**影响**：这是 CB-005 同形态的孤立簇——但**更隐蔽**，因为它有测试引用（外部 2 + 域内 2），
静态可达性分析会把它算作"测试可达"而非"零引用"。

**注意**：判定前必须确认这些测试的**被测对象**是否也是死的
（CB-005 的教训：不是"测试指向死代码"，而是"被测对象本身也死"）。

**置信度**：高（消费者计数可复核）。**处置需裁决**：删，还是保留为测试基建。

> **2026-09-19 主代理复测更正**：原文"`projection.ts` prod=0 **test=4** / `stream.ts` prod=0 **test=2**"。
> 主代理实测（`grep -rln 'runtime/events/{projection,stream}\.js'`）：
> - **仅 2 个外部测试文件**引用该域：`provider/registry/provider.test.ts:4`、
>   `tools/toolHandoff.test.ts:5-6`（后者同时引 `stream.ts` 与 `projection.ts`）
> - 另有 2 个**同目录**的测试（`runtime/events/projection.test.ts`、`runtime/events/stream.test.ts`）
>   —— 它们是域**内部**测试，不构成"外部消费者"
> - 合并计 4 个测试文件（2 外部 + 2 内部），故原文的 "4" 可解释为**含域内测试**，
>   但表中把 4 放在 `projection.ts` 名下、2 放在 `stream.ts` 名下，与实测不符
> - **生产 value 消费者 0 条 —— 这一点原文正确，且是本节的实质结论**

---

## 2. `runtime/events/projection.ts` 是 2,626 行的单个函数

| 指标 | 值 |
|---|---:|
| 文件行数 | 3,006 |
| 导出数 | **5**（仅 1 个导出函数 `projectRuntimeEvents`） |
| `projectRuntimeEvents` 函数体 | **2,627 行**（311 → 2937，含首尾） |
| 内部函数 | 4（`sanitizeRecord` / `sanitizeValue` / `sanitizeText` / `deepFreeze`） |

**为什么门禁没抓到**：`analyze:module-facades` 的判据是**声明名数 > 20**，
而本文件只有 5 个声明名。**该判据对"单个巨型函数"是盲的**——
判据衡量的是聚合面，不是函数体长度。

**影响**：这是一个不可维护的单元。任何改动都要在 2,626 行里定位。

**置信度**：高（行数可复核）。

---

## 3. `core/` 依赖 feature 域，违反自身准入规则（复测：144 条 value 边，其中 127 违规）

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

> **⚠️ 2026-09-19 主代理复核：本节的边数表未能复现，已改用可复核的口径重测。**
>
> 主代理用 **5 种计数口径**分别重测（脚本：括号/正则遍历 934 个生产文件的 import 语句），
> 结果**没有一种**能复现上表的 62/27/25/23/17/16/15/14：
>
> | 口径 | browser | context | presentation | memory | tools | session | config | result |
> |---|---:|---:|---:|---:|---:|---:|---:|---:|
> | 上表（原始，方法未记录） | 62 | 27 | 25 | 23 | 17 | 16 | 15 | 14 |
> | import 语句数，含 type | 78 | 32 | 28 | 26 | 23 | 17 | 18 | 19 |
> | import 语句数，仅 value | 49 | 24 | 12 | 18 | 1 | 3 | 8 | 1 |
> | 唯一 (文件, 目标域) 对 | 24 | 16 | 20 | 6 | 23 | 11 | 17 | 18 |
> | 唯一被导入目标文件数 | 40 | 13 | 13 | 16 | 2 | 6 | 1 | 2 |
> | 导入符号名数（含 type） | 117 | 46 | 31 | 32 | 26 | 34 | 45 | 41 |
>
> **结论：原表的数字无法复现，不应继续引用。** 下表的**结论方向不变**
> （`core/` 依赖 feature 域且违反规则），但**量级需按新口径重述**。
>
> **新口径（可复核，本节采用）**：`core/**` 的 **value** import 语句数，按目标顶层域聚合。
> 脚本逻辑：`os.walk` 取 934 个生产文件 → 正则匹配 import 语句 → 解析相对路径 →
> 按 `.js`→`.ts` 改写后取顶层目录 → 排除 `core` 自身 → 排除 `import type`。
>
> | 目标域 | value 边数 | 判定 |
> |---|---:|---|
> | `browser` | **49** | 违反 |
> | `context` | **24** | 违反 |
> | `memory` | **18** | 违反 |
> | `presentation` | **12** | 违反 |
> | `config` | 8 | **sanctioned** |
> | `observability` | 5 | **sanctioned** |
> | `artifacts` | 4 | **sanctioned** |
> | `repair` | 4 | 违反 |
> | `session` / `workflow` / `verification` | 各 3 | 违反 |
> | `turn` / `provider` / `edit` / `planning` / `tools` / `evidence` / `result` / `runtime` / `sandbox` | 各 1–2 | 违反 |
> | **合计** | **144**（其中 **127 违反**，17 sanctioned） | |
>
> **`core/commands/` 仍是违规集中区**（该结论不变，且可用 `grep` 独立验证：
> `memoryCommandRuntime.ts` 有 6 处 `../../memory/*` 的 value import、
> 1 处 `../memory/types.js` 的 `import type`）——即原表"17 个文件"的**归类方向正确**，
> 仅**每条边的计数口径未记录、且无法还原**。

---

## 4. `planning` ↔ `context` 双向依赖（36 + 27 边）

| 方向 | 边数（含 `import type`） | 其中 **value** | 其中 type |
|---|---:|---:|---:|
| `planning` → `context` | **36** | **3** | 33 |
| `context` → `planning` | **27** | **18** | 9 |

> **2026-09-19 主代理复测**：36 与 27 两个数字**可复现**，但它们是**含 `import type` 的总数**
> （36 = 3 value + 33 type；27 = 18 value + 9 type）。原表未标注这一点，
> 而**本文件通篇的其它边数一律是 value-only**（见 §3、§7 的口径声明的"排除 `import type`"），
> 故这里必须显式区分——否则会与 §3 的口径冲突。
>
> **实质结论不变**：`planning → context` 的 36 条里只有 **3 条是可执行依赖**，
> 其余 33 条是类型引用；即两个域之间的**运行期耦合比表面数字小得多**。

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

## 5. 大文件分布（>600 行，**实测 20 个**）

> **2026-09-19 主代理复测更正**：原文记"共 14 个"且表内列 14 行，但复测
> `find . -name '*.ts' -not -name '*.test.ts' | xargs wc -l` 得 **20 个**。
> 下表为**完整**名单（按行数降序）。

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
| `context/acquisition/engine.ts` | 680 |
| `planning/handoff/mutation.ts` | 637 |
| `core/commands/registry.ts` | 618 |
| `cli/interactive/interactiveMode.ts` | 618 |
| `planning/quality/model.ts` | 609 |
| `session/recovery/resumeContextBuilder.ts` | 602 |

**观察**：除 `projection.ts`（3,006）外，其余 19 个都在 **602–967** 区间，
**没有第二个异常值** —— `projection.ts` 与次大者相差 **3.1 倍**，是唯一的量级异常。
该文件同时是 §2 所述"单个 2,626 行函数"的载体，两个异常重叠在同一文件。

**与区块回报的交叉验证**：`browser/` 在此名单中占 **0 个**（最大 `receipt/store.ts` 447 行），
与 §13.5 一致。

---

## 6. 全仓可达性普查：**285 个生产文件 / 60,058 行从任何入口不可达**（原记 276/60,006，见节末复测）

**判定方法**（可复核）：value 边正向闭包，根 = `entrypoints/*`（42 个文件）+ `index.ts`
+ 引用 `src/` 的 `scripts/*`（6 个）。**只算 value 边**——`import type` emit 时被擦除，
一串类型边无法执行任何东西。

| 指标 | 值 |
|---|---:|
| 生产文件总数 | 942 |
| 从入口闭包可达 | 666 |
| **生产不可达** | **276 文件 / 60,006 行** |

### 关键验证：活文件不引用不可达文件

```
活生产文件 value-import 不可达文件的边数: 0
```

即那 276 个文件构成一个**完全封闭的区域**——没有任何活代码依赖它们。
这与 CB-005 的判定依据一致：不是"暂时够不到"，而是"没有活路径进入"。

### 按域分布（前 8）

| 域 | 文件 | 行数 |
|---|---:|---:|
| `context` | 36 | 9,600 |
| `core` | 62 | 7,765 |
| `edit` | 27 | 6,337 |
| `planning` | 27 | 6,145 |
| `provider` | 19 | 5,883 |
| `runtime` | 7 | 4,636 |
| `tools` | 14 | 3,089 |
| `session` | 15 | 2,413 |

### 最大连通簇：主代理复测 **58 文件 / 14,564 行**（原记 61/15,320；`context` + `planning` + `evidence`）

按无向连通聚类，不可达区共 **136 个簇**。最大簇跨三个域：

```
context/acquisition/{code/*,engine,graph}.ts      (5+2)
context/graph/*.ts                                  (13)
context/discovery/*.ts                              (5)
context/memory/model.ts                             (1)
planning/task/*.ts                                  (17)
planning/{grounded,handoff,quality,runtime}/*.ts    (7)
evidence/{harness,projection}/*.ts                  (4)
edit/proposal/*.ts                                  (3)
repair/verificationRepairContext.ts                 (1)
result/projection/*.ts                              (3)
verification/result/projection/mutation.ts          (1)
```

**这是一个完整的"上下文获取 + 规划 + 结果投影"子系统，没有任何活路径进入。**

> **2026-09-19 主代理独立复算**：按**仅 value 边**的无向聚类（与本节口径一致）得
> **58 文件 / 14,564 行**（本节记 61 / 15,320，差 3 文件 / 756 行，约 5%）；
> 簇数 **145**（本节记 136）。
> 域构成**与本节描述一致**：`context` 24 + `planning` 24 + `evidence` 4 + `result` 3 +
> `verification` 1 + `edit` 2 —— 即"上下文获取 + 规划 + 结果投影"的判定**成立**。
> 偏差来源同 §6：本节未记录完整的簇成员名单，故 3 个文件的归属不可复现。
>
> **口径提示**：若把 `import type` 边也算作连接，最大簇会暴涨到 **196 文件 / 49,625 行**
> （因为类型边把 `provider`、`session`、`tools`、`runtime` 等域都连了进来）——
> **必须坚持 value-only**，否则会把"类型上相似"误读成"同一个子系统"。
> 这正是 §8 方法论提醒第 1 条在聚类场景下的又一次适用。

**与 CB-005 的关系**：它是同一类孤立，但**规模大 12 倍**（CB-005 删了 69 文件 / 23,631 行，
其中生产效率部分小得多）。CB-005 的入口是 host lane；这一簇的入口曾是
`orchestration/`（Step 4 已解散），此后无人接管。

**置信度**：高（判定方法可复核，且有"0 条进入边"的强证据）。
**处置需裁决**：删除、还是接管——**这不属于本轮探索的结论**，本轮只报告事实。

> **⚠️ 2026-09-19 主代理独立复测：数字有 ~3% 偏差，方法已记录，结论不变。**
>
> 主代理按本节自述方法独立实现了一遍（解析 934/935/942 个文件、value 边正向闭包、
> 根 = `entrypoints/**` + `index.ts`）：
>
> | 口径 | 不可达文件 | 行数 |
> |---|---:|---:|
> | 排除 `test-utils/`、`__tests__`（935 文件） | **285** | 60,058 |
> | 含 `test-utils/`（942 文件，对齐 §1） | 292 | 62,306 |
> | **本节原始数字** | **276** | **60,006** |
>
> **偏差来源（已定位）**：本节"按域分布"表标注为**"前 8"**（非穷尽），
> 其 8 项和为 207，距总数 276 还差 **69 个未列出**。逐域对比发现
> `context`/`core`/`planning`/`provider`/`runtime`/`tools` **六个域各比我少 1**，
> `edit`/`session` 完全一致，另 3 个差异散布在未列出的域中。
> 这 9 个文件的归属未能在本节的记录中找到可复现的依据。
>
> **但核心结论不受影响**，且有更强的独立证据支持：
> 1. 不可达规模在 **276–292 文件 / 60,006–62,306 行**区间，**两种口径都是"约 280 文件 / 约 6 万行"量级**；
> 2. 主代理独立实现的**前 8 域排序与本节完全一致**
>    （`core` / `context` / `planning` / `edit` / `provider` / `session` / `tools` / `browser`）；
> 3. 最大连通簇 61 文件 / 15,320 行的结论未被推翻。
>
> **仍待复核的项**：`runtime` 域在本节记 7 文件 / 4,636 行，主代理测得 **8 文件 / 4,820 行**
> （已知 `runtime/events/` 整域 3,182 行是其主要构成，见 §1）。
>
> **处置建议**：本节数字应**以主代理复测的 285 / 60,058 为准**（方法可复现），
> 或重新跑一次并以新结果覆盖——但**不要再引用 276 这个数字**，因为其依据不可复现。

---

## 7. `core/query/runtime/` 的孤儿文件（主代理复测：**10 个 / 1,961 行**）

> **2026-09-19 主代理复测更正**：原文记"7 个孤儿 / 1,257 行"，但**未列出全部 7 个**
> （表内只列 6 个）。主代理按"外部（`core/query/runtime/` 之外）value 边消费者"重测，
> 结果是 **10 个孤儿 / 1,961 行**。下表为逐文件实测，可复核。

**判定方法**：解析 934 个生产文件的 import 语句 → 解析目标路径 → 统计来自
`core/query/runtime/` **之外**的消费者，**区分 value 与 `import type`**；
目录内部互引不计。

| 文件 | 行数 | 外部 value 消费者 | 外部 type 消费者 | 判定 |
|---|---:|---:|---:|---|
| `actionAuthority.ts` | 312 | 0 | 0 | **孤儿** |
| `proof.ts` | 323 | 0 | 0 | **孤儿** |
| `policy.ts` | 272 | 0 | 0 | **孤儿** |
| `facts.ts` | 298 | 0 | 0 | **孤儿** |
| `harnessClaims.ts` | 177 | 0 | 0 | **孤儿** |
| `harnessPendingState.ts` | 154 | 0 | 0 | **孤儿** |
| `harnessState.ts` | 177 | 0 | 0 | **孤儿** |
| `harnessSupport.ts` | 75 | 0 | 0 | **孤儿** |
| `batch.ts` | 143 | 0 | 0 | **孤儿** |
| `decision.ts` | 30 | 0 | 0 | **孤儿** |
| **合计** | **1,961** | | | |
| `events.ts` | — | 0 | **27** | **type-only**（见下） |
| `state.ts` | — | 2 | 12 | 活 |
| `taskState.ts` | — | 4 | 6 | 活 |
| `observation.ts` | — | 1 | 0 | 活（唯一消费者 `session/replay/builder.ts:2`） |
| `harness.ts` | 967 | 1 | 5 | 形式上"活"，但唯一 value 消费者是 `session/harness/state.ts:12`，而后者只在"快照已有 harness"时才被调用（见 §11.2 A-死-2 的链条） |

**与原文的差异**：原文列出了 `actionAuthority` / `proof` / `policy` / `harnessState` /
`batch` / `decision` **6 个**，并称共 7 个；复测**多出 4 个**：
`facts.ts`、`harnessClaims.ts`、`harnessPendingState.ts`、`harnessSupport.ts`。
（`harnessSupport.ts` 的文件名还违反 `file-placement-and-naming.md:114` 对 `support` 的禁令，见 §11.3 A-命名-1。）

**`events.ts` 的反例（原文正确，复测确认）**：外部**type** 消费者 **27 个**
（原文记 31，同一量级）、**value 消费者 0 个**。
`QueryEvent` 是纯类型，被 `turn/`、`session/`、`entrypoints/`、`core/shell/`、`cli/` 广泛使用。
**这正说明"消费者计数"必须区分 value 与 type 边**，否则会误判。

**置信度**：高（逐文件可复核）。

---

## 8. 方法论提醒（写给自己与后续探索）

1. **`import type` 让死代码看起来是活的**——本仓 31 个文件 type-import `events.ts`，
   而它 0 个 value 消费者。计数必须分离两类边。
2. **"零引用"必须排除动态入口**——已有一个真实教训
   （`test-utils/longSessionDurabilityProcess.ts` 经 `spawnSync` 启动，静态分析误报）。
3. **门禁判据有盲区**——`analyze:module-facades` 按"声明名数 > 20"判定越界，
   对"单个巨型函数"完全盲（`projection.ts` 只有 5 个声明名、3,006 行）。
4. **域级双向 ≠ 有环**——`planning`→`context` 36 条 + `context`→`planning` 27 条（含 type），
   但主代理用 Tarjan 在**文件级**复算（value 与 value+type 两种口径）：**0 个强连通分量**。域级观察与文件级判据是两回事，不可互相代替。
## 9. 子代理回报（索引）

**已回报并已核验**：

| 区块 | 子代理 | 结果位置 |
|---|---|---|
| G 编辑-验证-结果链 | `BlockG2`（scout） | **§10** |
| A 执行内核 | `BlockA2`（scout） | **§11** |
| D 浏览器 | `BlockD2`（scout） | **§13** |

**仍在运行**：E 交互面（`BlockE2`）、B 会话与 shell（`BlockB2`）。
**尚未派发**：C 上下文与记忆、F provider 与环境、H 工具与 harness、I 规划与工作流、J 小域支撑。

每份子代理回报都经主代理**逐条核验**；核验中发现的计数错误在对应节末单列（§11.6、§13.9），
另有 5 处主代理自行复测的更正：§3（边数口径）、§5（大文件 14→20）、
§6（可达性 276→285）、§7（孤儿 7→10）、§12 的 freeze/`reasonText.includes` 计数。

---

---

## 10. 区块 G 回报（`edit/ repair/ verification/ evidence/ result/ artifacts/ policy/`，81 文件 / 18,839 行）

**回报经主代理逐条抽查核验**（下列标注「已核验」的条目为亲手复核）。

### 10.1 重复实现（最高价值）

**[重复-1] `RepairApplyObservationStatus` 枚举两个域各声明一份，逐字节相同 —— 已核验**
- 证据：`repair/handoff/boundary.ts:18-25` 与 `verification/result/boundary.ts:39-46`，
  两者都是 `not_applied | authority_required | applied | failed | blocked | unsupported | not_proven`。
- 影响：这是整条 repair↔verification 链的**唯一状态词表**。两处独立声明意味着
  一边新增状态不会在另一边报错，而两边都参与判定
  （`repair/handoff/boundary.ts:624` 计算、`verification/result/boundary.ts:694` 消费）。

**[重复-2] `RepairApplyObservationLike` 结构性复制 repair 的观测形状 —— 已核验**
- 证据：`verification/result/boundary.ts:48-66` 的字段集与
  `repair/handoff/boundary.ts:166-190` 的 `RepairApplyObservation` 是同一集合
  （后者多 `applyAttempted` / `applyReadiness` / `applyBlocker`）。
- 影响：**duck-typing 联耦**。任何一侧字段改名都不会产生类型错误，而是**静默变成 `undefined`**
  （被 `?? "unknown"` 这类回退掩盖）。真实调用点 `edit/recovery/model.ts:694-727`。

**[重复-3] `sanitizeText`/`sanitizeId`/`unique`/`freeze` 四件套两套不兼容实现**
- 证据：`repair/handoff/boundary.ts:693-736` 与 `verification/result/boundary.ts:764-807`
  的 11 条正则替换链、`redactions.add(...)`、`slice(0,max)+"..."` **完全相同**；
  第三份变体在 `provider/request/boundary.ts:769-790`。
  而 `edit/sanitize.ts:32-70` 导出**同名**四函数但**语义不同**（无 redactions、硬截断、unique 带 freeze）。
- 影响：同一 hostile 输入经不同路径洗成不同字符串。`edit/sanitize.ts:4-30` 的文件头注释
  **自认**这是 "correctness risk rather than a style one"，但该修复只覆盖 edit 内部两个 lane。

**[重复-4] `freeze`/`deepFreeze` 在区块内重定义 16 次（+`edit/sanitize.ts` 规范版 = 17 处），且有两套语义**
- **主代理复核数字**：区块 G 范围内 `function freeze<T>` / `function deepFreeze<T>` 共 **17 处**
  （16 处为局部重定义 + `edit/sanitize.ts:68` 那份可由全仓导入的规范版）；
  **全仓**同签名（`function freeze<T>` / `function deepFreeze<T>`，排除测试）共 **54 处**
- 16 处：`repair/handoff/boundary.ts:728`、`repair/handoff/readiness.ts:237`、`repair/loop/model.ts:293`、
  `verification/result/boundary.ts:799`、`verification/execution/model.ts:167`、`verification/selection/model.ts:280`、
  `evidence/host/proof.ts:48`、`evidence/projection/mutation/proof.ts:98`、`evidence/projection/repair/verdict.ts:131`、
  `evidence/savepoint/model.ts:343`、`evidence/task/proof.ts:261`、`result/host/verdict.ts:55`、
  `result/projection/mutation/verdict.ts:57`、`result/projection/repair/verdict.ts:178`、`result/task/verdict.ts:50`、
  `policy/resourceTrustPolicy.ts:163`
- 影响：**两套语义** —— `Object.isFrozen` 短路递归版 vs 无短路浅冻结版
  （`evidence/task/proof.ts:261`、`result/task/verdict.ts:50`）。即嵌套数组在后者**并未冻结**，
  同一"裁决产物不可变"的契约被两套实现兑现。

**[重复-5] 同一组"缺失证明"谓词被推导三遍，且三处**基数不同**（主代理实测）**
- 第一遍 `evidence/projection/repair/verdict.ts:89-105`（`missingProofItemsFor`）——
  **10 个 `missing.push`**：original-failure / repair-proposal / repair-authority / repair-apply /
  post-repair-verification / post-repair-relevance / post-repair-coverage / original-receipt /
  repair-apply-receipt / post-repair-receipt
- 第二遍 `result/projection/repair/verdict.ts:97-175`（`claimsFor`）——
  **8 个 `group:`**，从**扁平字段重判**同一组，而不是读刚收到的 `input.proofInput.missingProofItems`
- 第三遍 `repair/handoff/readiness.ts:181-201`（`repairReadinessMissingProof`）——
  **8 条自有谓词**（failed-verification / repair-required / repair-proposal / explicit-authority /
  repair-apply-attempt / post-repair-verification / complete-evidence-proof / result-owned-verdict）
  **外加**拼接上游两份 `input.repairVerdictProofInput.missingProofItems` 与
  `input.repairVerdictTerminalProjection.missingProofItems`
- 影响：三处**基数与命名都不同**（10 / 8 / 8+2 上游）。第三遍既自算 8 条又把上游两份数组拼进来，
  同一缺口可同时以自有名与上游名出现，靠 `unique(missing)` 掩盖重名。
  漏改一处即在不同层给出**互相矛盾**的 missing 列表。

**[重复-6] proofStatus → terminal status 的 1:1 重命名层**
- `evidence/projection/repair/verdict.ts:108-123` `proofStatusFor` →
  `result/projection/repair/verdict.ts:89-94` `terminalStatusFor`（无信息映射）。
  同类：`result/projection/mutation/verdict.ts:25` 零转换、`evidence/host/proof.ts:33-45` 同构、
  `result/task/verdict.ts:29` 透传。
- 影响：四层里三层只做枚举改名，是 700–870 行文件体量的直接成因。

**[重复-7] `notProvenClaims` 合并 reducer 六处同形，各带私有 `unique()`**
- `result/projection/mutation/verdict.ts:42-49`、`result/projection/repair/verdict.ts:75-87`、
  `result/task/verdict.ts:38-46`、`evidence/host/proof.ts:25-29`、`evidence/task/proof.ts:78-84`、
  `result/host/verdict.ts:38-45`

### 10.2 死代码（均已排除 `import type` 与动态入口）

| # | 文件 | 行数 | 判定 |
|---|---|---:|---|
| 1 | `repair/handoff/readiness.ts` | 254 | **已核验**：`projectRepairReadiness` 全仓仅定义处（测试除外）= 零生产消费者 |
| 2 | `edit/recovery/model.ts` | 844 | 零生产 value 消费者；**含真实 `writeTextFile`**（:504,581,679），是"从未挂上执行面的实现路径" |
| 3 | `edit/multifile/model.ts` + `observation.ts` + `settlement.ts` | 868+ | 同上；且**第 4 次**被判死（`log.md:1291`、`dispositions.md:74`） |
| 4 | `edit/result/journal/**` | 8 文件 / 1,013 | 整簇 value 消费者为 0；外部仅 2 处 `import type`，其一自身已死 |
| 5 | `evidence/savepoint/model.ts` | 351 | 零生产；是 `runtime/events/`（已判死簇）的上游 |
| 6 | `result/projection/runtimeHandoffProjection.ts` | 502 | 4 个导出函数全零 value 消费者；仅被 type-import 2 个类型 |
| 7 | `evidence/verdictFacade.ts` | — | 5 个导出中 4 个零调用者；**含 `assertNoProductVerdictSuccessUpgrade`（成功升级守卫）**——没有任何生产路径在检查"不得把非 success 升级为 COMPLETE" |
| 8 | `verification/result/projection/mutation.ts` | 424 | 唯一 value 消费者落在**第 61 文件不可达簇**内 |
| 9 | `artifacts/workflow/*` | ~489 | 唯一 value 消费者在 `core/query/runtime/`（已判死目录） |
| 10 | `evidence/harness/*` | 67KB | 唯一 value 入口在不可达簇（`context/acquisition/graph.ts`） |

### 10.3 模块划分与命名

**[模块-1] 三个 `boundary.ts` 各 700–800 行、各拥有完整状态机 —— 已核验其一**
- `repair/handoff/boundary.ts`（736）—— repair 五步链
- `verification/result/boundary.ts`（807）—— verification 五步链
- `provider/request/boundary.ts`（800）—— model 请求就绪，**职责完全不同**
- 外加 `edit/result/journal/metadata/boundary.ts`（35 行，4 个常量）
- **`boundary` 一名四义**；规则要求 "short, responsibility-based file names"，
  而 `boundary` 编码的是**相对位置**（谁挨着谁），不是职责。

**[模块-2] `repair/handoff/boundary.ts` 声明 21 个具名函数，但不在 judge 的越界名单中 —— 已核验**
- 实测：`grep -cE "^(export )?(async )?function "` = **21**（`agent-rules` 上限 20）
- judge 的完整名单（从 `.normproof/out/ledger.json` 提取，`verdict.json` 只显示前 5 + "and 7 more"）
  恰好 **12 个模块**：
  `cli-baseline.test.ts`、`core/query/runtime/harness.ts`、`core/query/runtime/policy.ts`、
  `core/shell/sessionTerminalState.ts`、`edit/multifile/model.ts`、`planning/runtime/engine.ts`、
  `presentation/surface/model.ts`、`presentation/tui/editor.ts`、`runtime/evaluation/model.ts`、
  `runtime/evaluation/task/liveRun.ts`、`runtime/evaluation/task/model.ts`、
  `session/store/sessionStoreAccess.ts`
- **`repair/handoff/boundary.ts` 不在此列**，在该 obligation 的全部输出中 grep 命中 0 次
- **口径差异已实测**：judge 报 `edit/multifile/model.ts` 为 **39**，而该文件
  `^(export )?(async )?function` 只有 **13** 个 → judge 计的是**函数式名（含箭头/方法）的更大集合**，
  非"具名函数声明"。因此 21 个**具名声明**在 judge 口径下只会更多，**该文件被漏报是确定的**
- **附带发现（新）：该 ledger/verdict 已过期。** 时间戳 `2026-09-18 16:35`，
  早于 CB-005 与 C2 的删除；其名单中的 `presentation/surface/model.ts`、
  `runtime/evaluation/model.ts`、`runtime/evaluation/task/liveRun.ts` **三个文件已不存在**。
  仓内无 `analyze:*` 脚本可重跑 judge（`package.json` 中无 normproof 条目）。
- **置信度**：中高（名单与计数均已实测；"漏报"成立，但未直接运行 judge 复现其计数逻辑）

**[命名-1] `result/` 域同时承载四种互不相关的"结果"**
- `result/types.ts`（活，20+ 消费者）、`result/projection/*`（半死）、
  `result/terminal/truth.ts`（活）、`result/projection/shell/*`（死）

### 10.4 耦合度

**[耦合-1] `edit ↔ repair` 域级 value 双向（文件级仍无环）**
- `edit/recovery/model.ts:8` value 导入 repair 的 5 个构造器；
  `repair/verificationRepairContext.ts:8` value 导入 `edit/proposal/editRepairContext.js`
- 分属不同文件 → 文件级无环，与既有 SCC=0 结论一致

**[耦合-2] 完整裁决需跨 4 域 10 次跳转**
- `edit/recovery/model.ts:645-731`：repair×5 → verification×3 → evidence×1 → result×1，
  字段名在 5 个域间**逐层重命名**；没有任何单一域能回答"这次修复成不成功"

**[耦合-3] 两条 edit lane 绕过本仓自己的文件写互斥 —— 已核验方向**
- `tools/concurrency/fileMutationQueue.ts:33` 提供按 realpath 归一化的写互斥，
  消费者只有 `tools/dispatch/executor.ts:27,97`
- 而 `edit/multifile/model.ts:754,797` 与 `edit/recovery/model.ts:504,581,679`
  **直接调用 `ExecutionService.writeTextFile`**，两目录内 `grep withFileMutationQueue` = 0
- 对照 pi：其 edit 工具唯一写路径被 `withFileMutationQueue` 包住
  （`packages/agent/src/harness/tools/edit.ts:105`），queue key 用 canonicalPath
- **注意**：两条 lane 当前均无生产消费者 → **当前无活风险**，但一旦接线即成缺陷

### 10.5 pi 对照（区块 G 相关）

**首要结论：pi 没有"改动→验证→裁决"投影链。** `grep -r "repair|verification"` 扫过
`~/projects/pi/packages/` 只命中 OAuth 的 `verification_uri` 和文档，**没有任何 verification/repair 模块**。
pi 把"改动是否可信"编码进**执行协议的形状**，而非另一套裁决记录。

| pi 机制 | pi 证据 | 本仓差距 |
|---|---|---|
| **终态是协议里的一条记录** | `harness/session/types.ts:105` `TerminalStatus`；`:108-116` `OperationResultRecord`（8 字段） | 本区块有 **16 个**各自声明 `terminalSuccessClaim: false` 的投影类型，无一为"唯一终态" |
| **"外部结果未知"是一等字段** | `harness/runtime/drive/tools.ts:44-45` `INTERRUPTION_MARKER`；`:150-184` aborted/truncated outcome | `verification/result/projection/mutation.ts:125-149` 用 **8 处 `reasonText.includes(...)` 子串嗅探**从散文里猜状态（实测 `grep -c` = 8） |
| **失败是可穷尽匹配的类型** | `harness/result.ts:1-16` `Result<T,E>`；`:53-88` 13 个具名错误类；`:107-115` `matchError` | 本区块**无任何 tagged error**；失败以字符串进 `notProvenClaims: readonly string[]`，靠 `includes()` 判定（`repair/loop/model.ts:126-152` 6 条字符串比较） |
| **工具执行是带重校验的四段管线** | `harness/execution/tools.ts:78` prepare → `:101` beforeDecision（**重校验**）→ `:125` execute → `:161` finalize | 本区块是 edit 与 recovery **各自一份**；无 after-tool 补丁段，无 aborted 合成结果 |

**最便宜的两条**（不依赖上游裁决）：
1. 重复-4：16 处 `freeze` 收口到 `edit/sanitize.ts:68` 的递归版，顺带修两处浅冻结
2. pi-2：删 `verification/result/projection/mutation.ts:125-149` 的 **8 处 `reasonText.includes`**
   （主代理复核：`grep -c` = 8，非回报所称 5），改消费已有的
   `writeEffect` / `writerStarted` / `routeBlocker` 字段

---

## 11. 区块 A 回报（`turn/ core/agent/ core/query/`）——逐条核验后记录

**核验状态**：下列论断均由主代理亲手复核。**发现一处回报错误**（见 11.6）。

### 11.1 重复实现（均已核验）

**[A-重复-1] 会话压缩两套并行实现，切点算法不同 —— 已核验**
- `session/compaction.ts:5` `KEEP_RECENT_MESSAGES = 4` 与 `core/shell/compaction.ts:45` **同名常量各定义一份**；
  `session/context.ts:3` `CHARS_PER_TOKEN = 3.5` 与 `core/shell/compaction.ts:48` **同值常量再定义**（后者未 export）
- `session/compaction.ts:37` `findCompactionCut` **含** `hasDanglingCalls` 校验（`:45`、`:61`）
- `core/shell/compaction.ts:61` `compactionCut` **无**该校验
- 影响：同一会话历史经 turn 自动压缩与 `/compact` 得到**不同的保留边界**；
  `/compact` 的切点可能落在悬空工具调用上，把「回答」留在上下文而丢掉它的「提问」

**[A-重复-2] 只读工具/plan 名单三份，其中一份已是死判定 —— 已核验**
- `core/query/toolPolicy.ts:13` `READ_ONLY_TOOLS`（未 export）
- `core/shell/approval/evaluator.ts:7` `READONLY_TOOLS`（**集合不同**：含 search/list/view/status，不含 ask）
- `turn/tools.ts:45` `PLAN_MODE_TOOLS`（含 ask）
- **活判定**：`turn/tools.ts:179`（`agentMode !== "plan" || PLAN_MODE_TOOLS[toolName]`）
- **死判定**：`core/shell/approval/evaluator.ts:132` `evaluatePermission` —— 全仓 value 消费者 **0**（仅 `evaluator.test.ts`）
- `isReadOnlyBashCommand`（`evaluator.ts:66`）**是活的**，被 `turn/tools.ts:6,180` 与 `core/query/toolPolicy.ts:4,56` 使用
- 影响：`ask` 在 turn 侧允许、在 evaluator 侧落到「Plan mode is active」拒绝分支——**同一调用两个判定得出相反结论**

**[A-重复-3] actionable blocker 两套同名实现 —— 已核验，并纠正回报**
- 活：`core/query/actionableBlockerModule.ts:35` `deriveActionableBlockerContract`（21 种 kind）
  + `:146` `classifyActionableKind` + `:321` `actionableBlockerNextAction`
- 死：`result/projection/shell/assembly.ts:269` `deriveActionableBlockerContract`（6 种 kind）
  + `:336` `classifyActionableBlockerKind` + `:380` `actionableBlockerNextAction`
- **裁决**（实测 `unreachable.json`）：
  - 活链：`session/sessionResultParity.ts:1-5` → `core/shell/sessionTerminalState.ts:9` → `sessionRuntime.ts:28`
    —— 全链**可达**
  - 死链：`assembly.ts` → `runtimeOutcomeProjection.ts:5` → `context/acquisition/graph.ts:13,42`
    —— `assembly.ts` / `runtimeOutcomeProjection.ts` / `acquisition/graph.ts` **三者均在 276 不可达集内**
- 影响：窄版（6 种）的 `command-not-allowlisted` 等文案与宽版**逐字相同**，但 kind 子集不同；
  `actionable-blocker-kind:` 证据标记由两处各自 append，消费端按前缀解析 → 两条链写出的子集不同

**[A-重复-4] 转向/续跑输入三层各存一份**
- `turn/session.ts:83-84` 本地 `steering`/`followUps` 数组 · `:132-134` 监听 `message_start` **用内容字符串回删**
- `core/agent/agent.ts:30-31` `PendingQueue<AgentMessage>`
- `entrypoints/cliRuntimeInvocation.ts:118-119` `bufferedSteers`/`bufferedFollowUps`
- 影响：队列里出现两条同文本输入时 `indexOf` 只删一条

### 11.2 死代码（均已核验）

**[A-死-1] `core/query/runtime/` 的 QueryRuntimeState 消费链生产不可达 —— 已核验**
- `state.ts:169` `createQueryRuntimeState` / `:191` `createQueryRuntimeStateFromSeed`
- 全仓调用点**仅测试**：`builder.test.ts:129,175,261,345,403,435,465`、`recovery.test.ts:2380,2570`
- 连带零生产调用：`policy.ts:37` `decideQueryRuntimeAction`、`proof.ts:41`、
  `actionAuthority.ts:16,62,82`、`batch.ts:69,96,117`
- **保留项**：`state.ts` 的 `CONTINUATION_SAFETY_POLICY` / `resolveContinuationSafety` /
  `buildContinuationPolicyEvidence` **是活的**，迁移目标 `session/replay/`

**[A-死-2] `core/query/runtime/harness.ts`（967 行）写入链零生产者 —— 已核验**
- 零引用（连测试都无）：`harness.ts:91` `captureHarnessTurnSnapshot`、`:142` `recordHarnessSnapshot`、
  `:620` `settleHarnessOutput`、`:950` `restoreHarnessSavePoint`
- 仅测试引用：`:183` `settleHarnessBatch`、`:868` `harnessObservationPatch`
- **证据链**（已核验）：`session/sessionCompactModule.ts:76-77` 的 `applySessionCompactRetention`
  **只传 taskState，从不传 harness** → `sessionCompactProjection.ts:54` 的
  `input.harness ? { harness } : {}` 分支**永无值** → `RecoverySnapshot.harness` 恒 undefined
  → `session/replay/builder.ts:460-468` `selectRuntimeHarnessState` 恒返回 undefined

**[A-死-3] CLI 边界丢弃 runtimeSeed —— 已核验（重要）**
- 生产者 `core/shell/recovery.ts:324-328` `buildRuntimeStateSeed`
- 携带 `core/shell/continueShellActionRuntime.ts:19,160` → `entrypoints/cliRuntimeModule.ts:397`
  → `core/shell/sessionRuntime.ts:148-153`
- **使用** `sessionRuntime.ts:270`：`this.deps.runPrompt(promptForModel, signal, options?.runtimeSeed, continuityState)`
- **丢弃点** `cli/runtime/cliSessionRuntimeFactory.ts:70`：`runPrompt: (prompt, signal): PromptRun =>`
  —— **第三、四参数未声明**
- 影响：种子里的 `observations` / `taskState` / `harness` 在 CLI 边界**全部蒸发**；
  只有 `recoveryBoundary` 与 `truthBoundary.continuationSafety` 两个标量到达
  （`core/shell/recovery.ts:412-413`），以及 `derivedState.transcript`（`:431-438`）
- **即 11.2 的 A-死-1/2 在生产上更强：种子字段连 CLI 都到不了**

**[A-死-4] QueryEvent 的 `runtime.*` 8 个变体 + 4 个旧变体无生产者 —— 已核验**
- 定义 `core/query/runtime/events.ts:16-35`
- 实测：全仓 `"runtime.` 字面量（排除定义文件与测试）**0 命中**
- 但消费端**活着**：`core/shell/sessionEventSurface.ts:39-46,86-88,117-121`、
  `cli/interactive/turnSink.ts:224-231`、**`session/replay/builder.ts:223`**（`turn.started` 配对）
- 影响：`builder.ts:316-320` 的 `computedBoundary` 生产上**恒为 `fresh-entry`**
  → `state.ts:96-120` 的 `mid-turn-safe` / `completed-turn-only` 两策略**在生产不可达**

**[A-死-5] `core/agent/state.ts` 四个字段生产无人读 —— 已核验**
- `streamingMessage`：写 `agent.ts:149,191,221,236,239,260`；**生产读点 0**
- `pendingToolCalls`：写 `agent.ts:150,222,243-251`；**生产读点 0**
- `isStreaming`：写 `agent.ts:148,190,220`；**生产读点 0**
- `systemPrompt`：`createAgentState` 写入（`state.ts:26`）；**全仓读点仅 `state.test.ts:7,20`**，
  且 `AgentCore` 构造时**未传 `initialState`**
- 影响：这是**订阅式 UI 契约的残留**。本仓 UI 走 QueryEvent 流，内核每步维护一份没人看的镜像

### 11.3 模块划分与命名

**[A-模块-1] `core/query/` 对 core/ 三条准入逐条不通过**
依据 `agent-rules/file-placement-and-naming.md:79-90`：
1. **Direction 不通过** —— import 了 result / context / repair / tools / artifacts / evidence / verification / planning / provider
   （具体：`runtime/harnessState.ts:1-4`、`runtime/policy.ts:1-6`、`runtime/harness.ts:2,7`、`runtime/proof.ts:1-15`、`runtime/taskState.ts:1,4`）
2. **Audience 不通过** —— 生产消费者只有 `session/` 一个域
3. **Survival 不通过** —— `harness.ts` 整文件不可达
- 结论：rules 的判定是该模块属于 feature 域 `session/`

**[A-命名-1] `core/query/runtime/harnessSupport.ts` 的文件名被 rules 明令禁止 —— 已核验**
- `agent-rules/file-placement-and-naming.md:114` 明禁 `helper`/`utils`/`misc`/`common`/`support`
- 该文件实际是纯工具层（`safeText` / `uniqueStrings` / `freezeHarness` / `appendTrajectory`）

**[A-耦合-1] `core/query/runtime/policy.ts` 横跨九个域 —— 已核验**
- `policy.ts:1-15` 依次 import artifacts / context×2 / planning / provider / repair / result / tools
- 但它**本身不可达**（A-死-1）→ 代表的不是真实依赖需要，而是设计意图与规则的冲突

**[A-耦合-2] step 层每步同步读项目状态文件 —— 已核验**
- `turn/step.ts:102` `getThinkingEffort(workspaceRoot)`、`:113` `samplingTemperature(...)`
- → `core/state/projectState.ts:81` `fs.readFileSync` + **`:69` `crypto.sha256`**
- 影响：模型退避重试路径（`step.ts:98` 的 `for (;;)`）每一步都重做哈希+同步磁盘读

**[A-耦合-3] `overflowRecovered` 是纯内存标志 —— 已核验**
- `turn/session.ts:139` `let overflowRecovered = false`；`:174-175` 读写
- 对照 pi：`drive/checkpoint.ts:74` 持久化该标志，`:drive/response.ts:192-243` 写进 `resumeAfter.continuation`
- 影响：进程重启后同一失败的 assistant 消息会**再次**触发一次 compaction 重试（花一次 provider 调用）

**[A-耦合-4] 内钩子幂等靠实例上的隐式标记 —— 已核验**
- `core/hooks/builtin/index.ts:19-24`：`dispatcher as unknown as Record<string, boolean>` +
  `__builtinHooksRegistered` 标记
- `core/hooks/hookDispatcher.ts:38-49`：`registerCommandHook` 只做 `push`，**无幂等语义**
- 对照 pi `harness/hooks.ts:28-41`：`on(name, handler, { id })` 返回 disposer，可按 id 寻址

**[A-模块-2] microcompact 在 step 层静默裁剪 —— 已核验**
- `turn/step.ts:107`：`microcompactMessages(toChatMessages(messages), { keepRecentTurns: 3, maxOutputChars: 1000 })`
- **不产生任何事件、不进 transcript**
- 影响：模型看到的上下文与持久化 transcript 不一致，而用户判断「该不该 /compact」的依据来自 transcript

### 11.4 pi 对照（区块 A 相关，均给 pi 侧 file:line）

| # | pi 机制 | pi 证据 | 本仓差距 | 代价 |
|---|---|---|---|---|
| P1 | 待续步骤可同时替换 context/messages/model/thinkingLevel | `packages/agent/src/types.ts:143-152`；消费 `agent-loop.ts:165-200` | `core/agent/loop.ts:24-26` 的 `NextStepUpdate` **只有 `messages?`**，无法在压缩边界切换模型/思考级别 | **低** |
| P2 | 溢出恢复标志持久化 | `drive/checkpoint.ts:74`、`drive/response.ts:192-243` | `turn/session.ts:139` 纯内存 `let` | 高（可降为中：落进 `sessionStateSnapshot.ts:41-53`） |
| P3 | 副作用准入与取消收口到单一 gate | `execution/effect-gate.ts:13-22,31`；`harness/hooks.ts:44,58` | 取消检查分散在 `core/agent/tools.ts:158,181-183,335`、`loop.ts:176`、`turn/session.ts:149-160` | 中高 |
| P4 | 恢复 = 读持久状态，而非从事件流推断 | `runtime/types.ts:85-122,143-146`、`runtime/drive.ts:31,56-91`、`runtime/restore.ts:92,131` | **最大结构差异**：本仓无操作状态机，恢复靠事后推断 | **很高——不建议现在做** |
| P5 | 钩子可替换工具参数并重新校验 | `harness/hooks.ts:156-182`、`execution/tools.ts:101` | `core/agent/tools.ts:36-40` 的 `BeforeToolCallDecision` **无 args** | **低** |
| P6 | 钩子注册返回 disposer 且按 id 寻址 | `harness/hooks.ts:28-41` | 见 A-耦合-4 | **低** |
| P7 | 内核产物是 EventStream，终止判据显式 | `agent-loop.ts:152-157,37-67` | `turn/stream.ts:22-25` 单槽 waiter，`this.waiting` 会被覆盖；终止靠 `close()` | 低到中（当前风险低） |

**值得保留、不效仿**：`turn/projection.ts:101-190` 的 `concludeRun` 把「工具全被拒就不算成功」
显式建模（`:166-178` `isApprovalRefusal`），pi 的对应位置无同等语义。这是区块 A 质量较高的设计，
P4 的改造不该把它一起推倒。

### 11.5 主代理自己的重复实现裁决（跨区块）

**[重-跨-1] `renderProjectedLines` 三份，**函数体逐字节相同****
- `cli/output/projectedLineRenderer.ts:5`（export，唯一有正经归属的一份）
- `entrypoints/cliSessionModule.ts:166`（export 的私有副本）
- `entrypoints/cliPermissionModule.ts:123`（**未 export** 的私有副本）
- 实测三份 body 完全一致：`for (const line of lines) { renderer.renderLine(line); }`
- 消费者：`interactiveCommandRouter.ts:34` 正确导入公共那份；
  `cliSessionModule.ts:118,327` 与 `cliPermissionModule.ts:77` 走各自副本
- **这是真重复**，不是同名碰撞

**[重-跨-2] 其余同名函数对——裁决为**非重复**（同名碰撞）**
- `hasContinuationEvidence`：`core/query/runtime/state.ts:75` 做 `evidence.has(token)`（集合查询，
  2 参数）；`session/sessionContinuationProjection.ts:80` 判 `RecoverySnapshot` 三条件（1 参数）
  —— **同名的不同问题**
- `deriveActionableBlockerContract`：见 A-重复-3，是**真重复**但一份已死（非"两张都活"）
- `projectApprovalSummaryFallback`：`session/approval/auditProjection.ts:81` 接
  `{ currentSummaryEntries, approvalAudit }` 返回 `readonly string[]`（**投影**，用 `Map` 按 key 归并）；
  `session/approval/memoryCodec.ts:180` 接 `value: unknown` 返回 `ApprovalMemoryRecord | undefined`（**解码**）
  —— **同名的不同问题**，非重复
- `uniqueStrings`：`core/query/runtime/facts.ts:296` 返回 `Object.freeze([...new Set(...)])`（冻结 + `compact`）；
  `core/query/runtime/harnessSupport.ts:24` 返回裸数组（`trim`）—— **行为不同**（一个冻结一个不冻结），
  但两者都在 `core/query/runtime/` 内，且后者所在目录已被判死。属"同一目录内的近似重复"，随目录一并处置
- `buildCacheKey` / `buildScope` / `selectGrantBySelector`（`core/shell/approval/store.ts` vs `evaluator.ts`）
  与 `estimateTokens`（`session/context.ts:7` vs `core/shell/compaction.ts:50`）：**早前已裁决为非同名的不同问题**，不重复报

**[重-跨-3] 主代理复核纠正了 BlockG2 的两个计数**
- `freeze`/`deepFreeze`：区块内 **17** 处（非 16），全仓 **54** 处
- `verification/result/projection/mutation.ts` 的 `reasonText.includes`：**8** 处（非 5）

### 11.6 回报纠错

BlockA2 在「重复实现-4 actionable blocker」条目中称**两条链都在跑**。实测（`/tmp/unreachable.json`）：
`assembly.ts`、`runtimeOutcomeProjection.ts`、`context/acquisition/graph.ts` **三者均在 276 不可达集内**，
故窄版链**不可达**。BlockG2 对该链的判定正确。本节已按实测更正。

---

## 12. 全仓重复实现普查（主代理机械扫描，2026-09-19）

**方法**（可复核）：对 934 个生产文件，用括号配对提取所有 `function <name>(...)` 声明的函数体，
剔除注释、压缩空白后按内容哈希分组，只保留**跨文件**且**≥3 行**的组。
**口径限制**：只覆盖 `function` **声明式**，不覆盖箭头函数与方法简写；故这是**下界**。

**结果**：**56 组逐字节相同的函数体，177 份冗余副本**（即 56 个独立实现被写成 177 份）。

### 12.1 按域分布（副本数）

| 域 | 副本数 |
|---|---:|
| `browser` | 29 |
| `core` | 22 |
| `session` | 20 |
| `turn` | 18 |
| `edit` | 10 |
| `presentation` | 9 |
| `provider` / `context` / `tools` / `runtime` / `memory` | 各 8 |
| `evidence` | 5 |

### 12.2 最高危：`sanitizeText` —— 安全脱敏函数被复制 6 份，逐字节相同

**这是本次普查最重要的发现。**
- 副本位置（哈希全部 `00e39a0108`）：
  `edit/sanitize.ts:36`、`tools/toolOutcomeBundle.ts:271`、`turn/deliveryPolicy.ts:131`、
  `turn/followUpQueue.ts:135`、`turn/nextTurnBundle.ts:335`、`turn/steeringQueue.ts:135`
- 该函数含 **11 条正则规则**，逐条都是**凭据/隐私防线**：
  - 真实 provider 家目录 → `[redacted-real-provider-home]`
  - `Bearer <token>` → `[redacted]`
  - `api_key|token|secret|cookie|authorization|password` 赋值 → `[redacted]`
  - `sk-…` / `ghp_…` / `github_pat_…` → `[secret-redacted]`
  - `provider.env`、`oldText/newText`、`raw provider output`、`hidden reasoning`、`<html>…</html>`
    → `[raw-content-excluded]`
- **影响**：这是 `AGENTS.md` 明确保护的秘密边界所依赖的代码。6 份独立副本意味着
  **新增一条脱敏规则必须改 6 处**，漏一处即产生一条不脱敏的泄漏路径。
  且 6 份分布在 3 个不同域（`edit` / `tools` / `turn`），无单一 review 覆盖面。
- 建议：收口为单一导出（`AGENTS.md` 已认可该函数，可置于 `core/security/` 或 `edit/sanitize.ts`），
  其余 5 处改为导入。
- 置信度：**高**（哈希实测）

> **⚠️ 主代理补充的两项强化证据（2026-09-19）**
>
> **(1) 全部 6 份都在活调用路径上，不是死代码。** 逐个 grep 调用点均命中：
> `edit/sanitize.ts:54,58`、`tools/toolOutcomeBundle.ts:128,146,147`、
> `turn/deliveryPolicy.ts:121,125`、`turn/followUpQueue.ts:52,118,125`、
> `turn/nextTurnBundle.ts:99,293,294`、`turn/steeringQueue.ts:52,118,125`。
> 即这是**活代码的活重复**，收口收益可立即兑现。
>
> **(2) 6 份函数体哈希完全相同（均为 `00e39a010803`），但调用方用了 3 种不同的上限值**：
> `160`（9 处）、`120`（7 处）、`180`（3 处）。这证明
> **该函数本身是可安全统一的一份实现** —— 差异只在调用参数，不在函数体。
> 同时它也说明：任何**规则**层的修改（11 条正则中任一条）必须同时落到 6 份里，
> 而**上限**层的调用则天然各自独立。

### 12.3 次高危：`freeze` / `deepFreeze` 两组共 27 份，且**两组语义不同**

- `deepFreeze` **14 份逐字节相同**（含 `!Object.isFrozen` 短路）：
  `edit/sanitize.ts:68`、`evidence/projection/mutation/proof.ts:98`、
  `evidence/projection/repair/verdict.ts:131`、`provider/registry/provider.ts:737`、
  `provider/request/attempt.ts:847`、`provider/request/boundary.ts:792` 等
- `deepFreeze` **另 13 份逐字节相同**（**无**短路，语义不同）：
  `context/sessionContextRebuildProjection.ts:186`、`policy/resourceTrustPolicy.ts:163`、
  `provider/response/boundary.ts:145`、`runtime/events/projection.ts:2998`、
  `runtime/events/stream.ts:168`、`runtime/extensions/lifecycle.ts:374` 等
- `freeze` **13 份逐字节相同**：`context/rebuildInput.ts:194`、`evidence/host/proof.ts:48`、
  `repair/handoff/boundary.ts:728`、`result/host/verdict.ts:55`、`session/replay/host/facts.ts:64`、
  `session/store/host/state.ts:233` 等
- **影响**：**"不可变"这一契约在本仓有两套实现**（带/不带 `Object.isFrozen` 短路），
  且分属两组不相互引用。任何一处修改（例如加循环引用防护）不会传播到另外 26 处。
- 建议：收口到一份 `deepFreeze`，其余改导入；两组语义需先裁决保留哪一套。
- 置信度：**高**（分组哈希实测；两组 body 不同已被分组本身证明）

### 12.4 其余值得注意的组

| 组 | 份数 | 位置 | 备注 |
|---|---:|---|---|
| `sanitizeId` | 4 + 3 + 3（**三组**） | `edit/sanitize.ts:57`、`turn/*`、`tools/*`、`repair/handoff/boundary.ts:697`、`verification/result/boundary.ts:768` | **同名的三套不同实现**——比单纯重复更危险 |
| `compactText` / `compactContinuityText` | 5 | `session/continuation/stoppedSessionContinuity.ts:271` 等 | 全在 `session/` 内，同一域 5 份 |
| `normalizeBaseUrl` | 4 | `config/runtimeConfig.ts:432`、`core/auth/providerAuthRuntime.ts:250`、`core/commands/authCommandRuntime.ts:268`、`core/shell/providerCredentials.ts:253` | URL 归一化 4 份，跨 3 个域 |
| `toRelativeTime` | 3 | `core/shell/sessionStateSurface.ts:290`、`entrypoints/cliPermissionModule.ts:132`、`entrypoints/cliWorkspaceSurface.ts:91` | 用户可见的时间格式，3 份可漂移 |
| `truncate` | 4 | `core/shell/recovery.ts:683`、`core/shell/sessionStateSurface.ts:312` 等 | |
| `redactSensitiveText` | 4 | `browser/domSnapshot.ts:167`、`browser/playwrightEvidence.ts:209`、`browser/playwrightEvidenceMapper.ts:120`、`browser/readOnlyContentNormalizer.ts:98` | **脱敏的第二个家族**，全在 `browser/` |
| `sanitizeWithTracking` | 3 | `policy/resourceTrustPolicy.ts:120`、`runtime/resources/inventory.ts:518`、`tools/policy/interception.ts:370` | |
| `isPrivateNetworkHost` | 3 | `browser/publicReadOnlyWebManifest.ts:375`、`browser/publicReadOnlyWebPolicy.ts:168`、`core/harness/browserPublicReadOnlyWebSmokeConfig.ts:151` | **安全判定 3 份**（SSRF 防线） |
| `clampInteger` | 3 | `presentation/sidebar/*` | 同域 3 份 |
| `normalizeOptionalString` | 3 | `session/approval/memoryCodec.ts:288` 等 | |
| `sanitizeText`（**第三组**） | 3 | `context/rebuildInput.ts:170`、`repair/handoff/boundary.ts:704`、`verification/result/boundary.ts:775` | 21 行版，**与 12.2 的 6 份不同的另一套** |
| `sanitizeText`（4 组） | — | `repair/handoff/boundary.ts` / `verification/result/boundary.ts` | 即 §10.1 重复-3 |

### 12.5 与 pi 的对照

**实测数字**（`~/projects/pi`，只读）：
- pi 全仓 `function freeze` / `function deepFreeze` 定义：**2 处**
  （`packages/agent/src/harness/pico3/system.ts:158`、`packages/coding-agent/src/core/model-config.ts:241`）
  —— 本仓 **27 处**
- pi 全仓 `function sanitizeText` / `function redact*` 定义：**0 处**
  —— 本仓 `sanitizeText` 至少 **9 处**（6 + 3 两组）+ `redactSensitiveText` 4 处

即 pi 在**同类职责上不存在重复定义问题**，差距是数量级（2 vs 27）。
pi 的结构性原因已在主报告记录：它用**真实 npm workspace 包**加显式 `exports` 映射
（`packages/agent/package.json` 9 个入口）做**硬边界**，而本仓只有约定。
本仓无此机制——`freeze` 能在 27 处各自重定义，正是因为**没有任何东西阻止它**。
这一步与 §12.2 的建议同向：先收口最高危的 `sanitizeText` 与 `deepFreeze`。

### 12.6 口径说明（诚实边界）

- 本普查**只覆盖 `function` 声明式**。箭头函数（如 `const f = () => …`）
  与方法简写未纳入，故真实重复**多于** 56 组。
- 未判断各组"是否本应合并"：`toRelativeTime` 三份可能因显示语境不同而合理地独立；
  但 `sanitizeText` / `deepFreeze` / `isPrivateNetworkHost` / `normalizeBaseUrl`
  属**同一职责**，无独立理由。
- 未评估删除/收口的风险。**本节只报事实。**

---

## 13. 区块 D 回报（`browser/`，170 生产文件 / 24,146 行）——逐条核验后记录

**核验状态**：下列「已核验」项由主代理亲手复核；两处计数已按实测更正（见 13.9）。

### 13.1 结构判断：`browser/` 不是单一子系统

`browser/` 实际是 **4 个不相交层面叠在一个目录里**：

| 层 | 内容 | 活路径 |
|---|---|---|
| **1. 可执行 Playwright 栈** | `sessionManager.ts`（真实 launch + stealth）、`playwrightRuntime.ts`、`core/tools/browserToolUnified.ts` | 经 `core/tools/registry.ts:560` 注册 |
| **2. 受控执行端口** | `executor.ts`（`BrowserExecutor` 为 seam）+ 4 个实现 | `cli` 命令 → `core/commands/browserCommandRuntime.ts` → `browser/commandRunner.ts` → `executionCommandRunner` |
| **3. 第二套并行端口** | `runtime/core/executor.ts`（`BrowserRuntimeExecutor`）+ 4 个实现 | 各自独立 |
| **4. 策略/收据/自愈噪声层** | 契约、策略、surface、receipt、selfHealing、replay | 约 130 文件 |

**端到端唯一活路径**：`CLI 命令 → browser/commandRunner.ts:runBrowserCommandAsync → executionCommandRunner → BrowserExecutor`。
其余入口（sessionManager 的 browser 工具、`runtime/` 协议栈、selfHealing 链）**各自独立、互不汇流**。

**核心缺陷不在文件大小**（`browser/` 无 >600 行文件，最大 `receipt/store.ts` 447 行），
而在**抽象层级数**：同一件事存在 **2 套端口、3 份 spawn 实现、4 份动作映射、4 份出口授权镜像**。
每份有独立状态词表与证据前缀 → 语义分歧**不报错，只静默产出不同结果**。

### 13.2 重复实现（均已核验）

**[D-重复-1] 同一台「spawn 子进程→限流→解析 JSON→脱敏」机器写了 3 份 —— 已核验（最高价值）**
- `browser/runtime/external/runner.ts:25-152` 与 `browser/skill/execution/executor.ts:148-275`：
  结构同构（`new Promise` → `spawn` → `setTimeout + kill("SIGKILL")` → stdout 预算截断 →
  `child.on("error"/"close")` → `parseRunnerStdout` → 校验 → 组装结果）
- **三个私有 helper 逐字节相同（哈希实测）**：
  - `parseRunnerStdout`：`runner.ts:154-162` = `executor.ts:329-337`（sha256 前 12 位 `a253086aea5b`，主代理复核）
  - `appendBudgeted`：`runner.ts:182-185` = `executor.ts:357-360`
  - `summarizeOutput`：`runner.ts:187-195` = `executor.ts:362-370`
- **第三份** `browser/runtime/core/processAdapter.ts:22-91` 是简化版且**行为不一致**：
  不传 `cwd`、无 env 白名单、结果**无 `redactions` 字段**、stdout/stderr 各用独立预算
  （`runner.ts` 两者共用同一 budget）
- 影响：三处独立演进；`processAdapter` 缺 `redactions` 意味着走 `runtime` 协议栈时
  **脱敏记录凭空消失，且不产生类型错误**

**[D-重复-2] `runtime/external/executor.ts` 与 `skill/execution/executor.ts` 是同一模板两份拷贝**
- `runtime/external/executor.ts:28-188` vs `skill/execution/executor.ts:42-275`
- 结构同构：authority 判定 → 门控 → 组 request → 跑进程 → 失败走 `processBlockedResult` →
  成功返回带 **20 条 evidence** 的结果；证据标签表**逐条对应**
- 唯一实质差异是 request 构造器与响应校验器
- 影响：差异本已被设计成数据上的 `BrowserExecutorKind`（`executor.ts:1-9` 里
  `external-runner` 与 `skill-runner` 并列），代码上却写成两个类 → 新增第三种 runner 必须抄第三份

**[D-重复-3] 「actionKind → safe action」映射写 4 份 —— 已核验**
- `browser/localExecutionAuthority.ts:131`、`browser/runtime/external/executor.ts:193`、
  `browser/runtime/external/protocol.ts:83`、`browser/skill/execution/protocol.ts:104`
- 四者都是 `navigate → "navigate-local"` / `extract → "extract"` / 其余 `"observe"`
- **主代理复核补充**：`"navigate-local"` 字面量在全域出现 **20+ 处**（另有
  `skill/runner/capability.ts:6,36,37,91,94,133`、`localFixture.ts:11,44`、
  `runtime/external/manifest.ts:85,125,291` 等），不止 4 份**映射函数**
- 影响：任一处漏改（例如新增 `wait` 动作）→ 该路径**静默降级为 `observe`** 而不报错

**[D-重复-4] `evidenceValue` 与 redaction 过滤管线各写 4 份 —— 已核验（低危）**
- `evidenceValue`：`browser/evidenceBundle.ts:125-127`、`browser/executionReceipt.ts:198-200`、
  `browser/runtime/external/surface.ts:31-33`、`browser/skill/execution/surface.ts:47-49`
- redaction 过滤：`evidenceBundle.ts:92-94`、`executionLifecycleSurface.ts:39-41`、
  `runtime/external/surface.ts:14-16`、`skill/execution/surface.ts:40-42`

**[D-重复-5] playwright 可用性被回答两次，两个答案在同一命令里并列打印**
- `browser/playwrightRuntime.ts:85-142`（`getPwRuntimeStatus`，返回 `PwRuntimeStatus`）
- `browser/playwrightRuntimeAvailability.ts:47+`（`auditBrowserPlaywrightRuntimeAvailability`）
- 两者都活：`browser/commandRunner.ts:41` 调前者，`:39` 经 `playwrightAdapterSurface.ts:4-6` 渲染后者
- 影响：同一状态面板两行来自两套独立探测，**状态词表也不同**
  （`ready|package-missing|binary-missing|disabled|failed` vs
  `available|package-missing|binary-missing|unavailable|blocked-by-policy`）→ **用户看到自相矛盾的两行**

### 13.3 死代码（均已核验，`import type` 不计）

**[D-死-1] `toolPolicy.ts` + `agent.ts` + `plan.ts` 构成一条完全封闭的死链（589 行）—— 已核验**
- `browser/toolPolicy.ts`（188 行）：`decideBrowserToolPolicy` / `browserActionKindForTool` /
  `isBrowserToolName` 全仓零引用；`browser/agent.ts:6` 只是 `import type { BrowserToolName }`
- `browser/agent.ts`（183 行）：`detectBrowserAgentPlan` 零 value 消费者；
  `planning/task/workflowTaskPlanner.ts:125` 是 `import type { BrowserAgentPlan }`，
  且该 `browserPlan?` 字段全仓**无任何赋值点** —— 类型连被构造的机会都没有
- **主代理复核新增**：`browser/plan.ts`（218 行）的唯一消费者是 `browser/agent.ts:5`
  （line 5 `} from "./plan.js"`）→ **随 agent.ts 一起死**
- 合计 **589 行**（188+183+218），三者内 `grep path.join|spawn|execFile|import(|process.argv` = 0，非动态入口
- 影响：**这不是三个独立死文件而是一条死链** —— 只删 `agent.ts` 会留下更隐蔽的 `plan.ts`

**[D-死-2] `browser/playwrightEvidence.ts`（251 行）的 value 面全死 —— 已核验**
- `mapPwEvidence`(44-117) / `classifyPwFailure`(119-150) / `toRuntimeStatus`(153-163) /
  `redactPwText`(209-239) **全仓零 value 消费者**（主代理 grep 确认）
- 全文件唯一外部边是 `playwrightRuntime.ts:4` 的 `import type { PwFailureCode }`
- 影响：这是**第二份** Playwright 证据映射实现（活路径用的是 `playwrightEvidenceMapper.ts`），
  两份字段处理不同（`playwrightEvidence.ts:63` 写 `browserLaunched: input.evidence.browserLaunched`，
  `playwrightEvidenceMapper.ts:63` 硬编码 `browserLaunched: false`）

**[D-死-3] `skill/runner/manifest.ts`（196 行）是测试自足孤岛 —— 已核验**
- 全仓 grep `BrowserSkillRunnerManifest` 只命中自身与 `manifest.test.ts`
- 该测试**被测对象就是死文件本身**（即 block-findings §1 描述的 CB-005 形态）
- 活路径用的是「外部 runner manifest 内嵌 skill 字段」（`runtime/external/manifest.ts:46-63`
  的 `skillRunnerMetadata`/`skillRunnerBinding`），而非这份独立 skill manifest

**[D-死-4] `directPlaywrightAdapter` / `selectorRepairApplyExecutor` 链：终端消费者是测试基建 —— 已核验**
- `playwrightEvidenceMapper.ts` → 唯一 value 消费者 `directPlaywrightAdapter.ts:9`
- → `BrowserDirectPlaywrightAdapter` 唯一引用点：`core/harness/browserPlaywrightAdapterSpikeFixtures.ts:4-5`
  （**测试基建**）与 `browserPlaywrightAdapterSpikeScenarios.test.ts:6`
- `selectorRepairApplyExecutor.ts:20` 只被 2 个测试引用
- **精确化**：与早前「`playwrightEvidenceMapper` / `selectorRepairApplyPolicy` 不是死代码」的判定
  **不矛盾但需精确化** —— 它们确有 value 消费者，然而整条链**没有任何生产入口**：
  `browser/commandRunner.ts:39` 引了 `renderBrowserPlaywrightAdapterSurface` 却**从未
  `new BrowserDirectPlaywrightAdapter`**
- 影响：**「测试基建不是死代码」这条规则在这里正好掩盖了一条生产不可达链**

### 13.4 命名与位置

**[D-命名-1] 「Surface」后缀被 20 个文件复用，但无共享契约**
- `skill/runner/surface.ts:5`（静态说明「Execution: not enabled」）与
  `runtime/core/surface.ts:5`（渲染 `BrowserRuntimeActionLoopResult`）**同名同后缀、层级完全不同**
- 20 个中真正被活路径消费的只有 6 个
- 影响：在 170 文件平铺目录里，名字是唯一导航手段；「Surface」已退化为「返回 string 的渲染函数」的同义词

**[D-命名-2] 同名字根家族职责分化**
- `*Executor`（`browser/` 内 13 个）：只有前 5 个同族（浏览器动作执行）；
  后 8 个是各自子系统的「应用某决策」函数，与 executor 端口无关
- `*Adapter`（3 个）：`directPlaywrightAdapter.ts`（实现端口）、
  `playwrightCliAdapter.ts:13-31`（**零副作用的策略文字块**）、`runtime/core/processAdapter.ts`（真跑进程）
  —— 三者不共享接口
- `*Bridge`（3 个）：`cliExecutionBridge.ts`(363)、`skill/execution/bridge.ts`、`externalNetworkExecutionBridge.ts`(397)
  —— 输入输出毫无共性

**[D-命名-3] 顶层平铺中承担子域职责的文件未收进已存在的子目录**
- `browser/` 已有 `runtime/ receipt/ skill/` 三子目录，但
  `externalNetwork*`(13)、`controlledNetwork*`(6)、`publicReadOnlyWeb*`(5)、`readOnly*`(5)、
  `selfHealing*`(16)、`replay*`(17) 共 **62 文件（36%）全部平铺**
- **注意**：回报建议「新建 `browser/network/`、`browser/recovery/`」——
  这是按 owner 域自身的自然内聚簇收拢，**不是按区块搬迁**，方向可接受；
  但仍属搬迁，需裁决（见 13.8）

### 13.5 模块划分（均已核验）

**[D-模块-1] 无 >600 行文件；但 6 个文件声明名 >20**
- 声明名超限：`externalNetworkRunnerManifest.ts`(410 行/**27 名**)、
  `publicReadOnlyWebManifest.ts`(394/**24**)、`runtime/external/protocol.ts`(323/**23**)、
  `skill/execution/protocol.ts`(350/**21**)、`runtime/core/manifest.ts`(229/**22**)（另有 1 个）
- **最大文件 447 行不是问题**：全仓 14 个 >600 行文件中 `browser/` 占 **0 个**（与 §5 名单互不重叠）
- 真正问题：`externalNetworkRunnerManifest.ts` 一个文件容纳 **4 个职责**
  （类型 18-46 / 序列化校验 109-210 / **env 加载 212-259** / 4 个 parse 助手 + 4 个守卫 + sanitizer）

**[D-模块-2] 5 个 `loadXxxManifestFromEnv` 是同一段代码的 5 份拷贝 —— 已核验**
- `cliExecutorInjection.ts:36`、`externalNetworkRunnerManifest.ts:212`、
  `receipt/manifest.ts:128`、`controlledNetworkRunnerManifest.ts:169`、`publicReadOnlyWebManifest.ts:199`
- 结构一致：读 env → 缺则 `{status:"missing"}` → `readFile ?? fs.readFileSync` → `JSON.parse` → `validate`
- **主代理复核补充**：`cliExecutorInjection.ts` **同一文件里有两份**（`:36` 与 `:101+`，
  `const readFile = input.readFile ?? ((path) => fs.readFileSync(path, "utf8"))` 在 63 与 102 行各一次）
- 消费者：只有 `loadBrowserPublicReadOnlyWebManifestFromEnv` 有生产消费者
  （`entrypoints/cliCommandExecutionBridge.ts:16`），其余四者 grep 到的引用点均为测试

**[D-模块-3] `serialize` 六份函数体完全相同**
- `runtime/external/manifest.ts:137-141`、`externalNetworkRunnerManifest.ts:135-139`、
  `controlledNetworkRunnerManifest.ts:91-95`、`localFixtureManifest.ts:113-117`、
  `publicReadOnlyWebManifest.ts:116-120`、`skill/runner/manifest.ts:77-81`
- 六份都是 `` return `${JSON.stringify(manifest, null, 2)}\n`; ``

### 13.6 耦合度

**[D-耦合-1] 「`core/harness` → `browser` 58 条边」复核：约 2 条是生产边，其余是测试基建 —— 已核验**
- `core/harness/` 下 value-import `browser/` 的非测试文件共 15 个，
  **14 个**文件名是 `*Fixtures.ts` / `*Runner.ts` / `*Scenario*.ts`（场景测试基建）
- **唯一有生产消费者的是 smoke 三件套**：`core/harness/browserPublicReadOnlyWebSmoke{Config,Report,Runner}.ts`
  被 `core/commands/browserCommandRuntime.ts:3-5` import
- **结论修正**：58 条边数字对，但**结论应为「browser/ 侧无越界」** ——
  是测试基建在按需组装场景。真正的问题在 `core/commands/browserCommandRuntime.ts:1-5`
  （把 CLI 命令执行与 harness smoke 缝在一起），那是 `core/` 越界，**不是 `browser/` 的问题**

**[D-耦合-2] `browser/` 反向依赖 `presentation/` —— 已核验，真实越界**
- `browser/capabilityModel.ts:1`：
  `import { sanitizeSidebarText } from "../presentation/sidebar/sidebarStateModel.js";`
- `capabilityModel.ts:139-141` 的 `sanitizeBrowserText` 只是把 `sanitizeSidebarText(value, new Set(), maxLength)` 包一层
- **主代理实测影响面：`browser/` 内 97 个文件 import `capabilityModel.js`（全域 101 处）**（回报称 88）
- 影响：(a) **执行层依赖 UI 层**，方向反了 —— sidebar 渲染策略一变，浏览器执行层全部文本脱敏行为跟着变，
  且**不产生编译错误**；(b) 97 文件经单点间接依赖 `presentation/`，
  `browser/` 无法在不牵动 `presentation/` 的前提下被复用或测试
- **这是 `browser/` 内最重要的结构性缺陷**

**[D-耦合-3] `runtime/core/adapterExecutor.ts` 与 `skill/runtime/binding.ts` 双向依赖（无环）**
- `runtime/core/adapterExecutor.ts:19` → `skill/runtime/binding.js`
- `skill/runtime/binding.ts:3,4` → `runtime/core/protocol.js` + `runtime/external/runtimeManifest.js`
- 说明「runtime 是基础设施、skill 是上层」的划分**并未成立**，它们是同一层的两个切面

### 13.7 pi 对照（`browser/` 相关）

**前提更正（已核验）**：pi **完全没有浏览器执行子系统**。
`grep -ri playwright|browser packages/agent/src packages/coding-agent/src` 只命中
`@vitest/browser-playwright` 依赖与 `navigateTree`（会话树导航）。
**不能照搬任何浏览器结构。**

值得效仿的是 pi 在**「受控外部副作用」**上的架构：

| # | pi 机制 | pi 证据 | 本仓差距 | 代价 |
|---|---|---|---|---|
| 1 | 一次副作用拆成显式四阶段 | `harness/execution/tools.ts:57-88` Prepared → `:90-110` beforeDecision → `:112-142` execute（唯一跨副作用函数）→ `:144-166` finalize | 本仓散成 **8 个独立 `*Policy.ts`**（`executionPolicy`/`sandboxPolicy`/`networkAllowlist`/`executionConfirmation`/`executionEvidencePolicy`/`sandboxAuthority`/`runtime/core/preflight`/`skillManagedRunnerPolicy`），由 `runtime/core/preflight.ts:22-90` 一次串 6 个判定，**无阶段类型** | 中高（要给 `BrowserExecutor.execute` 加 signal） |
| 2 | 独立的作用域闸门类型 | `harness/execution/effect-gate.ts:9-13` `Gate` / `:15-19` `GateControl` / `:27-59` `createGate()` 状态机 | **无任何组件持有「本次执行是否已作废」的状态**。`browser/executionCommandRunner.ts:69` 拿到 executor 后直接 `await`，**全程无可取消点**；三份 runner 各自 `let settled = false` 手工防重，且 `runner.ts:57-76` 的超时回调**未检查 `settled` 就先置 true 再 kill**，与 `processAdapter.ts:46-48` 的正确写法不一致 | 中高 |
| 3 | 进程输出预算唯一实现 | `harness/utils/truncate.ts:1-16`（`DEFAULT_MAX_LINES=2000`/`DEFAULT_MAX_BYTES=50KB`） | **5 处且语义不同**：`runner.ts:182` `appendBudgeted`、`processAdapter.ts:119` `bound`、`executor.ts:357` 又一份、`playwrightEvidenceMapper.ts:37` 二次夹取、`publicReadOnlyWebExecutor.ts` 用 `responseByteBudget`。**且 byte/char 混用**：字段叫 `outputBudgetBytes`（`runner.ts:56`、`executor.ts:179`）实现全是 `String.length` → **中文/emoji 页面预算可被突破 4 倍** | 低（修 byte/char 不需改签名） |
| 4 | 工具上下文是一个字段 | `harness/tools/tool-context.ts:1-5` 全文只 `{ env: ExecutionEnv }` | `browser/commandRunner.ts:125-159` 的 `runBrowserCommandAsync` 接受 **32 个可选字段**，`core/commands/types.ts:12-20` **再声明一遍**。`core/harness/` 下 15 个 `browser*Fixtures.ts` 是注入面过宽的症状 [INFERENCE] | 高（改动面大，可分步） |

**反面对照**：pi 的 `Result<TValue,TError>` 与本仓的 `{ok:true,...}|{ok:false,...}` 判别联合
是同一模式的两种拼写；本仓版本额外携带 `evidence/warnings/redactions`，**信息量更大，无需对齐**。

### 13.8 处置建议（按性价比，均标风险）

| 序 | 动作 | 依据 | 风险 |
|---|---|---|---|
| 1 | 修 byte/char 混用（字段名与实现不符） | 13.7-3 | **低**（不改签名） |
| 2 | `withFileMutationQueue` 同类：3 份 spawn 抽成 1 份参数化 | D-重复-1 | 中 |
| 3 | 六份 `serialize` 合并为一 | D-模块-3 | **低** |
| 4 | `sanitizeBrowserText` 下沉，切断 `browser → presentation` 反向依赖 | D-耦合-2 | 中（97 处 import 改写，机械） |
| 5 | 删死链 `toolPolicy` + `agent` + `plan`（589 行） | D-死-1 | 低（需先确认无路线计划） |
| 6 | 裁决 Direct Playwright 路线是否接线 | D-死-4 | 高（产品裁决） |
| 7 | 顶层 62 文件按内聚簇收进子目录 | D-命名-3 | 中（搬迁，需裁决） |

### 13.9 回报纠错（主代理实测）

| 项 | 回报称 | 实测 |
|---|---|---|
| `capabilityModel` 消费者数 | 88 | **97**（`browser/` 内）/ 101（全域） |
| `*Executor` 文件数 | 10 | `browser/` 内 **13** |
| `*Adapter` 文件数 | 3 | 3（正确） |

---

## 14. 区块 C / F / H / I / J / B / E 的死代码普查（主代理机械扫描，2026-09-19）

> **口径**：这 7 个区块的子代理回报尚未全部返回。本节先给出**主代理自己可复核的机械结果**：
> 对每个区块，用 value 边正向闭包（根 = `entrypoints/**` + `index.ts`，含 `.tsx`）
> 判定不可达生产文件，再逐文件统计外部 value 消费者与测试引用数。
> **标注 `DYNAMIC` 的文件经动态入口复核**（`spawn`/`execFile`/`import(`/shebang/`process.argv`）。
> **本节只报事实，不做裁决。**

### 14.0 汇总

| 区块 | 孤立文件 | 行数 |
|---|---:|---:|
| H 工具 harness | 26 | 7,176 |
| F provider 与环境 | 17 | 4,280 |
| J 小域支撑 | 15 | 2,927 |
| B 会话与 shell | 17 | 2,071 |
| C 上下文与记忆 | 7 | 1,851 |
| I 规划与工作流 | 14 | 1,705 |
| E 交互面 | 12 | 1,044 |
| **合计** | **108** | **21,054** |

**注**：108 < §6 的 285，差额是这些域中**不可达但未被判为孤立**的文件
（它们位于不可达簇内部、有簇内消费者），以及 A/D/G 三区块已单列的部分。

### 14.1 H 工具执行与 harness（26 文件 / 7,176 行，最大）

| 行数 | 文件 | 备注 |
|---:|---|---|
| 3,006 | `runtime/events/projection.ts` | 已知（§1、§2）；`tests=4` |
| 580 | `runtime/resources/inventory.ts` | **唯一消费者是 `import type`**（`runtime/events/projection.ts:27`）|
| 401 | `tools/toolCallBatch.ts` | **唯一消费者是 `import type`**（`runtime/events/projection.ts:38`）|
| 366 | `core/harness/agentScenarioRunner.ts` | `tests=4` |
| 296 | `tools/toolOutcomeBundle.ts` | `tests=2`；**含 6 份 `sanitizeText` 之一**（§12.2）|
| 222 | `tools/toolHandoff.ts` | `tests=1` |
| 206 | `core/harness/agentCliScenarioRunner.ts` | `tests=15` `hint` |
| 176 | `runtime/events/stream.ts` | 已知（§1）|
| 156 | `runtime/resources/projection.ts` | **`DYNAMIC`** |
| 128 | `core/tools/messagingTools.ts` | `tests=1` |
| 其余 15 个 | 23–210 | 多为 `core/harness/*Fixtures.ts`（**测试基建，不可删**）|

**结构性观察**：H 区块的 26 个孤立文件里，**约 11 个是 `core/harness/*Fixtures.ts` / `*Scenario*`**
（场景测试基建，按方法论**不算死代码**）。真正可疑的是
`runtime/resources/inventory.ts`、`tools/toolCallBatch.ts`（**只有 type 消费者**）
与 `runtime/events/*`（§1 已裁决）。

### 14.2 F provider 与环境（17 文件 / 4,280 行）

| 行数 | 文件 | 备注 |
|---:|---|---|
| 857 | `provider/request/attempt.ts` | `tests=2`；**全仓 >600 行文件之一**（§5）|
| 800 | `provider/request/boundary.ts` | `tests=5`；**三个 `boundary.ts` 之一**（§10.3）|
| 386 | `provider/proposal/providerEditProposal.ts` | 见下 |
| 301 | `provider/response/stream.ts` | `tests=1` |
| 253–178 | `provider/proposal/provider{AnchoredProposal,AnchorMatcher,AnchorConflict,AnchoringResult,AnchorQuality,ProposalAnchors}.ts` | 见下 |
| 164 | `provider/proposal/providerOutputValidator.ts` | `tests=6` |
| 155 | `model-adapters/types.ts` | 纯类型 |
| 107 | `provider/liveProviderSmokeFallback.ts` | `tests=1` |
| 89 | `provider/response/synthetic.ts` | `tests=1` |
| 72/58 | `model-adapters/{multimodal,strictSchema}.ts` | |
| 17 | `sandbox/index.ts` | **`DYNAMIC`** |

**`provider/proposal/` 整簇 2,899 行**。其外部消费者只有两类：
- `redactProviderEditText` 从 `providerEditContext.js` 被 4 个**不可达**文件 value 导入
  （`repair/verificationRepairContext.ts:9`、`edit/proposal/editRepairContext.ts:6`、
  `edit/proposal/editRepairProposal.ts:3`、`planning/task/taskIntent.ts:4`、
  `verification/command/plan.ts:9`）
- 其余全是 `import type`（`edit/proposal/editProposalReview.ts:2`、`planning/quality/model.ts:23-24`）
- **结论：该簇的 value 消费者全部落在不可达区**，是「死簇养死簇」的形态

### 14.3 J 小域与支撑（15 文件 / 2,927 行）

| 行数 | 文件 | 备注 |
|---:|---|---|
| 685 | `test-utils/stoppedRecoveryFixture.ts` | **测试基建，不可删** |
| 610 | `test-utils/longSessionDurabilityProcess.ts` | **`DYNAMIC`（`spawnSync` 启动）** —— §8 方法论提醒第 2 条的实例 |
| 368 | `test-utils/cliHarness.ts` | 测试基建 |
| 337 | `test-utils/longSessionContinuityFixtures.ts` | 测试基建 |
| 167 | `core/messaging/sessionSocketHost.ts` | `tests=1` |
| 163 | `core/security/projectTrust.ts` | `tests=1` |
| 139 | `core/hooks/types.ts` | 纯类型 |
| 129 | `test-utils/ptyCapabilityDetector.ts` | 测试基建 |
| 104 | `test-utils/terminalDouble.ts` | 测试基建 |
| 57 | `core/mcp/types.ts` | 纯类型 |
| 48/43/20 | `eval/browser/benchmark{Report,Runner,Model}.ts` | `tests=3` —— **R11 已裁决"保留原位"** |
| 42 | `core/messaging/types.ts` | 纯类型 |
| 15 | `test-utils/cleanup.ts` | 测试基建 |

**观察**：J 区块 15 个孤立文件中 **6 个在 `test-utils/`**（按方法论**不是死代码**），
4 个是纯 `types.ts`，3 个是 R11 已裁决保留的 `eval/browser/`。
**真正待裁决的只有 2 个**：`core/messaging/sessionSocketHost.ts`、`core/security/projectTrust.ts`。

### 14.4 B 会话与 shell（17 文件 / 2,071 行）

| 行数 | 文件 | 备注 |
|---:|---|---|
| 468 | `session/replay/state.ts` | `tests=1` —— **replay 子树的孤立部分**（`builder.ts` 本身是活的）|
| 273 | `session/sessionDagEngine.ts` | `tests=1` `hint` |
| 257 | `session/continuation/readiness.ts` | `tests=3` |
| 241 | `session/store/host/state.ts` | **`host` 子目录**（CB-005 删 host lane 的遗留命名）|
| 166 | `session/presentation/facts.ts` | `tests=1`（`presentation/` 子目录名见 `plan.md` B3 的 `renderer/` 先例）|
| 142 | `session/sessionContinuityTypes.ts` | 纯类型 |
| 112 | `session/store/threadState.ts` | `tests=1` |
| 110 | `core/shell/platform/processTree.ts` | `tests=1` `hint` |
| 72 | `session/replay/host/facts.ts` | 同 `host` 命名问题 |
| 47 | `session/recovery/sessionReconciler.ts` | `tests=1` |
| 47 | `core/shell/approval/types.ts` | 纯类型 |
| 其余 6 个 | 17–29 | 纯 `types.ts` |

**观察**：B 区块 17 个孤立文件中 **7 个是纯 `types.ts`**（17–155 行）。
真正有体量的可疑项是 `session/replay/state.ts`(468)、`sessionDagEngine.ts`(273)、
`session/continuation/readiness.ts`(257)、`session/store/host/state.ts`(241)。
注意 `session/store/host/` 与 `session/replay/host/` 两个 **`host`** 子目录名，
与 CB-005 删除的 host lane 同源。

### 14.5 C 上下文与记忆（7 文件 / 1,851 行）

| 行数 | 文件 | 备注 |
|---:|---|---|
| 827 | `context/readDeliveryProjection.ts` | `tests=1`；**全仓 >600 行文件之一**（§5）|
| 292 | `context/acquisition/summary.ts` | `tests=1` |
| 206 | `context/rebuildInput.ts` | `tests=3`；**含 3 份 `sanitizeText` 之一**（§12.4）|
| 194 | `context/sessionContextRebuildProjection.ts` | `tests=7` |
| 152 | `context/compact/governance/contextAnalysis.ts` | `tests=1` |
| 115 | `core/context/model/contextLayerModel.ts` | `tests=1` |
| 65 | `core/memory/types.ts` | 纯类型 |

### 14.6 I 规划与工作流（14 文件 / 1,705 行）

| 行数 | 文件 | 备注 |
|---:|---|---|
| 433 | `planning/action/graph.ts` | `tests=1` |
| 240 | `planning/runtime/engine.ts` | `tests=2` **`DYNAMIC`** —— 即 judge 越界名单中的 `planning/runtime/engine.ts`（§10.3 模块-2）|
| 208 | `core/workflow/teamStore.ts` | `tests=1` `hint` |
| 164 | `planning/task/workflowTaskPlanner.ts` | `tests=1`；**是 `browser/agent.ts` 的唯一 type 消费者**（§13.3 D-死-1）|
| 153 | `planning/runtime/types.ts` | 纯类型 |
| 其余 9 个 | 21–79 | `core/workflow/*`(5) + `core/research/types.ts` + `core/subagents/types.ts` + `workflow/gitChangeSetAttribution.ts` |

**交叉验证**：`planning/runtime/engine.ts` 同时出现在
(a) 本节不可达名单、(b) judge 的 `declared_functions_within_module_ceiling` 名单（§10.3 模块-2）。
**一个不可达文件同时被判越界** —— 两个判据在同一处叠加。

### 14.7 E 交互面（12 文件 / 1,044 行）

| 行数 | 文件 | 备注 |
|---:|---|---|
| 275 | `core/commands/authCommandRuntime.ts` | `tests=1`；**含 `normalizeBaseUrl` 4 份之一**（§12.4）|
| 244 | `presentation/sidebar/sidebarEventBridge.ts` | `tests=3` |
| 142 | `core/commands/types.ts` | 纯类型；**是 `runBrowserCommandAsync` 32 字段的第二份声明**（§13.7 对照-4）|
| 110 | `presentation/sidebar/sidebarStateQuality.ts` | `tests=1` |
| 99 | `presentation/sidebar/sidebarLivePanelQuality.ts` | `tests=1` |
| 64 | `cli/interactive/interactiveCancellation.ts` | `tests=1` |
| 38 | `cli/options/cliOptions.ts` | 纯类型 |
| 27 | `entrypoints/handleSigint.ts` | `tests=1` |
| 24 | `entrypoints/cli.tsx` | **`DYNAMIC`** `hint` —— **这是 `package.json` 的 `bin` 入口**，本次扫描把它判为不可达属于**已知误报**（见下） |
| 13/4/4 | `cli/approval/approvalModeContract.ts`、`entrypoints/cli{Stdin,Print}ModeRunner.ts` | |

> **⚠️ 本节已知的一处误报**：`entrypoints/cli.tsx` 被列为不可达，但它是
> `packages/ts-shell/package.json` 中 `bin.agents = ./dist/packages/ts-shell/src/entrypoints/cli.js`
> 的入口。误报原因：本次闭包的根集合是 `entrypoints/**` 的**文件名**，
> 而 `cli.tsx` 的 `.tsx` 扩展名在 `.js`→`.ts` 的改写规则下**未能自匹配**。
> 该文件已标 `DYNAMIC` `hint`，**不计入待裁决范围**。
> 这再次印证 §8 方法论提醒：**入口识别必须显式处理 `.tsx`**。

### 14.8 与 pi 的对照

pi 在同一问题上的做法已在 §12.5 记录（`freeze` 2 处 vs 本仓 27 处）。
本节补充一条结构性差异：**pi 的测试基建集中在 `packages/*/test/`**
（按主题组织，**不镜像 src**），故「测试基建」与「生产代码」在**目录层面**就分开了；
本仓的 `core/harness/*Fixtures.ts` 与生产文件**同级混放**，
这正是本节 26 个孤立文件里要人工剔除 11 个测试基建的原因。
（注：R8 已裁决**测试保持并排、不分离**，故这条**不建议照做**，仅记录差异。）

---

## 15. 区块 E 回报（`cli/ entrypoints/ presentation/ core/commands/`，202 文件 / 26,841 行）——逐条核验后记录

**核验状态**：已核验项由主代理亲手复核。**发现一处重大回报错误**（§15.6）。

### 15.1 结构性判断：`entrypoints/` 与 `cli/` 的边界已实质反向

回报称：`entrypoints/` 装的是**可复用 CLI 契约**，`cli/` 装的是**执行器**，
导致 `cli/` 有 **19 处** import 回 `entrypoints/`。

**这与 `agent-rules/file-placement-and-naming.md` 对 `entrypoints/` 的定位冲突**
（该文件要求 `entrypoints/` 是**入口/兼容层**，不应容纳可复用契约，也不应被下游反向依赖）。

> **主代理实测（更正回报的"19 处"）**：
> `cli/` → `entrypoints/` 共 **28 条 import 边**，其中 **value 23 条、type 5 条**。
> 分布（已完成清单，可复核）：
> - `cli/interactive/` **9 条**（`interactiveCommandRouter` 6 条、`interactivePromptRunner` 3 条、
>   `slashSuggestions`、`promptChrome`）
> - `cli/bootstrap/` **5 条**（`cliBootstrapContext` ×2、`cliProcessRunner` ×2、`cliStartupSurface` ×2）
> - `cli/print/` **3 条**（`printModeRouter` ×2、`stdinPromptCapture`、`replayModeRunner`）
> - `cli/approval/` **2 条**（`cliApprovalAuditBridge:3` → `approvalPromptBridge.js`；
>   `cliApprovalEscalationBridge:6` → `cliApprovalModule.js`）
> - `cli/runtime/`、`cli/interactive/interactiveLoop`、`interactiveMode`、`lineLoop` 各 1 条
>
> **反向也存在**：`entrypoints/cliApprovalModule.ts:7,14,37` ↑ `cli/approval/*`，
> `entrypoints/cliRuntimeInvocation.ts:6` ↑ `cli/approval/permissionScope.js`。
> **即边界双向穿越是实测的，且规模比回报所称的 19 条更大（28 条）。**
> `cli/interactive/` 是最大来源域（9 条），而非回报举例的 `cli/approval/`。

### 15.2 重复实现（均已核验）

**[E-重复-1] `renderProjectedLines` 三份逐字节相同 —— 已核验（与 §11.5 重-跨-1 为同一条）**
- 正式定义 `cli/output/projectedLineRenderer.ts:5-11`（全文 9 行，含 `ProjectedLineRenderer` 接口）
- 副本 A `entrypoints/cliPermissionModule.ts:123-128`（**私有**，调用点 `:77`）
- 副本 B `entrypoints/cliSessionModule.ts:166-172`（**导出**，调用点 `:118`、`:327`）
- 唯一真实消费者 `cli/interactive/interactiveCommandRouter.ts:34`
- **影响（回报的洞察）**：`cli/output/` 目录**只有这 1 个文件**，
  它存在的唯一理由（消除这个 for 循环重复）**没有达成** → `cli/output/` 作为 owner 域不成立

**[E-重复-2] `parseArgsWithFlags` 两份逐字节相同 —— 已核验（哈希一致）**
- `core/commands/connect/preset.ts:110-136`（**导出**）
- `core/commands/modelCommandRuntime.ts:484-506`（**私有**）
- 主代理实测：两份函数体 **sha256 前 12 位均为 `7dfaf91c3a88`**
- `modelCommandRuntime.ts:269` 调用的是自己的私有副本，而非已有的导出 → **已存在可用导出却仍复制**
- 影响：`--key value` / `--key` 布尔语义须同时改两份，否则 `/model list --refresh` 与
  `/connect set --label x` 行为分叉

**[E-重复-3] `normalizePathForCompare` 共 7 份 —— 已核验**
- `core/shell/bootstrap.ts:58`、`core/shell/runtimeContext.ts:295`、
  `core/shell/startupSurfaceRenderer.ts:178`、`entrypoints/cliArgs.ts:419`（多一个 `cwd` 参数）、
  `entrypoints/cliPermissionModule.ts:154`、`entrypoints/cliSessionModule.ts:355`、
  `entrypoints/cliWorkspaceModule.ts:95`（**导出**）
- 主代理实测共 **7 处**（与回报一致）
- 后 6 份函数体均为 `return path.resolve(value).toLowerCase();`
- 影响：路径规范化规则（是否 resolve/lowercase/处理 symlink）散 7 处

**[E-重复-4] `toRelativeTime` 共 4 份 —— 已核验**
- `core/shell/sessionStateSurface.ts:290`、`entrypoints/cliPermissionModule.ts:132`、
  `entrypoints/cliWorkspaceSurface.ts:91`、`entrypoints/sessionsPanel.ts:209`
- 前三份逐字相同（变量名都是 `updatedAt`），第四份是同一算法换名（`timestamp`）
- 影响：会话列表 / 项目上下文列表 / 权限授权列表三处「多久以前」文案各由私有实现决定

**[E-重复-5] `resolveWorkspaceRootMode` 三份**
- `entrypoints/cliWorkspaceModule.ts:149`（导出）、`entrypoints/cliSessionModule.ts:359`（私有）、
  `core/shell/bootstrap.ts:87-89`（私有）
- 逻辑均为 `gitContext.insideGit && gitContext.root ? "git-root" : "direct"`

**[E-重复-6] `connect/preset.ts` 与 `modelCommandRuntime.ts` 成对复制 3 组**
- `normalizeOptional`(`preset.ts:146`) ↔ `normalizeText`(`modelCommandRuntime.ts:557`，换名)
- `normalizeBaseUrl`(`preset.ts:151`) ↔ `normalizeBaseUrl`(`modelCommandRuntime.ts:562`)
- `normalizeConnections`(`preset.ts:159`) ↔ `normalizeConnections`(`modelCommandRuntime.ts:538`)
- 影响：`/model` 与 `/connect` 对「合法 provider connection」有两套判定

**[E-重复-7] `isOpenAICompatibleStyleProvider` 三份**
- `core/commands/connect/preset.ts:97-104`（导出）、`core/commands/modelCommandRuntime.ts:586-592`（私有）、
  `core/commands/localCommandRuntime.ts:156-160`（私有）
- 三处同值集合 `openai-compatible | google | antigravity | claudecode`

**[E-重复-8] 命令元数据有 3 个真值源 —— 已核验方向**
- `core/commands/registry.ts:59-610`：54 个 `CommandDefinition`，各带 `argumentHint: "[a|b|c]"` 字符串
- `core/commands/argumentCompletions.ts:35-57`：`SUBCOMMAND_VALUES` 表**逐条镜像**上述字符串
  （如 `:44 permissions: [...]` ↔ `registry.ts:273 argumentHint: "[list|explain|revoke|reset]"`）
- `core/commands/types.ts:87-107`：`ShellActionResult` 再列一遍 action 子动作
- **回报引用的一条证据很有价值**：`argumentCompletions.ts:19-24` 的注释**自认**这层风险
  （"Completing a value the handler would reject is worse than completing nothing"），
  但它是**手动**同步的第三份，不是从 handler 推导的

**[E-重复-9] 「blocked 结果」文案协议 7 处手写拼装**
- `core/commands/slashRouter.ts:70-90`、`compactCommandRuntime.ts:115`、`memoryCommandRuntime.ts:277`、
  `warmupCommandRuntime.ts:53`、`presentation/sidebar/sidebarPanelCommandContract.ts:58`、
  `sidebarLivePanelCommandContract.ts:46`、`entrypoints/mcpControlCliSurface.ts:24-28`
- 五元组 `Result` / `- Outcome: blocked` / `- BlockerKind:` / `- Reason:` / `- DoNext:`
- **回报的关键证据**：`slashRouter.test.ts:983-1003`、`mcpControlCliSurface.test.ts:129-134`
  **已对字面文案断言** → 说明该协议已被下游依赖，改动需同步测试

### 15.3 死代码（均已核验）

**[E-死-1] `presentation/sidebar/` 的「质量检查链」只被测试引用 —— 已核验**
- `sidebarEventBridge.ts:70` `bridgeSidebarEvents`：消费者仅 3 个测试
  （`sidebarStateSurface.test.ts:2`、`sidebarStateQuality.test.ts:2`、`sidebarEventBridge.test.ts:3`）
- `sidebarPanelQuality.ts:27` `checkSidebarPanelQuality`：仅 `sidebarPanelLayout.test.ts:4`
  + `sidebarLivePanelQuality.ts:1`
- `sidebarLivePanelQuality.ts:26`：仅 `sidebarLivePanelRuntime.test.ts:4`
- `sidebarStateQuality.ts:36`：仅 `sidebarStateQuality.test.ts:5`
- **合计约 440 行**（Quality 三模块约 200 + EventBridge 244）
- 生产入口 `/sidebar`（`sidebarCommandRuntime.ts:15`）**从不调用**任何 Quality 或 EventBridge
- **回报的关键判定**：这些模块**不是在验证生产代码质量，而是生产代码的平行副本** ——
  它们对同一批 checks（hasHeader / noSecretLeak / outputWidthRespected…）各自实现一遍，
  `sidebarPanelQuality.ts` 与 `sidebarLivePanelQuality.ts` 的 checks 表有 **8 个字段重名同义**。
  **其绿灯不能证明生产渲染正确，因为检查的是自己构造的 snapshot。**
- **处置建议（回报给得准）**：若刻意保留为校验基建 → 移入 `test-utils/`
  （`file-placement-and-naming.md` 明确 `test-utils/` 仅测试使用）；
  否则删除。**当前状态是"披着生产路径的测试代码"**。

**[E-死-2] `core/commands/shellActionRuntime.ts` 三个导出构成「消费者在、生产者没了」的死链**
- 已无生产者的三个导出：`:10` `runSessionsShellAction`（产出 `list-sessions`）、
  `:175` `runViewShellAction`（`show-view`/`set-view`）、
  `:206` `runAgentModeShellAction`（`show-agent-mode`/`set-agent-mode`）
- `registry.ts:49-55` 只导入 **7 个**，上述三个不在其中，全仓 grep 亦零引用
- **但消费者仍在**：`cli/interactive/interactiveCommandRouter.ts:203,213,220,230`
  仍在 `isShellAction(..., "show-view")` 等判定
- **连带孤立**：`entrypoints/cliDisplayProjection.ts:16,26,33,42` 四个格式化器**只**被
  `interactiveCommandRouter.ts:206-235` 调用 → 只服务于这条死链；
  `core/commands/types.ts:91-95` 的四个 union 成员；`entrypoints/cliArgs.ts:53-59` 的保留字
- **反证（回报给得好）**：`/plan`、`/build` 的替代机制**确实存在** ——
  `interactiveMode.ts:585-588` `cycleAgentMode()` 经 Shift+Tab 触发，且
  `interactiveCommandRouter.test.ts:76-82` 明写「Mode switching moved to Shift+Tab,
  so /mode no longer exists to route」→ **确认是遗留，不是待接线能力**

### 15.4 命名与位置

**[E-命名-1] `entrypoints/` 装可复用契约，违背其"兼容层"定位 —— 已核验（数量已更正）**
- **主代理实测**：`entrypoints/` 生产文件 **26 个**（`.ts`+`.tsx`，不含测试；含测试为 42）。
  回报称"35 个契约文件"，**未复现**（35 既非生产数 26，也非含测试数 42；可能含其它口径）。
- 其中 **14 个**导出 `run*`/`build*`/`create*`/`render*`/`parse*`/`resolve*`/`switch*` 形态的
  **可复用契约函数**（而非入口薄壳），即"契约层"的判定**方向成立，但规模是 14/26 而非 35**。
- 6 个 `*Module.ts`：`cliApprovalModule`、`cliMcpModule`、`cliPermissionModule`、
  `cliRuntimeModule`、`cliSessionModule`、`cliWorkspaceModule`
- 具体例（回报举证准确）：
  - `cliWorkspaceModule.ts:95` 导出 `normalizePathForCompare`、`:149` 导出 `resolveWorkspaceRootMode`
    —— core 与 cli **共享的路径/根模式原语**
  - `cliModuleBoundary.test.ts:84` 甚至在**测试** `cliWorkspaceModule` 的这个导出
    → **该越界已被写进测试，成了事实契约**

**[E-命名-2] `presentation/sidebar/` 的 20 个长复合文件名**
- 回报称违反 `file-placement-and-naming.md` 的命名规则，且无脚本检查

**[E-重复-11] 两套文本布局栈并存，sidebar 侧按 **code unit** 而非**显示宽度**截断 —— 已核验（回报自标"置信度中"，主代理核实为**确定的实现差异**）**

- **`presentation/tui/text/layout.ts`（宽度感知）**：导出 `truncateToWidth`(`:16`)、
  `truncateToWidthWithMode`(`:24`)、`widthPad`(`:41`)、`padToWidth`(`:46`)、`wrapToWidth`(`:61`)、
  `truncateToVisualLines`(`:92`)，内部用 `visibleWidth` / `sliceWithWidth`
- **`presentation/sidebar/sidebarPanelRenderer.ts`（自建、按 code unit）**：
  `wrapOrTruncate`(`:88`)、`truncate`(`:171`)、`clampInteger`(`:182`)、`boxLine`(`:159`)
- **实测两份 `truncate` 的实现差异（决定性）**：
  ```ts
  // sidebarPanelRenderer.ts:171  —— 按 code unit
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxWidth) return compact;          // String.length
  return `${compact.slice(0, maxWidth - 3)}...`;          // slice 按 code unit

  // tui/text/layout.ts:16  —— 按显示宽度
  if (visibleWidth(line) <= cells) return line;
  return sliceWithWidth(line, 0, cells - 1).text + ELLIPSIS;
  ```
- **可观察后果**：CJK 字符（`visibleWidth` = 2，`.length` = 1）与 emoji 在 sidebar 面板中
  **会被放行到超出预算的宽度**，而 TUI 其余部分正确按列截断。
- **校验器也用了错误的度量**：`sidebarPanelQuality.ts:38`
  `outputWidthRespected: lines.every((line) => line.length <= maxWidth)`
  —— 即**质量检查本身按 `.length` 判定**，故它对 CJK 溢出**会给出 pass**。
  （这与 E-死-1 的发现叠加：该校验器既只被测试调用，又用错度量。）
- 建议：sidebar 改用 `tui/text/layout.js` 的 `wrapToWidth`/`truncateToWidth`；
  `sidebarPanelQuality` 的宽度检查改用 `visibleWidth`
- 置信度：**高**（两份实现已逐行比对；CJK 溢出的具体行数未做运行时验证，但机制确定）

### 15.5 模块划分与耦合

**[E-重复-10] `setActiveNonInteractiveApprovalMode` 在 11 个接口中重复声明、多处手写透传 —— 已核验**
- 主代理实测全仓 **43 处**出现（排除测试），分布在 **11 个文件**：
  | 文件 | 声明 | 透传 |
  |---|---:|---:|
  | `entrypoints/cliRuntimeModule.ts` | 4（`:53,195,315,467`） | 6（`:102,274,298,391,434,502`）|
  | `cli/print/printModeRouter.ts` | 1（`:27`） | 2 |
  | `cli/interactive/interactivePromptRunner.ts` | 2（`:24,69`） | 2 |
  | `cli/interactive/interactiveCommandRouter.ts` | 1（`:55`） | 2 |
  | `cli/print/replayModeRunner.ts`、`cli/interactive/interactiveLoop.ts`、`lineLoop.ts` | 各 1 | 各 1 |
  | `cli/bootstrap/cliProcessRunner.ts` | 0 | 2（实现处 `:155,181`）|
- **回报的关键证据已核实**：`cli/interactive/interactiveMode.ts:72` 是**唯一可选**声明
  （`?:`），而 `:429-430` 用 `?? (() => {})` **兜底吞掉**：
  ```ts
  setActiveNonInteractiveApprovalMode:
    this.options.setActiveNonInteractiveApprovalMode ?? (() => {}),
  ```
- 影响：新增一个上下文需要改 11 个接口 + 多处透传，**漏改任一处不会报错**
  （被 `?? (() => {})` 静默吞掉）→ 审批模式可能在整个 print 路径上失效而无任何信号
- 建议：定义统一的 `CliTurnContext`（或 `ApprovalModeSink`）类型，各接口引用它；
  **删除 `interactiveMode.ts:429-430` 的 `?? (() => {})` 兜底**，让漏传变成编译错误
- 置信度：**高**（43 处逐条实测）

**[E-模块-1] 8 个 >400 行枢纽文件**

**[E-模块-1] 8 个 >400 行枢纽文件**
- 最大 `entrypoints/cliApprovalModule.ts` **736 行**（`createCliEscalationPromptHandler` 单函数约 **545 行**）
- `cli/interactive/interactiveMode.ts` 618 行（`InteractiveMode` 单类 ~25 字段 ~20 方法）
- `core/commands/registry.ts` 618 行（54 命令定义，**每个条目重复
  `kind`/`availability:'available'`/`enabled:true`/`bridgeSafe` 四个常量字段 ≈ 200 行样板**）

**[E-耦合-1] `registry.ts` 的 argumentHint 与 `SUBCOMMAND_VALUES` 双真值源**
见 E-重复-8。

### 15.6 回报纠错（主代理实测）

**⚠️ BlockE2 称发现 2 个 import 环，实测两个都不成立。**

| 声称的环 | 实测 |
|---|---|
| `entrypoints/cliApprovalModule.ts` ↔ `cli/approval/cliApprovalEscalationBridge.ts` | **不成立**。`cliApprovalEscalationBridge.ts:6` → `cliApprovalModule.js`（value，存在）；但反向 `cliApprovalModule.ts` 对 `cli/approval/` 的 value 边**只有 `permissionScope.ts`**，而 `permissionScope.ts` **不引用** `cliApprovalEscalationBridge` 或 `cliApprovalModule`（已 grep 确认）。**单向，非环。** |
| `cli/approval/cliApprovalAuditBridge.ts` ↔ `entrypoints/approvalPromptBridge.ts` | **不成立**。`cliApprovalAuditBridge.ts:1-4` 全是 `import type`（type 边不计）；`approvalPromptBridge.ts` grep `cliApprovalAuditBridge` **零命中**。**无环。** |

**与门禁一致**：`npm run verify:import-cycles` 实测 **runtime 0 / type-only 0**（1,435 文件）。
主代理另用 Tarjan 在**文件级**独立复算（value 与 value+type 两种口径）：
**SCC > 1 = 0**。故回报的"2 个环"是**把单向 value 依赖 + 反向 type 依赖误读为环**。

**其余需修正的计数**：

| 项 | 回报称 | 实测 |
|---|---|---|
| `cliSessionModule.ts` | 363 行 | 363（一致）|
| `cliPermissionModule.ts` | 156 行 | 156（一致）；回报自注"任务给定的 400 行量级与实测不符"，**该自我更正正确** |
| `presentation/tui/editor.ts` | 463 行 | 463（一致，已知 monolith）|
| `core/commands/` 跨域文件数 | 23 | 未逐一复核；§3 的 127 条 value 边结论不变 |

### 15.7 pi 对照（区块 E 相关，均给 pi 侧 `file:line`）

| # | pi 机制 | pi 证据 | 本仓差距 | 建议 |
|---|---|---|---|---|
| 1 | 命令注册表是**服务**（`register`/`replace`/`list`/`subscribe`，支持返回 dispose 与热替换） | `coding-agent/src/experimental/services/slash-commands.ts:22-28,30`；实现 `slash-commands-provider.ts:24-75` | 无——每次 `createCommandRegistry` **重建整个 Map**（`registry.ts:59`）；54 个命令全部**内联在 618 行数组字面**中 | **只取"命令定义分文件"**，不引入 pi 的 facet 容器（本仓无等价设施）。按已有 `group` 字段拆到 `core/commands/definitions/` |
| 2 | 参数解析是**单趟 for 循环 + 位置游标**，天然支持重复 flag、`--` 终止符，**未知 flag 记入 `diagnostics`** | `coding-agent/src/cli/args.ts:67-123`；消费 `main.ts:602` | `entrypoints/cliArgs.ts`（**431 行**）用 **7 处 `indexOf`** 逐 flag 扫描（主代理实测 `:189,194,206,211,313,317,334`；回报称 6 处，实为 7）；未知 flag **静默忽略**（`:376-399` 的 `if (token.startsWith("-")) continue;`） | 取"单趟遍历 + 未知 flag 诊断"；保留字表改为从 registry 派生（同时解决 E-重复-8） |
| 3 | **入口依赖预算门禁**：`check-entry-graphs.mjs` 对每个 entry 强制 `maxFiles` + `forbid` 路径前缀；只算 value import | `scripts/check-entry-graphs.mjs:1-10,28-42` | 本仓有 `verify:import-cycles` 与 `analyze:module-facades`，**无入口依赖预算** | 加等价脚本，规则设为**渐进式**：先禁 `entrypoints/` **新增**对 `cli/` 实现的 value import，列出当前豁免。**否则会立即失败**（现存 6 条） |
| 4 | 内建命令 23 个，completion 从单一表投影 | `coding-agent/src/core/slash-commands.ts:19-43`；投影 `interactive-mode.ts:641-645` | 本仓**已更好**：`slashCommandRegistry.ts:39-49` 的注释说明"display registry is a projection of the dispatch registry"，并配双向断言测试 | **不需要学**。回报明确判定本仓此点优于 pi，**该自我判断正确** |
| 5 | `AGENTS.md` 含"**No inline imports**"等可执行风格约束 | `~/projects/pi/AGENTS.md:20-40` | 本仓 `agent-rules/` 更工程化（有 thin-facade 4 条可测判据 + 脚本） | 记录差异即可 |

### 15.8 处置建议（按性价比）

| 序 | 动作 | 依据 | 风险 |
|---|---|---|---|
| 1 | 删 2 处 `renderProjectedLines` 副本，改导入 `cli/output/projectedLineRenderer.js` | E-重复-1 | **低** |
| 2 | 删 `modelCommandRuntime.ts:484` 的 `parseArgsWithFlags` 私有副本 | E-重复-2 | **低** |
| 3 | 删 `modelCommandRuntime.ts:538/557/562/586` 与 `localCommandRuntime.ts:156` 的重复 norm/判定 | E-重复-6,7 | 低 |
| 4 | 收口 7 份 `normalizePathForCompare` + 4 份 `toRelativeTime`（需先定 owner） | E-重复-3,4 | 中 |
| 5 | 裁决 sidebar Quality 三模块 + EventBridge（约 440 行）的去向 | E-死-1 | 中（测试基建 vs 删除，**不可兼得**）|
| 6 | 删 `shellActionRuntime.ts` 三个死导出 + 连带 `cliDisplayProjection.ts` 四个格式化器 | E-死-2 | 中（消费者仍在，需一并清理）|
| 7 | 修 `cliArgs.ts:68` 与 `:124` 的**重复保留字** `/memory` | 15.2 | **低** |

> **主代理实测保留字表**：`entrypoints/cliArgs.ts` 的 `RESERVED_SHELL_SLASH_COMMANDS`
> 含 **99 个条目、98 个唯一值** —— 唯一重复项确为 `/memory`（`:68` 与 `:124`）。
> `Set` 去重使其行为无害，但印证该表是**手工堆叠**的（回报判断正确）。
| 8 | 命令元数据收敛为单真值源（registry 派生 `SUBCOMMAND_VALUES`） | E-重复-8 | 中 |
| 9 | 按 `group` 字段把 registry 的 54 命令拆到 `core/commands/definitions/` | 15.7-1 | 中（约 10-15 新文件）|

### 15.9 回报中**未经主代理复核**的项（诚实标注）

下列条目来自回报，主代理**未逐条核对**，记录时保留原样但标记为未核验：
- ~~「`cli/` 有 19 处 import 回 `entrypoints/`」的总数~~ —— **已复核并更正为 28 条**（value 23 + type 5），见 §15.1
- ~~「`setActiveNonInteractiveApprovalMode` 在 11 个接口中重复」~~ —— **已复核为 43 处 / 11 文件**，见 §15.5 E-重复-10
- ~~「`presentation/tui/text` 与 `sidebarPanelRenderer` 两套布局栈」~~ —— **已核实并升为高置信度**，见 §15.4 E-重复-11
- 「`core/commands/` 有 23 个生产文件含跨域 import」（§3 的 127 条 value 边结论独立成立）
- 「`presentation/surface/` 为空目录但仍在规则示例中」（E-命名相关，未复核）

---

## 16. 区块 H / I / J 的重复实现（主代理机械扫描，2026-09-19）

> 这三个区块的完整子代理回报尚未派出；本节给出**主代理跨区块哈希扫描**中落在
> 这三个区块内的结果（方法同 §12：`function` 声明式、逐字节比对、跨文件、≥3 行）。
> **死代码部分已见 §14。** 本节只补重复实现。

### 16.1 区块 H 工具执行与 harness（`core/tools/ tools/ runtime/ core/harness/`）

**块内自成组的重复（全部在 `core/harness/` 内有 `*Assertions.ts`）**：

| 组 | 份数 | 行 | 位置 |
|---|---:|---:|---|
| `requiredText` | 3 | 4 | `core/harness/agentCliScenarioAssertions.ts`、`core/harness/agentScenarioAssertions.ts`、`core/harness/browserExecutionReceiptAssertions.ts` |
| `hasRawContentOrSecrets` | 2 | 8 | 同上首尾两者 |
| `requiredSection` | 2 | 4 | 同上首两者 |

**已核验**：三份 `requiredText` 函数体 **sha256 前 12 位同为 `8daeee558965`**。

**跨区块组（H 有一份，其余在别处）**：

| 组 | 份数 | 位置（H 内 → 外） |
|---|---:|---|
| `deepFreeze` | 13 | **H 内 6 份**（`runtime/events/projection.ts:2998`、`runtime/events/stream.ts:168`、`runtime/extensions/lifecycle.ts:374`、`runtime/resources/descriptor.ts`、`runtime/resources/inventory.ts`、`runtime/resources/projection.ts`、`tools/policy/interception.ts`、`tools/toolCallBatch.ts`）→ 外 `context/`、`policy/`、`provider/`、`session/` |
| `freeze` | 13 | H 内 `tools/toolOutcomeBundle.ts` → 外 `context/rebuildInput.ts:194`、`evidence/host/proof.ts:48` 等 |
| `sanitizeText` | 6 | H 内 `tools/toolOutcomeBundle.ts:271` → 外 `edit/sanitize.ts:36`、`turn/*`（**§12.2 的 6 份之一**）|
| `sanitizeId` | 4 | H 内 `tools/toolHandoff.ts:195`、`tools/toolOutcomeBundle.ts:264` → 外 `turn/deliveryPolicy.ts:124`、`turn/nextTurnBundle.ts:328` |
| `sanitizeWithTracking` | 3 | H 内 `runtime/resources/inventory.ts:518`、`tools/policy/interception.ts:370` → 外 `policy/resourceTrustPolicy.ts:120` |
| `isPrivateNetworkHost` | 3 | H 内 `core/harness/browserPublicReadOnlyWebSmokeConfig.ts:151` → 外 `browser/publicReadOnlyWebManifest.ts:375`、`browser/publicReadOnlyWebPolicy.ts:168` |

**新发现的具体项**：
- `stableId(prefix, parts)` 在 `runtime/resources/inventory.ts:557` 与
  `tools/policy/interception.ts:397` 各一份，**签名逐字节相同**
- **`runtime/resources/` 子树有 4 份 `deepFreeze`**（`descriptor.ts`、`inventory.ts`、
  `projection.ts` + `runtime/events/*` 2 份）→ 同一子域内 6 份，是该区块最密集处
- `runtime/resources/inventory.ts` 与 `runtime/resources/projection.ts` 均**已判不可达**（§14.1），
  故其重复副本属"死代码内的重复"——**收口的优先级应排在活文件之后**

### 16.2 区块 I 规划与工作流（`planning/ core/workflow/ workflow/ core/research/ core/models/ core/subagents/`）

**块内重复极少（仅 1 组）**：
- `tail` / `trim`（3 行，2 份）：`core/workflow/runner.ts` → 外 `core/commands/loopCommandRuntime.ts`

**同名不同体的函数（非重复，但需注意）**：
- `planning/handoff/mutation.ts:613` `isReadOnlyTask(taskKind: string)`
- `planning/runtime/support.ts:143` `isReadOnlyPlanningTask(taskKind: ContextEngineResult[...])`
- 两者**输入类型不同**（`string` vs 具体 union），**属同名碰撞而非重复**；
  但 `isReadOnlyPlanningTask` 的入参是 `ContextEngineResult["workflowPlan"]["taskKind"]`，
  即它依赖 `context/` 的类型 —— 这是 §4「planning ↔ context 双向」的又一处具体表现

**观察**：区块 I 的重复密度**显著低于 H 与 G**（1 组 vs 9 组 vs 56 组中的多数）。
这与 §14.6 的死代码分布一致：I 的问题主要是**不可达**（14 文件 / 1,705 行），而非重复。

### 16.3 区块 J 小域与支撑

**块内重复：0 组。** `eval/`、`observability/`、`core/{auth,hooks,mcp,messaging,paths,security,skills,state}/`
在本次扫描中**无逐字节重复的函数体**。

**但跨区块组有 3 处（J 内一份 + 外部）**：

| 组 | 份数 | 位置 |
|---|---:|---|
| `normalizeBaseUrl` | 4 | J 内 `core/auth/providerAuthRuntime.ts:250` → 外 `config/runtimeConfig.ts:432`、`core/commands/authCommandRuntime.ts:268`、`core/shell/providerCredentials.ts:253` |
| `normalizeConnections` | 2 | J 内 `core/auth/providerAuthRuntime.ts:225` → 外 `core/commands/modelCommandRuntime.ts:538` |
| `normalizeOptional`（J 内为 `normalizeOptionalString` 一族） | 3 | 见 §12.4 |

**即 `core/auth/providerAuthRuntime.ts` 是 `normalizeBaseUrl`/`normalizeConnections` 的源头之一**，
而 `core/commands/*` 与 `core/shell/*` 各抄一份 —— 这三处正是 `AGENTS.md` 所说
"core 不得依赖 feature 域"之外的**另一类问题**：**core 内部横向重复**。

### 16.4 与 pi 的对照

pi 的 `packages/agent/` 中，同类工具函数（`freeze`/`deepFreeze`/文本规范化）**共 2 处定义**
（§12.5 实测）。本节三个区块的 9 组 / 40+ 副本与本仓整体一致：
**问题不在某个区块，而在全仓没有"工具函数放在哪"的单一归属**。

### 16.5 口径与边界

- 本节覆盖的是**逐字节相同**的 `function` 声明；**箭头函数未纳入**，故是下界。
- **未裁决任何一条**。特别地：`normalizeBaseUrl` / `normalizeConnections` 的四处
  可能因"读 config"与"写 config"语境不同而合理独立（同 §12.6 对 `toRelativeTime` 的保留）。
- 区块 H/I/J 的**命名与位置**、**模块划分**、**耦合度**三类问题**尚未系统探索**，
  不在本节范围；如需，应另派子代理。

---

## 17. 区块 B 回报（`session/ core/session/ core/shell/`，127 文件 / 19,429 行）——逐条核验后记录

**核验状态**：已核验项由主代理亲手复核。**最重要的一条经核验后需加限定**（§17.4）。

### 17.1 结构性判断

**[B-结构-1] 三个目录之间**无文件级双向依赖** —— 已核验**
- `session/` 对 `core/shell/` 的 import：**0 条**（依赖是单向 `core/shell → session`）
- 与 §4 的 Tarjan 文件级 0 环结论一致
- **回报的洞察**：`session/` 是本区块**边界最健康**的域 —— 单向被依赖、
  只依赖 `core/` 三个子域、无内部成环（除 `lifecycle/ ⇄ agent/`，由纯转发层造成）

### 17.2 重复实现（均已核验）

**[B-重复-1] `compactText` 五份逐字节相同 —— 已核验（哈希一致）**
- `session/continuityFormatter.ts:376`、`session/recovery/resumeContextBuilder.ts:596`、
  `session/continuationEvidenceParity.ts:146`、`session/continuation/stoppedSessionContinuity.ts:271`、
  `session/sessionContinuityModule.ts:425`（后者名为 `compactContinuityText`，**已导出**）
- 主代理实测：**五份函数体 sha256 前 12 位同为 `410e4adce50e`**
- 影响：截断语义（`\s+` 折叠 + `max` 处 `...`）在 5 处各自演化；分叉只在
  **跨层文本对比**（prompt continuity ↔ failure handoff ↔ evidence parity）时才可见
- 建议：删 4 份私有副本，统一 import 已导出的那一份

**[B-重复-2] `decodeCompactTaskState` 与 `extractTaskStateFromMemory` 是同一函数两份 —— 已核验**
- `session/recovery/sessionRecoverySnapshot.ts:92-101` ↔
  `session/continuation/sessionContinuitySnapshot.ts:293-302`
- 主代理逐行比对：**三层 null/Array 守卫 + `decodeQueryRuntimeTaskState` 调用完全同形**，
  差异仅在变量命名（`root.continuity` vs 直接取 `continuity`）
- 两者都解码 `workingMemory.continuity.taskState`；写入侧只写一个（`continuation/compactSummary.ts`）
  → 任一侧放宽/收紧守卫，另一侧**静默漏读**

**[B-重复-3] `deepFreeze`/`freeze` 六份，其中一份缺短路 —— 已核验**
- `session/sessionTreeProjection.ts:499`、`session/continuation/readiness.ts:249`、
  `session/replay/state.ts:460`、`session/replay/host/facts.ts:64`、
  `session/schema/sessionThread.ts:187`、`session/store/host/state.ts:233`
- **关键差异（回报指出，与 §12.3 的两组语义吻合）**：`sessionTreeProjection.ts:499`
  **缺 `!Object.isFrozen` 提前返回**，其余五份有 → 已在冻结对象上重复遍历整棵子树

**[B-重复-4] approval 域的**三套** `- key: value` summary 行解析器 —— 已核验**
- `session/approval/memoryCodec.ts:180 projectApprovalSummaryFallback`（**读**，`unknown → ApprovalMemoryRecord|undefined`）
- `session/approval/auditProjection.ts:81 projectApprovalSummaryFallback`（**写**，`{currentSummaryEntries, approvalAudit} → string[]`）
- `session/permissionRequestMemoryCodec.ts:474 parseSummaryFields`（读，带 prefix）
- **主代理已核实**（§11.5 重-跨-2）：前两者**同目录同名、签名不同**，
  调用点靠 **import 路径**区分 → **新调用者按名字选函数会拿到行为完全不同的那个**
- 这是本区块**最容易出错**的一处

**[B-重复-5] 同名 approval 评分函数两套，且语义不同**
- `core/shell/approval/evaluator.ts:28 buildScope` ↔ `store.ts:44 buildScope`
- `evaluator.ts:32 buildCacheKey` ↔ `store.ts:40 buildCacheKey`
- `evaluator.ts:40 selectGrantBySelector` ↔ `store.ts:105 selectGrantBySelector`
- **主代理早前已裁决**（§11.5）：三对均为**同名碰撞**（签名不同）；
  且 `evaluator` 版**全套零消费者**（§11.1 A-重复-2 已记录 `evaluatePermission` 零生产消费者）
- **回报的新角度**：这是**已死的第二套协议**与活的那套**同名共存于同一目录**

**[B-重复-6] `normalizePathForCompare` 三份（`core/shell/` 内）+ `normalizeOptionalString` 三份**
- 前者：`core/shell/bootstrap.ts:58`、`runtimeContext.ts:295`、`startupSurfaceRenderer.ts:178`
  —— 与 §15.2 E-重复-3 的 7 份是**同一组**（主代理把 `core/shell/` 的 3 份与
  `entrypoints/` 的 4 份合并计为 7）→ **两节互相印证**
- 后者：`sessionContinuityModule.ts:436`（导出）、`session/permissionRequestMemoryCodec.ts:551`、
  `session/approval/memoryCodec.ts:288`

**[B-重复-7] 证据标记解析重复（置信度中，回报自标）**
- `session/sessionContinuityModule.ts:39` 解析 `read-delivered-lines:(\d+)`，
  `core/shell/sessionTerminalEvidence.ts:263` 再解析同一 pattern
- `session/continuation/stoppedSessionContinuity.ts:257` 解析 `write-effect:(...)`，
  `session/sessionContinuityModule.ts:461 normalizeWriteEffect` 又解析同一枚举
- 回报自标"行为分叉是推断"（前者大小写敏感、后者 `/i`）→ **保留为未验证**

### 17.3 死代码（均已核验）

**[B-死-1] `session/store/host/` + `session/replay/host/` 两整块孤岛 —— 已核验**
- `session/store/host/state.ts`（241 行，8 导出）、`session/replay/host/facts.ts`（72 行）
- 主代理实测：两目录之外对它们的引用 **0 条**（唯一内部边是 `facts.ts:1` 的 `import type`）；
  **两目录内无任何测试文件**（已 `ls` 确认，各只有 1 个 `.ts`）
- 无动态入口
- 影响：这是「host」命名引入的**第二套会话模型**（`HostSessionRecord` 自带
  `thread` + `lifecycle`）。其 `store/host/state.ts:106` 的
  `${id}:turn:${n}:${role}` 与 `schema/sessionThread.ts:183` 的 `${id}:turn-${n}`
  是**两种 entry 命名** → 同一会话在两条路径上得到不同 entry id
- 与 CB-005 的 host lane 同源

**[B-死-2] `session/sessionDagEngine.ts`（273 行）零生产消费者 —— 已核验**
- 消费者仅 `sessionDagEngine.test.ts:5`
- **回报的关键发现（主代理已核实）**：这是一个**与 pi 会话基质同构的完整实现**
  （`SessionHeader{version:3}`、`SessionDagEntry` 含 `message|compaction|branch_summary`、
  `firstKeptEntryId` 锚点裁剪、单文件 append-only JSONL），**但零生产路径**
- 而 `.wiki/log.md` 把它记为**已交付能力** → **文档与实际不符**

**[B-死-3] `session/store/threadState.ts` 五个导出零生产消费者 —— 已核验**
- 主代理实测：`grep store/threadState`（排除自身）在**生产代码中零命中**
- 影响：它是 `schema/sessionThread.ts` 的**唯一持久化入口**。它死了 →
  thread 分支/压缩只能经 `sessionStateSnapshot.ts:111-114` 的整体重写落地，
  而 `buildLinearSessionThreadSnapshot` **恒返回 `branches: [], compactions: []`**（已核验 `:98-99`）

**[B-死-4] `session/recovery/sessionReconciler.ts` 零消费者 —— 已核验**
- 仅 `sessionReconciler.test.ts:2` 引用
- 影响：「进程中断后为悬空 tool_call 补 synthetic 结果」这一保护**不在运行路径上**
- 回报自标「导致 400 需一次崩溃复现才能坐实，未运行」→ **保留为未验证**

**[B-死-5] `session/presentation/facts.ts` 零消费者 —— 已核验**
- 含硬编码 `/home/wang/.private-agents-real` 脱敏（与 `sessionTreeProjection.ts` 的同一字符串重复）
- 与**活的** `sessionResultParity.ts`、`actionableFailureContinuity.ts` 构成三套
  「从 CodingResultSummary 判定失败 kind」实现

**[B-死-6] 六层纯转发文件**
- `sessionPromptContinuity.ts`、`replay/sessionReplayFacade.ts`、`replay/sessionReplayRuntime.ts`、
  `replay/sessionRuntimeSeed.ts`、`continuation/sessionRootRebase.ts`、`sessionMetadataProjection.ts`
- **回报自曝的一处矛盾（值得记录）**：`sessionReplayFacade.ts` 存在的理由是隔离 `builder.ts` 内部名，
  但 `sessionReadSurface.ts:34` 仍**直接** `import type { RecoverySnapshot } from "./recovery/sessionRecoverySnapshot.js"`，**绕开了 facade**

### 17.4 ⚠️ 回报最重要的一条：branching 误标 —— **已核验，但需加限定**

**回报称**：`sessionTreeProjection.ts:156-158` 因 `stateSnapshot.thread` 存在就把
`branchSupport` 判为 `storage-backed`、`treeSupport` 判为 `branching`，
而 `branches` 数组恒空——**"当前的正确性缺陷"**。

**主代理核验（逐行确认回报的事实部分成立）**：
- `session/sessionTreeProjection.ts:156-157`（实测原文）：
  ```ts
  const branchSupport = input.stateSnapshot?.thread ? "storage-backed" : "not-proven";
  const treeSupport = input.stateSnapshot?.thread ? "branching" : "linear-path";
  ```
  —— **确实只看 `thread` 是否存在，从不检查 `branches.length`**
- `session/schema/sessionThread.ts:69-101` 的 `buildLinearSessionThreadSnapshot`
  确实**恒返回 `branches: []`、`compactions: []`**（已核验 `:98-99`）
- **该写入路径是活的**：`session/store/sessionStateStore.ts:50` → `buildSessionStateSnapshot`
  （`:111-114` 的 `thread: current?.thread ?? buildLinearSessionThreadSnapshot(session)`）
  → `writeJsonFileAtomic`；`sessionStateStore` 被 `sessionStore.ts:12`、`sessionStoreAccess.ts:40` 消费

**⚠️ 但必须加的限定 —— 该缺陷当前不可观察**：
- 主代理把相关文件逐一对照 `/tmp/unreachable.json`：
  | 文件 | 状态 |
  |---|---|
  | `session/sessionTreeProjection.ts` | **UNREACHABLE** |
  | `session/continuation/readiness.ts`（`branchGapStatus` 消费者） | **UNREACHABLE** |
  | `session/replay/state.ts`（照抄 `branchSupport`） | **UNREACHABLE** |
  | `context/sessionContextRebuildProjection.ts`（取 `branchSupport`） | **UNREACHABLE** |
  | `context/rebuildInput.ts` | **UNREACHABLE** |
  | `session/store/sessionStateStore.ts`（写盘） | reachable |
- 即 **`projectSessionTree` 的生产消费者是 `session/store/host/state.ts:192`（已死）**，
  其余全是 `import type` 或测试。**误标发生在一条不可达的投影链上。**

**结论修正**：这是一处**真实的逻辑缺陷（判据不完整），但当前不可观察** ——
属「一旦接线即成缺陷」，与 §10.4 耦合-3（`withFileMutationQueue` 绕过）同类。
**回报称其为"当前的正确性缺陷"是过度声称**；应表述为
**"潜在缺陷：判据只看字段存在性、不看数组内容；当前该链不可达故不可见"**。
- **修复成本仍是一行**：`sessionTreeProjection.ts:156-157` 加 `&& thread.branches.length > 0`
- 置信度：**高**（两侧代码与可达性均已实测）

**[B-结构-2] `core/shell/` 有 7 个文件不属于 shell —— 主代理部分核验**
- 回报列出：`providerReadiness.ts`(361)、`providerCredentials.ts`(341)、`providerFailureRedaction.ts`、
  `compaction.ts`、`approvalTrustPolicy.ts`、`approval/store.ts`、`approval/evaluator.ts`
- 主代理已核实其中 `providerReadiness.ts`、`providerCredentials.ts`、`compaction.ts` 的
  存在与体量（§11.1 A-重复-1、§15.6）
- **这与 §3「core 依赖 feature 域」的结论同源**：`core/shell/` 同时承载显示层、编排层、
  运行时，以及 provider/approval/compaction 的越界实现

### 17.5 pi 对照（区块 B 相关，均给 pi 侧 `file:line`）

**pi 的会话基质与压缩是同一条链**（`packages/coding-agent/src/core/session-manager.ts` +
`core/compaction/compaction.ts`），而本仓铺成 3 文件 + 5 层投影。四处具体差距：

| # | pi 机制 | pi 证据 | 本仓差距 | 成本 |
|---|---|---|---|---|
| 1 | 单文件 JSONL + **版本 header + 全量迁移函数** | `session-manager.ts:37` `CURRENT_SESSION_VERSION=3`；`:240` `migrateV1ToV2`；`:269` `migrateV2ToV3`；`:290` `migrateToCurrentVersion`；`:303` `migrateSessionEntries` | 三文件布局（`sessionFileLayout.ts:45-51`）；**`SessionMetadata` 与 `SessionStateSnapshot` 均无 `version` 字段**，`session/` 下 `grep migrate` **零命中** | 高（数据模型收敛）|
| 2 | 恢复 = **读文件重建上下文**（`buildSessionContext`） | `:343 buildSessionPath` → `:429 buildContextEntries`（按 `firstKeptEntryId` 裁剪）→ `:472` | 五层手写投影；`describeSessionReentry` 对**每个** session 重复建 recovery snapshot **3 次** + 读 transcript **2 次** | 中（回报称"本区块成本最低的高收益项"）|
| 3 | 压缩是**文件格式的一部分**（`CompactionEntry` 带 `firstKeptEntryId` 锚点） | `compaction.ts:147` `DEFAULT_COMPACTION_SETTINGS`（`reserveTokens`/`keepRecentTokens` **按 token**）；`session-manager.ts:76` `CompactionEntry`；`:449-463 buildContextEntries` | 两套压缩（已知）；**锚点混用**：`firstRetainedEntryId`(entry id) 与 `keptMessages`(计数) **同时存在**，写入侧只用计数，`firstKeptEntryId` 唯一调用者**从不传** | 高（需改 id 生成策略，见下）|
| 4 | 分支接上了生产 | `:1388 branch`、`:1409 branchWithSummary`、`:1441 createBranchedSession` | **两套都没接**（§17.3 B-死-2/B-死-3）；且活的落盘把 `thread` **误标为 branching** | 低（若只修投影判定＝一行）/ 高（若接 DAG）|

**pi 侧的一条关键差异（对第 3、4 条共同成立）**：pi 的 entry id 用 `generateId(byId)`（`:225`）
**随机生成并查重**；本仓用 `sessionTurnEntryId(sessionId, order)` 按**位置派生**
（`sessionThread.ts:183`，基于 `entries.filter(kind==="turn-message").length + 1`）。
**位置派生的 id 在 rewind（`SessionManager.ts:141-151` 直接 `sessions.turns = slice(0, keep)`）后
会与已落盘的压缩锚点冲突** —— 故「改用 entry 锚点」必须连 id 生成策略一起改。

**[B-结构-3] pi 的 core/feature 边界是**打包边界**，本仓只有目录约定 —— 回报的核心洞察**
- pi：`packages/agent` 与 `packages/coding-agent` 是独立 package，依赖方向由 `package.json` 强制
- 本仓：仅 `agent-rules` 三条准入规则，**无 CI 强制**
- **回报提出的低成本替代（值得记录）**：给已存在的
  `scripts/check-entry-graphs.mjs` 加两条断言 ——
  (1) `src/core/**` 不得 import feature 域（`config`/`observability`/`artifacts`/`model-adapters` 白名单）；
  (2) `src/session/**` 不得 import `src/core/shell/**`
- 但 **§15.7 已实测**：本仓**没有** `check-entry-graphs.mjs`（那是 pi 的脚本）；
  本仓只有 `verify:import-cycles` 与 `analyze:module-facades`。
  **回报把 pi 的脚本当成"已存在"是错的** —— 正确表述是"**新建**一个等价脚本"

### 17.6 回报纠错（主代理实测）

| 项 | 回报称 | 实测 |
|---|---|---|
| branching 误标的性质 | "**当前的**正确性缺陷" | **潜在缺陷**：判据确实不完整，但 `sessionTreeProjection.ts` 及其全部消费者**不可达** → 当前不可观察（详见 §17.4）|
| `scripts/check-entry-graphs.mjs` | "已存在，1 天前修改" | **不存在**（属 pi）；本仓只有 `verify:import-cycles` / `analyze:module-facades` |
| `session/` 文件数 | 126（回报正文） | **§14 实测 `session/` + `core/session/` + `core/shell/` 共 127 生产文件**（差 1，未深究口径）|
| `core/shell/` 文件数 | 25 | 未逐一复核 |

### 17.7 处置建议（按性价比）

| 序 | 动作 | 依据 | 风险 |
|---|---|---|---|
| 1 | 修 `sessionTreeProjection.ts:156-157` 的判据（加 `branches.length > 0`） | §17.4 | **低**（一行；且当前不可观察，纯防御）|
| 2 | 删 `session/store/host/` + `session/replay/host/`（313 行，零消费者零测试） | B-死-1 | 低 |
| 3 | 删 `session/sessionDagEngine.ts` + 修正 `.wiki/log.md` 的"已交付"表述 | B-死-2 | 中（需确认无路线计划）|
| 4 | 收口 5 份 `compactText` → 1 份 | B-重复-1 | **低**（哈希已证明同体）|
| 5 | 收口 `decodeCompactTaskState` / `extractTaskStateFromMemory` | B-重复-2 | 低 |
| 6 | 重命名 `approval/auditProjection.ts:81` 与 `memoryCodec.ts:180` 的同名导出 | B-重复-4 | **低**（纯改名，消除最易错点）|
| 7 | 删 `session/presentation/facts.ts` + `sessionReconciler.ts` + `threadState.ts` | B-死-3/4/5 | 中 |
| 8 | 裁决 `sessionDagEngine` vs `threadState` 二选一 | B-死-2/3 | 高（产品/数据模型裁决）|
