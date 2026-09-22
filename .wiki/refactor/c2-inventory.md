# C2 启动前盘点（2026-09-19）

> `plan.md` §8.2.2 要求"C2 启动前需重新盘点"。本文是盘点结果。
> **零代码改动。** 目的：给出可执行的 C2 项，并剔除已被证伪的项。

---

## 0. 结论摘要

| 项 | 原判 | 盘点后 | 可执行性 |
|---|---|---|---|
| **R8** 测试分离到 `test/` | 中风险（~1799 边） | **前提需重新裁决** | 风格决策，非缺陷 |
| **R9** `session/__tests__/` 归并 | 低 | **确认存在**（2 文件） | 可执行，低风险 |
| **R10** `theme/` 与 `themes/` 合并 | 低 | **❌ 前提被证伪** | **不应执行** |
| **R11** `eval/` 归并 | 低 | **确认只被测试引用** | 可执行，但需先裁决 |
| **新增** `runtime/events/host/envelope.ts` | — | **CB-005 遗留孤儿**（106 行，0 引用） | 可直接删 |
| **新增** `runtime/evaluation/task/` 5 文件 | — | **孤儿簇**（2,447 行，0 生产引用） | 需裁决 |

---

## 1. R10 前提被证伪 —— 不应执行

`plan.md` §8.1 原写"`presentation/theme/` 与 `themes/` 合并"。
**实测两者是分层关系，不是重复：**

| 目录 | 内容 | 职责 |
|---|---|---|
| `presentation/themes/` | `dark.json`、`light.json`、`index.ts`（25 行） | **数据 + loader**（`loadTheme` / `getDefaultTheme`） |
| `presentation/theme/` | `theme.ts`（176 行）、`commandHighlight.ts`（98 行）、`theme.test.ts` | **语义 token 引擎 + ANSI 降采样**（`ThemeColorToken`、转义序列） |

**依赖方向是单向的**：`theme/theme.ts:10` → `themes/index.js`。

即：`themes/` 是**配置数据**，`theme/` 是**消费它的引擎**。
合并会把"数据"与"处理数据的逻辑"塞进同一目录，违反 `AGENTS.md` 的 owner-domain 规则。

**结论：R10 应关闭（标记为"前提不成立"），不执行。**

---

## 2. R9 确认存在 —— 可执行

`session/__tests__/` 是**全仓唯一**的 `__tests__` 目录，含 2 个文件：

| 文件 | 性质 |
|---|---|
| `longSessionContinuityFixtures.ts` | **被 3 个测试引用**（`SessionManager.test.ts`、`core/shell/sessionRuntime.test.ts`、`cli-baseline.test.ts`） |
| `longSessionDurabilityProcess.ts` | **动态入口**——`session/longSessionDurability.test.ts:229` 用 `spawnSync` + 路径字符串启动它 |

**注意**：第 2 个是 `plan.md` §2.2 检查 #4 的**动态入口**案例。
`analyze-boundaries.py` 把它报为"零引用"，**是误报**（分析器不解析字符串路径）。

**处置**：两个文件都是测试基建，应移到 `test-utils/`（既有约定）或与 `session/` 下的
`.test.ts` 同层。**搬迁时须同步更新那 3 个 import 与 1 处字符串路径。**

---

## 3. R11 `eval/` 确认只被测试引用

`eval/browser/` 共 3 个生产文件（`benchmarkModel.ts` 21 行、`benchmarkRunner.ts` 44 行、
`benchmarkReport.ts` 49 行，合计 **114 行**）+ README。

| 检查 | 结果 |
|---|---|
| CLI 可达 | ❌ |
| 公共 API（`index.ts`） | ❌ |
| 脚本可达 | ❌ |
| 测试引用 | ✅ 3 个测试文件（`core/harness/browser*Scenario*.test.ts`） |

**但这 3 个测试的被测对象是活的**：`browser/actionContract.ts`（13 生产引用者）、
`browser/actionLoopExecutor.ts`（3 生产引用者）等。

即：`eval/` 是**测试专用的评测 harness**，不是死代码，但**不在生产面**。

**处置需裁决**：是迁到 `test-utils/`（承认它是测试基建），还是判定为"已验证的评测能力"保留原位。
`plan.md` 原判"语义已被 `evidence/harness/` 取代"——**该说法本次未获证实**，
`eval/` 仍在被 3 个测试实际使用。

---

## 4. 新增发现：2 个真孤儿簇

### 4.1 `runtime/events/host/envelope.ts`（106 行）

| 检查 | 结果 |
|---|---|
| 生产引用者 | **0** |
| 类型引用者 | **0** |
| 测试引用者 | **0** |
| CLI 可达 | ❌ |

**判定：CB-005 删除的 host lane 遗留物**（文件名 `host`、内容为
`HostEventEnvelope` / `schemaVersion: "host-event.v1"`）。
CB-005 删了 `runtime/events/host/` 的**其他**文件，漏了这一个。

**可**按 `plan.md` §2.2 六项检查后直接删。

### 4.2 `runtime/evaluation/task/` 5 文件（2,447 行）

| 文件 | 行数 | 生产引用者 |
|---|---:|---:|
| `liveRun.ts` | 1,399 | **0** |
| `catalog.ts` | 350 | **0** |
| `observation.ts` | 389 | **0** |
| `quality.ts` | 249 | **0** |
| `liveTypes.ts` | 65 | **0** |

**成因**：`liveRun.test.ts`（CB-005 时删除，因为它依赖 `createHostRuntime`）
是唯一引用 `liveRun.ts` + `catalog.ts` 的文件。删测试后，这 5 个文件成为孤儿。

**关键判定**：`task/model.ts`（**在 `index.ts` 公共面**）**不** import 它们，
`index.ts` 也不直接导出它们。所以它们**不在公共面**。

**但**：`plan.md` §2.1 规定删除授权依据是"职责已被活轨承担"，**不是可达性**。
这 5 个文件是"live task 运行报告"能力，需先判定该能力**是否已被 `task/model.ts` 承担**。

**处置需裁决**：删，还是把 `liveRun` 的能力并入 `task/model.ts`。

---

## 5. R8 的重新审视

`plan.md` 原判"测试是否分离到 `test/`（`pi` 形态）"，风险"中（~1799 边）"。

**盘点**：当前 494 个测试文件，**全部与源文件同目录**（`.test.ts` 并置）：

| 顶层 | 测试数 |
|---|---:|
| `core/` | 105 |
| `browser/` | 58 |
| `session/` | 57 |
| `context/` | 44 |
| `presentation/` | 39 |
| 其余 23 个目录 | 191 |

**这是风格决策，不是缺陷。** 且 R9 的存在说明当前约定**有唯一例外**——
要么消灭例外（R9），要么承认约定并保留。

**建议**：R8 降级为"已裁决：保持并置"（与 `pi` 的差异**不影响正确性**，
且搬迁 494 个文件 + ~1799 条边的收益未获证明）。若维护者仍要分离，应先做 R9 试点。

---

## 6. 建议的 C2 执行顺序

| 序 | 动作 | 风险 | 依赖裁决 |
|---|---|---|---|
| 1 | 删 `runtime/events/host/envelope.ts`（CB-005 遗留） | **零** | 否 |
| 2 | R9：`session/__tests__/` 2 文件迁到约定位置 | 低 | 否 |
| 3 | R11：`eval/` 归位（或裁定保留） | 低 | **是** |
| 4 | `runtime/evaluation/task/` 5 文件：删或并入 | 中 | **是** |
| 5 | R8：标记为"已裁决：保持并置" | 零 | **是** |
| 6 | R10：**关闭**（前提不成立） | — | 否 |

**第 1、2、6 项无需裁决，可立即执行。**
