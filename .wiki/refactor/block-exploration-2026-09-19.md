# 区块探索坐标（2026-09-19）

> ## ⚠️ 区块的性质
>
> **本文件划分的"区块"只是为了方便探索而设的观察坐标，不是项目应有的结构。**
>
> - **不要**按区块去搬迁、重组、重命名任何代码。
> - **不要**把区块当成 owner domain，也不要写进任何规则文件。
> - 区块是**临时的、可丢弃的**；`packages/ts-shell/src/` 下真实的 28 个顶层域
>   才是 owner domain（见 `agent-rules/file-placement-and-naming.md`）。
>
> 违反这一点的改动都是错的，即使它在区块视角下看起来更整齐。

---

## 0. 现状基数（实测）

| 指标 | 值 |
|---|---:|
| 生产文件 | 942（`.ts` 941 + `.tsx` 1，即 `entrypoints/cli.tsx`）|
| 测试文件 | 493 |
| 顶层域 | 28 |
| 生产行数 | 约 17.3 万 |

> **口径说明（2026-09-19 主代理核对）**：`plan.md` §1 记 942、本表原记 941 —— 两者**都对**，
> 只是口径不同：`find -name '*.ts' -not -name '*.test.ts'` 得 **941**，
> 加上唯一的 `.tsx`（`entrypoints/cli.tsx`，即 `package.json` 的 `bin` 入口）得 **942**。
> **可达性分析必须包含 `.tsx`** —— 漏掉它会让 `cli.tsx` 这个真正的入口不在根集合里
> （主代理首次复测时就犯过这个错，见 `block-findings` §6 的复测记录）。

---

## 1. 十个探索区块

按**耦合亲和**与**体量均衡**分组，纯为分工，无架构含义。

| 区块 | 包含 | 生产文件 | 行数 |
|---|---|---:|---:|
| **A. 执行内核** | `turn/`、`core/agent/`、`core/query/` | 43 | 9,187 |
| **B. 会话与 shell** | `session/`、`core/session/`、`core/shell/` | 127 | 19,429 |
| **C. 上下文与记忆** | `context/`、`memory/`、`core/context/`、`core/memory/` | 102 | 20,396 |
| **D. 浏览器** | `browser/` | 170 | 24,146 |
| **E. 交互面** | `cli/`、`entrypoints/`、`presentation/`、`core/commands/` | 202 | 26,841 |
| **F. provider 与环境** | `provider/`、`model-adapters/`、`config/`、`daemon/`、`sandbox/` | 40 | 9,276 |
| **G. 编辑-验证-结果链** | `edit/`、`repair/`、`verification/`、`evidence/`、`result/`、`artifacts/`、`policy/` | 81 | 18,839 |
| **H. 工具执行与 harness** | `core/tools/`、`tools/`、`runtime/`、`core/harness/` | 76 | 15,924 |
| **I. 规划与工作流** | `planning/`、`core/workflow/`、`workflow/`、`core/research/`、`core/models/`、`core/subagents/` | 55 | 9,236 |
| **J. 小域与支撑** | `core/{auth,hooks,mcp,messaging,paths,security,skills,state}/`、`observability/`、`eval/`、`test-utils/` | 44 | 6,435 |

**合计 940**（与 941 差 1，为顶层散文件）。

---

## 2. 每个区块要查什么（统一清单）

对区块内**每一个生产文件**，回答以下问题。**只报告有证据的问题**，不猜测。

| # | 问题 | 判定方法 |
|---|---|---|
| 1 | **重复实现** | 两个模块做同一件事（同形函数、同形投影、同一算法两份）。必须给出双方 `file:line` 并说明"为何算同一件事" |
| 2 | **死代码** | 零生产消费者 **且** 零测试引用 **且** 非动态入口。必须排除 §2.2 检查 4 的动态入口（`path.join`+`spawn`、`import()`、`*Process.ts`、shebang） |
| 3 | **命名与位置** | 文件名是否表达其职责；是否放在了错误的 owner 域；是否违反 `agent-rules/file-placement-and-naming.md` |
| 4 | **模块划分** | 单文件职责是否过载（>20 声明名，用 `npm run analyze:module-facades`）；是否该拆/该并 |
| 5 | **耦合度** | 跨域 import 边数；是否存在双向依赖；是否有"内部实现被外部直接 import"的越界 |

### 报告格式（强制）

每条发现必须包含：

```
[类别] 一句话结论
  证据: file:line（可复核的具体位置）
  影响: 为什么这是问题
  建议: 最小改动方向（不要求你实现）
  置信度: 高/中/低（低置信度必须说明不确定在哪）
```

**禁止**：笼统的"耦合度高"、"可以优化"、"建议重构"——没有具体位置与可复核证据的条目一律不要报。

---

## 3. 参考项目对照（`~/projects/pi`，只读）

pi 的包划分（供对照，**不是**要照搬）：

```
agent/  ai/  chord/  client/  coding-agent/  durable/
evals/  protocol/  server/  session-backends/  telemetry/  tui/
```

**要回答的问题**：pi 在**本区块对应的职责**上，有没有值得效仿的结构？
必须指出 pi 侧的具体 `file:line`，并说明**本仓缺什么**、**照做的好处是什么**、
**代价是什么**。不要笼统说"pi 更模块化"。

**注意**：`AGENTS.md` 要求"不机械照搬参考项目实现"，且产品代码中不得出现外部项目名。
