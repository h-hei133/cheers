# CB-005 执行记录：删除旧路径的实测边界

> 记录本轮**实际执行**的结果。**代码已全部回滚**（工作树在 `af6f8fc0`，`tsc` 0 错误）。
> 本文是实测证据，不是完成声明。

---

## 0. 结论

**"直接删掉旧路径"在生产侧可达（tsc 0），但会破坏 13 个测试文件。**

我按 `plan.md` §2.2 六项检查完整执行了一遍：删 `runtime/loop` + host lane、
重接所有活路径调用点、清理公共面与门禁。结果：

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json` | **0 错误** ✅ |
| 全量测试 | **13 文件失败 / 3 项失败** ❌（基线为 0 失败） |

**按你的"不要破坏现有结构"要求，已回滚。**

---

## 1. 我上一轮测量的错误（重要，需更正记录）

`cb-005-o1-vs-o3.md` 写："会编译失败的**生产**文件仅 7 个"。

**数字对，但答错了问题。** 它只数了生产导入者。
`runtime/loop` 同时是**测试的 fixture / oracle 基础设施**。

| 问法 | 答案 |
|---|---|
| 删除后多少**生产**文件编译失败 | 7（其中 6 仅类型） |
| 删除后多少**测试**文件失败 | **13** |

---

## 2. 实际执行的动作（完整清单）

| 动作 | 对象 |
|---|---|
| 删除 | `runtime/loop/*`（12 生产 + 14 测试，13,208 行） |
| 删除 | `runtime/api/host/{runtime,io}.ts` + 测试 |
| 删除 | `cli/host/`、`runtime/distribution/` |
| **保留** | `runtime/api/host/contract.ts`（**纯类型**，被 `runtime/evaluation` 公共 API 需要） |
| 重接 | `core/shell/sessionTerminalState.ts`（去 4 个 loop 字段） |
| 重接 | `presentation/surface/{model,types,events,runtimeEvents}.ts`（删 6 个 loop-only section 函数） |
| 重接 | `runtime/events/projection.ts`（删 8 个从未填充的字段 + for 循环） |
| 清理 | `index.ts` 3 条导出、`scripts/verify-host-surface.mjs`、`--host-command` 开关 |

### 顺带确认的真实死代码

`runtime/events/projection.ts` 有 **8 个字段声明后从未被任何代码填充**，
全仓 `grep` 在 `projection.ts` 之外 **0 引用**：

```
loopFinalizationInputs / loopFinalizationDecisions / productLoopCloseoutInputs
productLoopCloseouts / productCompletionPackets / modelBoundaryPhases
providerStreamAdapters / responseReentryCycles
```

---

## 3. 测试为何会坏（根因，已逐文件核对）

**`runtime/loop` 的模块被 13 个测试文件当作 fixture builder，
而这些测试的**被测对象**是活模块。**

| 测试文件 | 被测对象 | 用 loop 做什么 |
|---|---|---|
| `core/shell/sessionRuntime.test.ts` | `sessionRuntime.ts`（**活**） | `runAgentLoopContract` 造输入 |
| `presentation/surface/model.test.ts` | `surface/model.ts`（**活**） | 5 个 loop 投影造输入 |
| `session/presentation/envelope.test.ts` | `envelope.ts`（**活**） | `PRODUCT_TRUTH_MATRIX` 12 用例 |
| `session/replay/state.test.ts` | `replay/state.ts`（**活**） | 同上 |
| `evidence/projection/repair/verdict.test.ts` | `verdict.ts`（**活**） | 同上 |
| `result/projection/repair/verdict.test.ts` | `verdict.ts`（**活**） | 同上 |
| `core/shell/cliSessionProductSurface.test.ts` | `cliSessionProductSurface.ts`（**活**） | 同上 |
| `runtime/events/{stream,projection}.test.ts` | 活 | loop 投影 |
| `runtime/evaluation/task/{liveRun,model}.test.ts` | 活 | `createHostRuntime`（12 处） |
| `smoke.test.ts` | 包公共面 | `createHostRuntime` |

**核心是 `truthMatrix.test.ts`（792 行）**：一个**产品真值矩阵**，
导出 `PRODUCT_TRUTH_MATRIX`（12 用例）+ `PRODUCT_TRUTH_NEGATIVE_CASES`，
被 **5 个活模块的测试**当 oracle 用。

---

## 4. 删除边界的精确测量

对 `runtime/loop` 的 26 个文件做**外部可达性**分析
（从所有 `runtime/loop` 之外的文件做正向闭包）：

| 类别 | 文件数 | 行数 |
|---|---:|---:|
| 被外部可达 | **13** | 7,383 |
| 外部不可达 | **13** | 5,825 |

**外部不可达的 13 个全部是 `.test.ts`**——即那 12 个生产模块**自己的单元测试**。

**这带来一个两难**：

- 删掉这 13 个测试 → `tsc` 仍 0 错误（已实测），但**12 个存活模块失去唯一覆盖**
- 不删 → 它们测的模块本身是被测试 import 的，删不掉

即：**`runtime/loop` 没有"可直接删除的子集"**——
要么删测试（丢覆盖），要么迁模块（重构）。

---

## 5. 因此正确的处置是"先搬迁，后删除"

`runtime/loop` 内部**混着两类职责**：

| 部分 | 内容 | 真实 owner |
|---|---|---|
| **A. provider 执行路径** | `providerBoundary`、`modelBoundary`、`providerStreamAdapter`、`contract`、`reentry` | 确实该删（生产零值导入） |
| **B. 产品真值投影** | `finalization`、`completionPacket`、`trajectory`、`adapter`、`infrastructure`、`phaseStatus`、`feature` + `truthMatrix.test.ts` | **不该删**——是活模块测试的 oracle；应迁到 `result/` 或 `verification/` 域 |

**B 与 provider 无关**：`finalization.ts` 与 `completionPacket.ts` 只 `import type`，
是纯计算。

### 建议顺序

| 序 | 动作 | 风险 |
|---|---|---|
| 1 | 把 B 组（含 `truthMatrix.test.ts`）迁出 `runtime/loop` 到真实 owner 域，测试随之改 import | 低（纯搬迁） |
| 2 | 删 A 组（provider lane） | 低 |
| 3 | 删 host lane（`runtime/api/host/{runtime,io}`、`cli/host`、`runtime/distribution`） | 中：`liveRun.test.ts` 12 处 `createHostRuntime` 需重写 |
| 4 | 更新 `index.ts` / `verify-host-surface` / `--host-command` | 需裁决（三问已记录） |

**关键**：第 1 步不做，第 2、3 步就会破坏 13 个测试文件——本轮已实测。
