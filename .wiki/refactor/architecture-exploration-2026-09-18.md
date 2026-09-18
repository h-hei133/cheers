# 架构位置探索（2026-09-18）

> 目标：在 Step 3–7 完成后，重新审视**还有哪些模块位置不正确、哪些架构需要重构**，
> 以及 **test 是否应单独分出与 src 同层次**。
> **本文件是探索结论，不含代码改动。** 所有数字由脚本实测（`maskSource` 语法锚定的 import 图）。

---

## 1. 现状实测（作为一切判断的基线）

| 指标 | 值 |
|---|---:|
| `src/` 下文件 | 1481（生产 **961** + 测试 **520**） |
| 已解析 import 边 | **5094**（另 2 条为 `presentation/themes/index.ts` 的 JSON import） |
| **生产 → 测试** 边 | **0** |
| 测试 → 生产 边 | 1799 |
| 生产 → 生产 边 | 3268 |
| 测试 → 测试 边 | 27 |
| 顶层目录数 | 28 |
| 测试 : 生产 文件比 | **1 : 0.54** |

**关键结构事实：`prod → test = 0`。** 没有任何生产文件依赖测试文件。
测试是导入图上的**纯叶子**。这决定了"测试能否分离"的答案（见 §4）。

---

## 2. 发现一：`test-utils/` 不在 sanctioned 域列表，且**被打进发布产物**

### 2.1 位置不正确

`agent-rules/file-placement-and-naming.md` 明文：

> Do not create folders named only for convenience, such as `helper`, `helpers`,
> **`utils`**, `misc`, `common`, or `support`.

`src/test-utils/`（6 文件）**直接违反该条款**，且 `test-utils` 不在规则给出的
Owner Domains 列表内。

### 2.2 它会发布出去（实测）

`tsconfig.build.json` 的 `exclude` 只有 `["dist", "node_modules", "**/*.test.ts"]`。
因此**任何不以 `.test.ts` 结尾的测试支撑文件都会被编译进 `dist/`**。实测输出：

| 文件 | 进 `dist/` |
|---|---|
| `src/test-utils/cleanup.ts` | ✅ |
| `src/test-utils/cliHarness.ts` | ✅ |
| `src/test-utils/ptyCapabilityDetector.ts` | ✅ |
| `src/test-utils/stoppedRecoveryFixture.ts` | ✅ |
| `src/test-utils/terminalDouble.ts` | ✅ |
| `src/session/__tests__/longSessionContinuityFixtures.ts` | ✅ |
| `src/session/__tests__/longSessionDurabilityProcess.ts` | ✅ |

其余全部测试文件（520 个 `.test.ts`）被正确排除。
**即：发布产物里有 7 个测试专用模块，只是靠"文件名不含 `.test`"逃过了排除规则。**

### 2.3 一个被否证的错误判据（先记，避免后人重犯）

本轮曾尝试用"某文件的消费者全部是测试文件"来筛测试专用模块，
得到 **60 个** 结果。**该判据无效**：`index.ts`、`entrypoints/cliPrintModeRunner.ts`、
`entrypoints/handleSigint.ts`、`runtime/api/sessionApi.ts`、`core/workflow/*`
等**合法生产入口**都被判为"test-only"——因为入口本就不被其他生产文件静态 import。
**"无生产静态消费者" ≠ "测试专用"。**
故 §2 的结论**只**基于"文件位于 `test-utils/` 或 `__tests__/`（名称即声明用途）"，
不采信上述启发式。

### 2.4 但这是死重，不是运行时风险（如实降级）

实测这 7 个文件的消费者：

| 文件 | 消费者 |
|---|---|
| `test-utils/cleanup.ts` | 3 个 `.test.ts` |
| `test-utils/cliHarness.ts` | 1 个 `.test.ts` |
| `test-utils/stoppedRecoveryFixture.ts` | 2 个 `.test.ts` |
| `test-utils/terminalDouble.ts` | 3 个 `.test.ts` |
| `session/__tests__/longSessionContinuityFixtures.ts` | 3 个 `.test.ts` |
| `test-utils/ptyCapabilityDetector.ts` | **无** |
| `session/__tests__/longSessionDurabilityProcess.ts` | **无**（子进程入口，见 §4.3） |

**全部消费者本身都是测试文件**（脚本核验：`test-utils/` 的非测试消费者 = 0）。
**没有任何产品路径可达它们。** 故实际影响 = **发布产物多 7 个死模块**，
而非功能或安全缺陷。严格性上仍应修，但优先级低于 §2.1 的规则违反带来的混淆。

### 2.5 `__tests__/` 是孤例

`src/session/__tests__/` 是**全仓唯一**的 `__tests__` 目录；
其余 520 个测试文件**全部与源文件并排**。
这说明仓内存在**两套测试放置约定**，其中一套有 1 个使用者。

---

## 3. 发现二：三个顶层域不在 sanctioned 域列表内

规则给出的 Owner Domains：
`runtime/ turn/ context/ planning/ provider/ tools/ session/ evidence/ result/ presentation/ policy/ edit/ verification/ repair/`

实测 `src/` 下**不在该列表**的顶层域，以及它们的消费者来源：

| 域 | 文件 | 外部消费者来源 | 判定 |
|---|---:|---|---|
| **`renderer/`** | 2 | `cli` 12 · `core` 12 · `entrypoints` 9 · `session` 1 | **该迁** |
| `config/` | 6 | `core` 18 · `cli` 7 · `entrypoints` 3 · `daemon` 1 | 高被依赖的横切基础域；列表未列，属列表缺口 |
| `workflow/` | 4 | `core` 5 · `entrypoints` 3 · `cli` 1 | 小；`gitChangeSetAttribution` + `gitContext`，邻近 `context/` |
| `artifacts/` | 5 | `core/query` 3 · `<root>` 1 · `runtime/evaluation` 1 · `verification/execution` 1 | 自闭合子树（`artifacts/workflow` 占 9/10 出边） |
| `eval/` | 3 | **无生产消费者**（仅 `eval/browser` 内部 2 条） | Step 4 已把 harness 移入 `evidence/harness/`，此目录语义已被取代 |
| `daemon/` | 6 | `runtime` 2 · `cli` 1 · `entrypoints` 1 | Rust 侧 parity 协议面；类似 `contracts/` 的跨运行时契约 |
| `test-utils/` | 6 | 仅测试 | 见 §2 |
| `model-adapters/` | 7 | `provider` 2 · `runtime` 1 · `turn` 1 | 2.5-C-2 曾判定"整域摘除会破坏簇内依赖" |

### 3.1 `renderer/` 的具体错置（最明确的一例）

- `src/renderer/StreamingRenderer.ts`：**34 个外部消费者、0 条出边**——纯叶子输出通道。
- 规则示例路径明确写着 `packages/ts-shell/src/presentation/terminal/renderer.ts`
  ——**该文件已存在**，但它是**纯格式化器**（`TerminalMessageRenderer`，
  输入 `ProductSurfaceViewModel` 输出 `string[]`，无副作用），
  而 `StreamingRenderer` 是**带副作用的流式输出通道**（默认写 stdout）。
- **两者职责不同，不可合并**，但 `renderer/` 这个顶层名与规则示例冲突，
  且 `StreamingRenderer` 的消费者全是 `cli/` `core/shell/` `entrypoints/`
  ——即**终端会话面**。
- **建议**：`src/renderer/` → `src/presentation/terminal/`（与既有 `renderer.ts` 并列，
  由文件名区分 `renderer.ts` 格式化 vs `streaming.ts` 输出通道），或
  规则未覆盖时的次优解 `src/presentation/surface/`。**属独立决策，非机械搬迁。**

---

## 4. 发现三：test 是否应单独分出与 src 同层次？

**结论：不应分离。理由有三，其中第一条是硬障碍。**

### 4.1 硬障碍：存在一个**动态构造路径**的测试子进程入口

`src/session/longSessionDurability.test.ts:220-245`：

```ts
const fixturePath = path.join(
  process.cwd(), "src", "session", "__tests__", "longSessionDurabilityProcess.ts",
);
spawnSync(process.execPath, [tsxCli, fixturePath, mode, scenario, ...]);
```

这是 §2.2 检查 4 定义的**动态入口**：路径由 `path.join` 在**运行时**拼出，
`tsc` **看不见**，纯 import 图也**看不见**。
把测试移到 `test/` 会**静默切断**它——测试仍会"通过"（子进程失败被当作断言处理），
或更糟：在没有断言覆盖的模式下静默跳过。
**这条必须先改造（改为 import 或显式路径常量）才能谈分离。**

### 4.2 同层分离的代价：生产/测试边界被规范化，但可读性净损失不大

- 测试 → 生产边 **1799 条**，其中 **995 条（55%）目标就在同一目录**，
  804 条（45%）跨目录。
- 测试文件深度分布：`src/` 根 2 · 1 层 110 · 2 层 316 · 3 层 85 · 4 层 6。
- 迁到 `test/<镜像路径>` 后，**每条边的相对路径都要重算**（约 1799 条），
  且每次新增测试都要手工维护镜像路径。
- **收益**：`src/` 变纯净（961 而非 1481）；发布排除规则从"文件名启发式"变成"目录规则"
  （可顺带解决 §2.2 的 7 个泄漏文件）。

### 4.3 但"分离"解决不了 §2.2 的根因

§2.2 的泄漏**不是**因为测试与 src 同层，而是因为 **`exclude` 只有 `**/*.test.ts` 一条模式**。
即使把测试全搬到 `test/`，只要有人再放一个 `test/support/x.ts` 且它被
某个**非测试**入口引用，同样的泄漏会再次发生。

**真正的修法是收紧构建边界**，与目录布局正交：

```jsonc
// tsconfig.build.json
"exclude": ["dist", "node_modules", "**/*.test.ts", "**/test-utils/**", "**/__tests__/**", "test/**"]
```

### 4.4 第四条理由：仓内已有强约定，且规则明文支持并排

`agent-rules/file-placement-and-naming.md`：

> Tests should follow the owner domain. A test may either live beside the module
> or in the existing package test layout, but it should make ownership clear.

并给出**并排**的示例（`runtime/events/projection.test.ts`）。
当前形态**完全合规**。分离是**风格变更**，需要维护者明确选择，而非缺陷修复。

### 4.5 若仍要分离：可行路径与代价

| 项 | 值 |
|---|---|
| 待移动文件 | 520 个 `.test.ts` + 7 个支撑文件 |
| 待重算边 | ~1799 条测试→生产边（+27 条测试→测试） |
| 前置改造 | `longSessionDurability.test.ts` 的动态路径（§4.1） |
| 校验方式 | `tsc -p tsconfig.build.json` 需要**排除 `test/`**，否则 520 个测试被编译进产物 |
| 收益 | `src/` 纯净化；发布排除变目录规则 |
| 代价 | 每次新增测试需维护镜像路径；55% 当前同目录的测试变得"更远" |

**建议**：**不分离**。改为收紧 `exclude`（§4.3），并把 `test-utils/` 按 §2 处置。
若维护者要分离，应先做 §4.1 的动态入口改造，作为独立一步。

---

## 5. 发现四：`agent-rules/architecture-boundaries.md` 的 Common Areas 已过期

该文件的 `Common Areas` 小节仍写着：

```
- packages/ts-shell/src/orchestration/patchResult/: ...
- packages/ts-shell/src/orchestration/patchApplication/: ...
```

**两条路径在 Step 4 都已消失**（实测 `orchestration/` 整个目录不存在）。

`AGENTS.md` 要求代理"启动时遵守这些 context 文件"，而该文件现在**指向不存在的路径**。
**这是文档债务，但在 `evidence-and-truthfulness` 的意义上更严重**：
它让后续代理按不存在的目录规划工作。

**需要更新的三处**：
1. 删除/改写 `orchestration/patchResult/`、`orchestration/patchApplication/` 两条；
2. Owner Domains 列表与实际 28 个顶层域对齐（补 `config/` 等实际在用的域）；
3. 「No new capability logic belongs in legacy orchestration paths」的"legacy orchestration paths"
   已不存在，措辞需重指。

---

## 6. 发现五：`presentation/theme/` vs `presentation/themes/` 近乎同名

| 目录 | 内容 |
|---|---|
| `presentation/theme/` | `theme.ts`、`commandHighlight.ts`（**逻辑**，3 文件） |
| `presentation/themes/` | `dark.json`、`light.json`、`index.ts`（**数据**，3 文件） |

`theme/theme.ts` 内部 **`import { ... } from "../themes/index.js"`**。
两个目录名仅差一个 `s`，且必须一起读才能理解。

**建议**：合并为 `presentation/theme/`（`themes/index.ts` → `theme/registry.ts`，
JSON 留在 `theme/` 下），或把数据目录明确命名为 `presentation/theme/data/`。
**属独立命名决策。**

---

## 7. 结论与建议优先级

| 优先级 | 项 | 性质 | 前置 |
|---|---|---|---|
| **高** | 收紧 `tsconfig.build.json` 的 `exclude` | 发布产物含 7 个测试模块 | 无 |
| **高** | 修 `agent-rules/architecture-boundaries.md` 的过期路径 | 规则指向不存在的目录 | 无 |
| **中** | `renderer/` → `presentation/terminal/`（或 `surface/`） | 位置不正确（34 消费者、0 出边、规则示例冲突） | 独立决策 |
| **中** | 消除 `test-utils/`（规则明文禁止 `utils`） | 违规则 + 泄漏源 | 与 `exclude` 一并 |
| **中** | `session/__tests__/` 归并到并排约定 | 全仓唯一孤例 | 含 §4.1 动态入口改造 |
| **低** | `eval/` 归并（语义已被 `evidence/harness/` 取代） | 目录语义重复 | 独立决策 |
| **低** | `theme/` 与 `themes/` 合并 | 近乎同名 | 独立决策 |
| **不建议** | 把 520 个测试分离到同层 `test/` | 见 §4：硬障碍 + 纯收益不成立 | 需先改造动态入口 |

**关于 `core/`**：实测 22 个子目录、1515 文件。`core/commands`(66)、`core/harness`(68)、
`core/shell`(55)、`core/tools`(27) 合计 216 条外部入边——`core/` 是**事实上的横切基础层**。
规则提到"Keep business logic out of core"，但未定义 `core/` 的准入标准。
**这需要维护者先裁定 `core/` 的语义**，之后才谈得上拆分；**本轮不提出拆分方案**。
