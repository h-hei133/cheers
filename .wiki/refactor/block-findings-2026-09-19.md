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
