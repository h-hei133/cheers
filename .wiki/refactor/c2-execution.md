# C2 执行记录（2026-09-19）

> 执行 `c2-inventory.md` 中**无需裁决**的三项，并对剩余两项做深入分析。
> **全部验证通过**：`tsc` 0 错误 / 全量 **494 文件 2750 通过 0 失败** / 四门禁全过 / 真实 TUI 实机通过。

---

## 一、已执行的三项

### 1. 删 `runtime/events/host/envelope.ts`（106 行）

CB-005 删 host lane 时的遗留物。执行前按 `plan.md` §2.2 六项检查：

| 检查 | 结果 |
|---|---|
| 1 功能读审 | `HostEventEnvelope` 投影，把 `JsonRuntimeEventStreamEntry` 转成 host 事件信封 |
| 2 等价实现核验 | 无等价物；但**无消费者** |
| 3 消费者存活 | `grep HostEventEnvelope` = **0** |
| 4 动态入口 | 无 |
| 5 公共面 | 不在 `index.ts` |
| 6 scripts/ 字符串引用 | 无 |

**已删**（连空目录 `runtime/events/host/` 一并移除）。

### 2. R9：`session/__tests__/` 归并到 `test-utils/`

| 文件 | 去向 |
|---|---|
| `longSessionContinuityFixtures.ts` | → `test-utils/longSessionContinuityFixtures.ts` |
| `longSessionDurabilityProcess.ts` | → `test-utils/longSessionDurabilityProcess.ts` |

`session/__tests__/`（全仓唯一 `__tests__` 目录）**已消除**。

**同步更新的 4 处引用**：
- 3 个 import：`session/SessionManager.test.ts`、`core/shell/sessionRuntime.test.ts`、`cli-baseline.test.ts`
- **1 处动态路径字符串**：`session/longSessionDurability.test.ts:224-229` 的 `spawnSync` 路径
  （`src/session/__tests__/` → `src/test-utils/`）
- 2 个文件内部的相对 import 深度（`../../` → `../`）

**验证**：3 个相关测试文件 **97 项全通过**，含动态入口测试（`longSessionDurability` 2 项）。

### 3. 关闭 R10

`plan.md` §8.1 已标记 `❌ 已关闭`，理由见 `c2-inventory.md` §1（数据/引擎分层，非重复）。

---

## 二、剩余两项的深入分析

### R11 `eval/browser/`（114 行）— **建议保留原位**

**实测它确实在被使用，且不可替代：**

| 事实 | 证据 |
|---|---|
| 3 个测试真实调用它 | `runBrowserEvalBenchmark` + `createBrowserEvalBenchmarkReport` 在 3 个测试中被调用（共 29 项测试） |
| 它不是重复实现 | `benchmarkRunner.ts` 组合 `runBrowserActionLoopExecutor` + 期望匹配 + 打分；`benchmarkReport.ts` 产出结构化报告（`noProviderModelCalls` / `noPublicNetwork` 等断言字段） |
| 被测对象是活的 | `browser/actionContract.ts` 13 个生产引用者、`browser/actionLoopExecutor.ts` 3 个 |

**`c2-inventory.md` 中"语义已被 `evidence/harness/` 取代"的说法未获证实**——
本次未找到任何证据支持该论断。

**优点（保留）**：不动任何代码；3 个 browser 场景测试保持完整；
`eval/` 的语义（"评测"）与 `browser/`（"运行时"）分离，符合 owner-domain。
**缺点（保留）**：`eval/` 不在 `tsconfig.build.json` 的 `exclude` 中，
故会被 `tsc` 编译进 `dist/`，但它只被测试使用——**产出了生产不用的产物**。

**建议**：保留，但**把 `src/eval/**` 加入 `tsconfig.build.json` 的 `exclude`**
（与 `src/test-utils/**` 同等对待）。这是 1 行改动，消除"测试专用代码进入发布产物"。
**此项需你确认**（因为它改 build 行为）。

### `runtime/evaluation/task/` 5 文件（2,447 行）— **建议删除**

**发现比"零引用"更强的判据：它们的核心能力已经无法运行。**

`liveRun.ts:391` 的 `runTaskLiveReport` 需要
`dispatch: (command: unknown) => Promise<HostCommandResponse>`——
即**必须有一个 host runtime 来响应 host command 协议**。
而 CB-005 已删除 `runtime/api/host/runtime.ts`（唯一的 `createHostRuntime` 生产者）。

实测：`grep createHostRuntime` 在非测试代码中 = **0**。

**即：这 5 个文件不仅"无引用"，而且"无法被调用"**——
任何调用者都构造不出它要求的 `dispatch`。

**同时发现的更大问题（重要）**：

`index.ts` **公共面**导出的 `runtime/evaluation/model.ts`（`runEvaluationCase` /
`runEvaluationSuite`）与 `task/model.ts`（`runTaskAssessment` / `runTaskCase`）
**有完全相同的依赖**（都要求 `dispatch: ... => Promise<HostCommandResponse>`）。

**CB-005 前**，`index.ts` 同时导出 `createHostRuntime`（生产者）与这些消费函数。
**CB-005 删除了生产者，保留了消费者**——公共面上留下了一组**无法使用**的 API。

**这不是本轮引入的错误**，而是 CB-005 删除时未同步裁决的结果
（当时已记录为"三个待裁决的公共面问题"）。

**建议**：连同 `runtime/evaluation` 整体处置（见下），不要单独删 `task/` 那 5 个文件。

---

## 三、优缺点对照与建议

### 执行前 → 执行后

| 维度 | 执行前 | 执行后 |
|---|---|---|
| `__tests__` 目录数 | 1（全仓唯一孤例） | **0** |
| CB-005 遗留孤儿 | 1（`host/envelope.ts` 106 行） | **0** |
| R10 | 未决（前提错误） | **已关闭** |
| 全量测试 | 2750 通过 | **2750 通过**（不变） |
| 测试文件数 | 494 | **494**（不变） |

**优点**：
- 消除了全仓唯一的目录约定例外（R9），约定现在**无例外**
- 清掉 CB-005 的遗漏（`host/envelope.ts`）
- 关掉一个基于错误前提的待办（R10），避免将来有人照做
- **零测试损失**：97 项相关测试全通过，测试总数不变

**缺点 / 代价**：
- 3 个测试文件的 import 路径变长了一层（`../../test-utils/`）
- `test-utils/` 现在承载 2 个"可被 spawn 的进程入口"，语义上比纯 fixture 更重
  （但 `tsconfig.build.json` 已排除 `src/test-utils/**`，不会进产物）

### 两项待裁决的优缺点

| 选项 | 优点 | 缺点 |
|---|---|---|
| **A. 保留 `eval/` 并加 exclude** | 不动代码；browser 场景测试完整；产物更干净 | 改 build 行为（1 行） |
| **B. 删 `runtime/evaluation/task/` 5 文件** | 清 2,447 行无法调用的代码 | 公共面的 `runtime/evaluation` 仍在，问题只解一半 |
| **C. 整体处置 `runtime/evaluation`** | 一次解决公共面断链 | 需先裁决"评测能力是否保留"——这是产品决策 |

**建议顺序**：先做 A（1 行、低风险），再就 C 做裁决；
C 的裁决应回答：**"评测/基准能力是否要留在产品里？"**
- 若要 → 需恢复一个 host dispatch 生产者（即部分撤销 CB-005）
- 若不要 → 连同 `index.ts` 的 evaluation 导出一并删除
