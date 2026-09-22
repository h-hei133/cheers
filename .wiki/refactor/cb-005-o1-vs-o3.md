# O1 / O3 代价对照（CB-005 处置裁决用）

> 本文是 `cb-005-initiation.md` §5.1 第 2 步的产出：把「删旧路径（O1）」与「只补缺口（O3）」
> 的代价并排列出，供裁决。**零代码改动**，全部为实测。
> 命名：O1/O2/O3 是 CB-005 内部的三个处置方案，**与 `plan.md` 的阶段 A/B/C 无关**。

---

## 0. 测量方法（先验证工具，再采信数字）

| 工具 | 用途 |
|---|---|
| 复刻 `scripts/analyze-boundaries.py` 的可达性定义 | 与仓库既有口径一致 |
| `scripts/check-import-cycles.mjs` 的解析教训 | **路径与 specifier 必须都 `path.resolve` 后比较** |

**本次测量中我自己犯并修正的一个错误**（记录以免重犯）：
第一版闭包测量用「无 importer 即孤儿」作为判据，得出 **607 个孤儿**。
该判据是错的——**测试文件是入口**（vitest 按路径运行），脚本也是入口。
改用「从真实入口不可达」后，同一删除只孤立 **2 个生产文件**。
即：**错误判据把代价高估了 300 倍**。以下所有数字均出自修正后的判据。

---

## 1. O1（删旧路径）的精确范围

### 1.1 删除对象

| 对象 | 行数 | 说明 |
|---|---:|---|
| `runtime/loop/*`（非测试，12 文件） | **6579** | 生产零值导入 |
| `runtime/loop/*.test.ts`（14 文件） | **6603** | 随主体删除 |
| `runtime/api/*`（7 文件，含 3 测试） | **2449** | 唯一值导入者的整条 lane |
| **合计** | **≈15,631** | |

### 1.2 会编译失败的**生产**文件：7 个，共 25 个符号

| 文件 | 性质 | 需处置的符号 |
|---|---|---|
| `runtime/api/host/runtime.ts` | **值** ×2 | `runAgentLoopContract`, `AgentLoopContractProjection`, `createSyntheticModelBoundary` |
| `core/shell/sessionTerminalState.ts` | 仅类型 | `ProductLoopAdapterProjection`, `LoopTrajectoryProjection` |
| `presentation/surface/model.ts` | 仅类型 | 4 个投影类型 |
| `presentation/surface/types.ts` | 仅类型 | 4 个投影类型 |
| `presentation/surface/events.ts` | 仅类型 | 2 个投影类型 |
| `presentation/surface/runtimeEvents.ts` | 仅类型 | 2 个投影类型 |
| `runtime/events/projection.ts` | 仅类型 | `ProductCompletionPacket`, `LoopFinalizationDecision`, `LoopFinalizationInput`, `ProductLoopCloseoutInput`, `ProductLoopCloseoutProjection`, 2 个投影类型 |

**关键**：6 / 7 个是**纯类型**——`import type` 在 emit 时被擦除，**不产生运行时依赖**。
真正需要重新接线的只有 `runtime/api/host/runtime.ts` 一处。

### 1.3 连带孤立的**生产**文件：23 个

| 目录 | 文件数 |
|---|---:|
| `runtime/loop/*`（即删除对象本身） | 12 |
| `runtime/api/host/*` | 3 |
| `runtime/events/host/`、`runtime/events/stream.ts` | 2 |
| `evidence/host/`、`result/host/`、`session/replay/host/`、`session/store/host/` | 4 |
| `provider/response/synthetic.ts`、`repair/handoff/readiness.ts` | 2 |

**注意**：其中 5 个文件名带 `host`，属于同一条 lane——说明这条 lane 是**自成体系的一簇**，
不是散落在各域的通用能力。这与 §2.2「删除单元取连通分量整簇」的纪律一致。

### 1.4 受影响的**测试**

| 项 | 值 |
|---|---:|
| 会编译失败的测试文件 | **17** |
| 其中测试项（`it`/`test`）合计 | **169** |
| 占全量套件比例 | 169 / 3174 ≈ **5.3%** |

### 1.5 门禁与公共面影响

| 项 | 现状 | O1 下的后果 |
|---|---|---|
| `packages/ts-shell/package.json` 的 `main` | `./dist/packages/ts-shell/src/index.js` | `index.ts` 的 3 条导出指向 `runtime/api/host/*`，**公共 API 面缩水** |
| `index.ts` 本地导入 | 16 个模块 | 其中 `runtime/api/host/{contract,io,runtime}.js` **3 条失效** |
| `verify:host-surface` 门禁 | 断言 `createHostRuntime` / `projectHostJsonResponse` / `runEvaluationCase` 存在，并用 `providerMode:"real"` 断言必须被阻断 | **整条门禁失去对象**，需一并删除或改写 |
| `cli/host/runner.ts`（`--host-command` 开关） | 值导入 host lane | 该 CLI 开关失去实现 |

---

## 2. O3（只补缺口）的精确范围

O3 不裁决路径，只给 4+1 条死条件补生产者。涉及**生产**文件：

| 死条件 | 需要改动的生产文件数 | 明细 |
|---|---:|---|
| `provenance.toolExecutions` / `approvalDecisions` 无写入 | **7 处读取者**（其中 CLI 可达 5 处） | `core/shell/sessionTerminalEvidence.ts`、`presentation/surface/sections.ts`、`session/approval/sessionApprovalContinuity.ts`、`session/continuation/{sessionToolContinuity,stoppedSessionContinuity}.ts` |
| `lastActionResultSeed` 仅测试写入 | **16 个生产文件读取** | `core/query/runtime/{actionAuthority,harness,harnessClaims,observation,proof}.ts`、`core/shell/{recovery,sessionTerminalEvidence}.ts`、`result/projection/*`、`session/continuation/*`、`session/recovery/resumeContextBuilder.ts`、`session/sessionCompactModule.ts` 等 |
| `getSessionReceipts` 零消费者 | **2** | `core/hooks/builtin/{evidenceReceiptCollector,index}.ts` |
| `executionLane` 零读取者 | **2** | `planning/handoff/mutation.ts`（声明）+ `planning/runtime/engine.ts`（产出） |

**共享爆炸半径**：`CodingResultSummary` / `codingResult` 在 **40 个生产文件 + 25 个测试文件**中出现。
O3 的任何一项修补都要在这张网里做，且**必须先决定 `codingResult` 由谁生产**——
这正是 O1 要回答的问题。

---

## 3. 对照表

| 维度 | **O1 删旧路径** | **O3 只补缺口** |
|---|---|---|
| 删除/新增代码量 | 删 ≈15,631 行 | 新增生产者逻辑（量级未定，取决于 `codingResult` 由谁产出） |
| 需改动的生产文件 | **7 个**（6 个仅类型） | **≥27 个**（7+16+2+2，有重叠） |
| 受影响测试 | 17 文件 / 169 项（5.3%） | 0 删除；需为修补新增断言 |
| 公共 API 面 | **缩水**：`index.ts` 3 条导出失效 | 不变 |
| 门禁 | `verify:host-surface` 失去对象，需删或改写 | 不受影响 |
| CLI 开关 | `--host-command` 失去实现 | 不受影响 |
| 是否解决死条件 | **间接**：删掉旧 lane 后，`codingResult` 唯一生产者 `actionAuthority.ts` 也随之暴露（它同样零生产值调用者），多数死条件**自动消失** | **直接**：逐条补上 |
| 遗留的架构问题 | `turn/tools.ts` 的结构化出站通道缺口**仍在**（审批 operation/decision 仍被丢弃） | 同左——**O3 不触碰该通道** |
| 可逆性 | 低（大范围删除） | 高（增量） |
| 主要风险 | 删掉公共 API 面的一部分；需确认外部无消费者 | 在 40 文件网络上补生产者，可能补出一个**只有测试消费**的新孤儿（与 CB-001 同形） |

### 3.1 两者都不解决的问题

**`turn/tools.ts` 的缺口**：审批的 `{operation, decision}` 被取到（`:123`）、
用于拼一行文本（`:158-159`）、然后丢弃（`:173` 只返回 `{output}`）。

- O1 不修它（O1 只删旧路径）
- O3 也不修它（O3 补的是旧路径的消费方，不是 turn 的出站通道）

**若目标包含"审批 provenance 在活路径上可用"，则 O1 和 O3 都不够**——
那需要的是 O2 的一个**缩小版**：只在 `turn/` 内部打开出站通道，
不复活 `runtime/loop`。这一点在立项文档里未被单列，**本对照表补记**。

---

## 4. 结论

1. **O1 的代价比立项时的估计小得多**：立项文档写"需逐一判定 ~40 个 `CodingResultSummary` 消费者"，
   实测**真正会编译失败的生产文件只有 7 个，其中 6 个是纯类型**。
   40 是"触及该类型的文件数"，不是"删除会破坏的文件数"——两者不同。
2. **O1 的主要代价在公共面与门禁**，不在代码改动量：`index.ts`（package `main`）
   的 3 条导出 + `verify:host-surface` 整条门禁 + `--host-command` 开关。
   这三项**需要维护者裁决**，不是技术判断。
3. **O3 的代价被低估了**：它要在 40 文件网络上补生产者，且**不解决**
   `turn/tools.ts` 的结构化通道缺口——即"补完缺口"后，
   活路径仍然拿不到审批 provenance。
4. **建议**：先裁决 §4.2 的公共面三问（`index.ts` 是否保留 host 导出、
   `verify:host-surface` 去留、`--host-command` 去留）。
   三问有答案后，O1 只剩机械删除；若三问的答案是"都要保留"，
   则 O1 不成立，应改走 O3 + turn 出站通道的缩小版 O2。

---

## 5. 待维护者裁决的三个问题

| # | 问题 | 选项 |
|---|---|---|
| 1 | `index.ts`（package `main`）是否保留 `createHostRuntime` 等 host 导出？ | 保留（则 O1 不成立）/ 删除（则公共面缩水） |
| 2 | `verify:host-surface` 门禁去留？ | 保留（需重写为只验保留面）/ 删除 |
| 3 | `--host-command` CLI 开关去留？ | 保留 / 删除 |

**注**：三问互相绑定——若 1 保留，则 2、3 自然要保留，O1 的"删除"就只剩
`runtime/loop/*`（6579 行 + 6603 行测试），而 `runtime/api/host` 保留。
那种情况下 O1 变成"删 loop、留 host"，代价进一步下降。
