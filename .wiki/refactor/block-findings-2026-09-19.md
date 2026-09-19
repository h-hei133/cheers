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

## 6. 全仓可达性普查：**276 个生产文件 / 60,006 行从任何入口不可达**

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

### 最大连通簇：61 文件 / 15,320 行（`context` + `planning` + `evidence`）

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

**与 CB-005 的关系**：它是同一类孤立，但**规模大 12 倍**（CB-005 删了 69 文件 / 23,631 行，
其中生产效率部分小得多）。CB-005 的入口是 host lane；这一簇的入口曾是
`orchestration/`（Step 4 已解散），此后无人接管。

**置信度**：高（判定方法可复核，且有"0 条进入边"的强证据）。
**处置需裁决**：删除、还是接管——**这不属于本轮探索的结论**，本轮只报告事实。

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
## 9. 子代理回报（进行中）

| 区块 | 负责 |
|---|---|
| A 执行内核 | `BlockA2`（scout） |
| G 编辑验证结果 | `BlockG2`（scout） |

上一轮 `BlockA`/`BlockD` 因**额度耗尽**失败，无产出；已改名重派。

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

**[重复-4] `freeze`/`deepFreeze` 在区块内重定义 **16 次**，且有两套语义**
- 16 处：`repair/handoff/boundary.ts:728`、`repair/handoff/readiness.ts:237`、`repair/loop/model.ts:293`、
  `verification/result/boundary.ts:799`、`verification/execution/model.ts:167`、`verification/selection/model.ts:280`、
  `evidence/host/proof.ts:48`、`evidence/projection/mutation/proof.ts:98`、`evidence/projection/repair/verdict.ts:131`、
  `evidence/savepoint/model.ts:343`、`evidence/task/proof.ts:261`、`result/host/verdict.ts:55`、
  `result/projection/mutation/verdict.ts:57`、`result/projection/repair/verdict.ts:178`、`result/task/verdict.ts:50`、
  `policy/resourceTrustPolicy.ts:163`
- 影响：**两套语义** —— `Object.isFrozen` 短路递归版 vs 无短路浅冻结版
  （`evidence/task/proof.ts:261`、`result/task/verdict.ts:50`）。即嵌套数组在后者**并未冻结**，
  同一"裁决产物不可变"的契约被两套实现兑现。

**[重复-5] 同一组 8 个"缺失证明"谓词被推导三遍**
- 第一遍 `evidence/projection/repair/verdict.ts:89-105`（`missingProofItemsFor`）
- 第二遍 `result/projection/repair/verdict.ts:97-175`（`claimsFor`）—— 从**扁平字段重判**同一组，
  而不是读刚收到的 `input.proofInput.missingProofItems`
- 第三遍 `repair/handoff/readiness.ts:181-201`
- 影响：三处独立判据，漏改一处即在不同层给出**互相矛盾**的 missing 列表；
  而 `readiness.ts:120-131` 又把三份 `notProvenClaims` 拼接，矛盾被稀释而非暴露。

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

**[模块-2] `repair/handoff/boundary.ts` 有 21 个函数名（>20 上限），但不在 judge 报告中 —— 已核验**
- 实测：`grep -cE "^export (async )?function |^function "` = **21**
- `.normproof/out/verdict.json` 的 `declared_functions_within_module_ceiling` 列出 12 个模块，
  5 个具名（`cli-baseline.test.ts`、`core/query/runtime/harness.ts`、`core/query/runtime/policy.ts`、
  `core/shell/sessionTerminalState.ts`、`edit/multifile/model.ts`）+「and 7 more」，
  **grep 该文件在该 obligation 的全部输出中命中 0 次**
- 即 judge 判据对**裸函数声明**存在漏报（但 `analyze:module-facades` 另报 `harness.ts` 32 名，
  说明两个工具的计数口径不同）
- **置信度**：中（观测到"未出现在报告中"，但未直接运行 judge 复现其计数）

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
| **"外部结果未知"是一等字段** | `harness/runtime/drive/tools.ts:44-45` `INTERRUPTION_MARKER`；`:150-184` aborted/truncated outcome | `verification/result/projection/mutation.ts:129-146` 用 **5 处 `reasonText.includes(...)` 子串嗅探**从散文里猜状态 |
| **失败是可穷尽匹配的类型** | `harness/result.ts:1-16` `Result<T,E>`；`:53-88` 13 个具名错误类；`:107-115` `matchError` | 本区块**无任何 tagged error**；失败以字符串进 `notProvenClaims: readonly string[]`，靠 `includes()` 判定（`repair/loop/model.ts:126-152` 6 条字符串比较） |
| **工具执行是带重校验的四段管线** | `harness/execution/tools.ts:78` prepare → `:101` beforeDecision（**重校验**）→ `:125` execute → `:161` finalize | 本区块是 edit 与 recovery **各自一份**；无 after-tool 补丁段，无 aborted 合成结果 |

**最便宜的两条**（不依赖上游裁决）：
1. 重复-4：16 处 `freeze` 收口到 `edit/sanitize.ts:68` 的递归版，顺带修两处浅冻结
2. pi-2：删 `verification/result/projection/mutation.ts:129-146` 的 5 处 `reasonText.includes`，
   改消费已有的 `writeEffect` / `writerStarted` / `routeBlocker` 字段

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

### 11.6 回报纠错

BlockA2 在「重复实现-4 actionable blocker」条目中称**两条链都在跑**。实测（`/tmp/unreachable.json`）：
`assembly.ts`、`runtimeOutcomeProjection.ts`、`context/acquisition/graph.ts` **三者均在 276 不可达集内**，
故窄版链**不可达**。BlockG2 对该链的判定正确。本节已按实测更正。
