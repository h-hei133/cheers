# Step 6 — 命名税裁定探索（2026-09-18）

> 范围（`plan.md §3.3`）：`src/browser/` 下平铺文件的冗余 `browser` 前缀。
> **本文件是探索结论，不含代码改动。** 所有数字由脚本实测，非估算。

## 1. 范围实测：170 个文件，不是 161

| 位置 | 总数 | 带冗余前缀 | 无前缀（合规） |
|---|---:|---:|---|
| `src/browser/` 平铺 | 161 | **156** | 5 |
| `src/browser/receipt/` | 14 | **14** | 0 |
| `src/browser/runtime/` | 32 | 0 | 32（已合规） |
| `src/browser/skill/` | 21 | 0 | 21（已合规） |

无前缀的 5 个：`pwEvidence.ts` `pwRuntime.ts` `pwStatus.ts` `stealthPreload.ts` `stealthPreload.test.ts`。

**plan 的 161 只算了平铺层**。`receipt/` 全部 14 个文件都叫 `browserReceiptCache*`，
冗余度与平铺层相同（`receipt/cacheStore.ts` 已足够）。**实际候选 170。**

## 2. 决定性发现：只去前缀**不满足**规则

`agent-rules/file-placement-and-naming.md` 要求的是**两件事**：
① 「让文件夹承载域上下文，文件只命名局部角色」② 「避免长复合文件名编码完整功能路径」，
并明文给出解法——「When a domain becomes broad, **add meaningful subdomains instead of
lengthening file names**」。

实测去掉前缀后的结果：

| 指标 | 去前缀前 | 去前缀后 |
|---|---:|---:|
| 文件名长度 p50 | 32 | 25 |
| p90 | 39 | 32 |
| **仍 > 20 字符** | — | **125 / 170 (74%)** |
| 仍 > 25 字符 | — | 79 |
| **成为规则推荐角色名** | — | **1 / 170 (0.6%)** |

唯一命中的是 `browserPlan.ts` → `plan.ts`。其余 169 个去掉前缀后仍是
`externalNetworkHandoffProtocol`、`selfHealingManifestPatchWriter`、`controlledNetworkRunnerManifest`
这类 20–38 字符的复合名——**它们编码的仍是功能路径，只是少了一截**。

**结论：任务 ① 全靠前缀删除达不到。** 要么接受"部分合规"，要么走子域切分。

## 3. 子域切分被实测否证

按 `browser` 之后的首个 CamelCase 词切族，实测平铺层 567 条 `flat → flat` 边：

| 族 | 文件 | 族内边 | 跨族边 | 内聚度 |
|---|---:|---:|---:|---:|
| `Self` | 17 | 30 | 27 | 0.53 |
| `Read` | 6 | 9 | 11 | 0.45 |
| `External` | 13 | 23 | 43 | 0.35 |
| `Replay` | 17 | 29 | 58 | 0.33 |
| `Controlled` | 6 | 10 | 26 | 0.28 |
| `Playwright` | 14 | 13 | 45 | 0.22 |
| `Execution` | 17 | 29 | 111 | 0.21 |
| `Action` | 10 | 12 | 63 | 0.16 |
| `Command` | 3 | 3 | 41 | 0.07 |
| `Sandbox` | 3 | 0 | 22 | 0.00 |
| **合计** | 156 | **190** | **588** | **0.32** |

**跨族边是族内边的 3.1 倍。** 与 Step 4 否证 `orchestration/` 前缀切分时的数字同量级（当时 0.32 vs 0.42）。

**对照：既有已接受子域的内聚度**

| 子域 | 内聚度 |
|---|---:|
| `context/compact` | 0.76 |
| `planning/task` | 0.73 |
| `browser/receipt` | 0.67 |
| `browser/skill` | 0.48 |
| `browser/runtime` | 0.35 |
| `session/continuation` | 0.28 |
| `presentation/surface` | 0.02 |

**判读**：0.32 落在已被接受的区间内（`browser/runtime` 0.35、`session/continuation` 0.28
都在用），**所以 0.32 不是"禁止切分"的铁证**。但它远低于 Step 4 实际采用的聚类
（0.73/0.76）。**若在这个数字上切 17 个子目录，会造出 588 条跨目录边**——
正是 `plan.md` §3.3 用于否证 orchestration 前缀切分的同一条论证。**不推荐。**

## 4. 五处文件名碰撞：都是异主，非重复

| 原文件 | 去前缀后 | 已存在 | 是否同一概念 |
|---|---|---|---|
| `browserSessionManager.ts` | `sessionManager.ts` | `session/SessionManager.ts` | **否**——前者是 Playwright 浏览器会话（`class BrowserSessionManager`，管 browser/context/page 与 element refs）；后者是会话持久化基质 |
| `browserAgent.ts` | `agent.ts` | `core/agent/agent.ts` | **否**——前者是 `detectBrowserAgentPlan` 判定；后者是 core agent |
| `browserExecutor.ts` | `executor.ts` | `tools/dispatch/executor.ts`、`browser/runtime/core/executor.ts`、`browser/runtime/external/executor.ts`、`browser/skill/execution/executor.ts` | **否**——四者各属不同子域 |
| `browserPlan.ts` | `plan.ts` | `tools/scheduling/plan.ts`、`verification/command/plan.ts`、`edit/result/journal/recovery/plan.ts` | **否** |
| `browserToolPolicy.ts` | `toolPolicy.ts` | `core/query/toolPolicy.ts` | **否**——前者是浏览器工具可用性/决策；后者是查询工具策略 |
| `browserSandboxPolicy.ts` | `sandboxPolicy.ts` | `sandbox/sandboxPolicy.ts` | **否** |

**无一处是同一概念。** 规则明文「Reusing the same file name in different domains is allowed when
the folder gives the meaning」——6 处碰撞**全部合规**。

**但 `sessionManager.ts` 是最尖锐的一处**：`src/browser/sessionManager.ts` 与
`src/session/SessionManager.ts` 仅大小写之差，且两者都是"会话管理器"。技术合规，
但不能无说明地做——未披露会读起来像草率。

## 5. 未在 plan 记录的第二类违规：外部项目名

`AGENTS.md` 与规则均要求：**避免外部项目名出现在产品代码、文件名、导出类型、运行时字段中**。

| 模式 | 出现次数 |
|---|---:|
| `playwright` | 15 |
| `pw`（未展开缩写） | 3 |
| 全仓 `src/` 合计 | 18 |

`pwRuntime.ts` / `pwEvidence.ts` / `pwStatus.ts` 用未展开的缩写；两者都违反规则的
「Prefer short local names **inside meaningful folders**」——这些文件就在 `browser/` 里，
`runtime.ts` / `evidence.ts` / `status.ts` 已足够表达。

**这是 Step 6 范围内真正的第二项命名债**，plan 只记了前缀这一项。

## 6. 判据与 Step 6 的关系：零关联

`.normproof/norm-packs/software-structure-v0/profile.json` 只有 **3 项义务**：

| 义务 | 严重度 |
|---|---|
| `source_graph_is_acyclic` | advisory |
| `source_graph_has_no_unresolved_specifiers` | **blocking** |
| `declared_functions_within_module_ceiling` | advisory |

**没有任何命名、前缀、文件放置类义务。** 用 `maskSource` 解析判据：它按 mask 后的**源码文本**
计数，文件名在 ID 中只作为**标签**出现，不参与任何判定。

**结论：Step 6 不改善任何指标，是纯规则合规改动。** 这一点决定了它的优先级——
不阻塞 Step 7，也不改变 judge 报告。

## 7. 影响面实测

| 项 | 数 |
|---|---:|
| 指向待改名文件的 import 边 | **871**（252 个文件） |
| 其中来自 `src/browser/` 外部 | **201**（49 文件，其中 173 来自 `core/harness`） |
| 其中来自 `src/browser/` 内部 | 670 |
| **旧 basename 在 `src/` 内的重名数** | **0 / 170** |

**全部 170 个旧名仓库内唯一** → 按 basename 键的文本改写**无歧义**。

**已核验为零的风险点**：
- `vi.mock("…")` / `await import("…")` 指向待改名文件：**0**
- vitest `alias` / `resolve` 配置：**无**
- `scripts/`、`package.json`、配置中的路径引用：**无**（仅 `docs/` 历史文档，规则允许）
- 断言 `.ts` 文件名字符串的测试：**0**
- 动态入口（`spawn`/`path.join`+`import()`/`pathToFileURL`）：**无模块级命中**；
  仅测试用 `os.tmpdir()` 建临时目录，与模块路径无关

## 8. 三个候选

### A. 只去前缀（170 文件）

逐字重命名，零语义变更。约 871 条 import 边按 basename 键改写。
**结果**：任务 ① 部分满足（74% 仍 >20 字符），任务 ② 不满足（外部项目名未动）。
工作量最小、可验证性最高。

### B. 去前缀 + 裁定碰撞与缩写名（170 + ~18）

在 A 之上：展开 `pw*` 三个缩写；对 5 处碰撞在提交信息中逐条披露"异主"依据；
评估是否把 `playwright` 从文件名移出（15 个）。
**结果**：任务 ① 与外部项目名条款同时满足。
**代价**：多一层命名决策，且 `playwright` 改名需要新名字（`directAdapter` 之类），
这引入**真正的命名判断**，不再是机械操作。

### C. 登记 defer（依据充分）

理由：① 判据零命名义务，不影响 Step 7 与任何指标；② `browser/` 是 sanctioned 域，
`receipt/`、`runtime/`、`skill/` 已是合规子域，平铺层"拥挤"是既成事实而非本次造成的；
③ 内聚度 0.32 说明**没有干净的切分点**，切分会造 588 条跨目录边；
④ 规则的核心目的（代码住在拥有该职责的域内）**已经满足**。
代价：125 个长复合名与 18 个外部项目名继续存在，**规则的字面条款继续被违反**。

## 9. 建议

**A 与 B 之间，取决于是否接受"部分合规"。**

- 若目标是**字面合规**：选 **B**。只做 A 会留下 125 个长复合名，规则第二条仍被违反，
  形同半途；而 B 的增量（~18 个文件）很小，却能同时清掉外部项目名。
- 若目标是**指标与风险下限**：选 **C**。Step 6 不影响任何指标，而 A/B 都要动 871 条 import 边
  ——在 3172 项测试全绿、判据零命名义务的现状下，这是一笔**纯粹的规则整洁度投资**。
- **不建议**"去前缀 + 建族子目录"：0.32 的内聚度与 Step 4 否证过的 0.42 同档。

**若执行 A/B，纪律照 §2.4.1**：先跑 SCC（基线 0 环）→ 按 import 图实测边数 →
不夹带位置变更 → 校验 `.js` 后缀 → build + 全量测试 + PTY 实机。
额外一条（Step 4 教训 15）：**重写器必须匹配语法而非文本**，且文件列表在改名**之前**冻结。

---

## 10. 执行记录：路径 B 已完成（2026-09-18）

**裁决**：维护者选 **B**（去前缀 + 缩写/外部名裁定）。

### 10.1 裁定 `playwright` 保留（依据实测）

plan 把「外部项目名」列为待清项。执行前实测**推翻了这一读法**：

| 证据 | 值 |
|---|---|
| `packages/ts-shell/package.json:23` | `"playwright-core": "^1.60.0"` —— **声明的真实依赖** |
| `pwRuntime.ts` 第 2 行 | `import { createRequire } from "node:module"` —— 运行时用它加载该包 |
| 仓库既有先例 | `src/core/auth/openaiAccountAuth.ts`、`googleAccountAuth.ts` —— **集成目标名**同样进入文件名 |

`AGENTS.md` 禁止的是「外部项目名**作为参考/来源标签**」（参考仓 Claude Code、opencode…）。
`playwright-core` 是**被驱动的技术**，与 `openaiAccountAuth` 同类。**故保留 15 个 `playwright*` 文件名。**

### 10.2 `pw` 缩写：3 → `playwright`（不内联）

`pwRuntime.ts` 350 行、`pwEvidence.ts` 251 行、`pwStatus.ts` 21 行——**不是薄包装**，
内联会制造 600 行的合并且打乱模块边界（§2.2 检查 2：不采信推理，实测规模差）。

**处置**：改成 `playwrightRuntime.ts` / `playwrightEvidence.ts` / `playwrightStatus.ts`，
与其余 15 个 `playwright*` 一致。

**一个不如实的观察已更正**：`pwRuntime` → `runtime.ts` 会与**同目录的 `runtime/` 子目录**并列
（`runtime.ts` + `runtime/core/…`），文件名 `runtime` 同时表示文件和文件夹。
`playwrightRuntime.ts` 回避了该歧义，且消解了 `pw` 缩写。

### 10.3 改名清单（173 个）

| 组 | 数 | 例 |
|---|---:|---|
| `src/browser/` 平铺去 `browser` 前缀 | 156 | `browserCommandRunner.ts` → `commandRunner.ts` |
| `src/browser/receipt/` 去 `browserReceiptCache` 前缀 | 14 | `browserReceiptCacheStore.ts` → `store.ts` |
| `pw` 缩写 → `playwright` | 3 | `pwRuntime.ts` → `playwrightRuntime.ts` |

`receipt/` 的目标是 `cacheStore.ts` 而非 `store.ts`——子目录已表达 `receipt/`，
`Cache` 是该子域内的实质词。

未动：`stealthPreload.ts`、`stealthPreload.test.ts`（无前缀）、15 个 `playwright*`（已合规）。

### 10.4 机制：语法锚定的 basename 改写

用判据同源的 `maskSource` 解析：**仅在 mask 后处于 `from` / `import` / `vi.mock` / `require`
位置的字符串字面量**参与改写，因此字符串内容不会假冒 import（Step 4 教训 15 的成因）。
**171 个旧 basename 在 `src/` 内全部唯一 → 按 basename 键改写无歧义。**

**第一次尝试失败并已回滚**：改写器把**多个编辑按升序**应用，前面的编辑移动了后面编辑的偏移量，
产出 `Unterminated string literal`。`git reset --hard` 回退后重做，加入两条自检：
① 写入前断言 `text[a:b] === spec`；② 编辑按位置**降序**应用。重做后
**930 次改写、0 次断言失败**。

### 10.5 验证

| 项 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json` | **0 错误** |
| **SCC（1481 文件）** | **0 环**（与改名前基线一致，§2.4.1 强制） |
| **边集守恒** | 改名前 4960 条 → 改名后 **4960 条**，按改名映射归一化后**零丢失零新增** |
| diff 性质审计 | **937 增 / 937 删**，逐行判定**全部**为 import/export 行，**零非 import 变更** |
| 全量测试 | **3171 / 3172**（唯一失败为既有抖动 `cli-baseline.test.ts`，隔离复跑**通过**） |
| **PTY 实机** | 回合 `working → renamed` 跑通；**`/browser` 输出 37 行完整能力报告**（capability / runtime / backend candidates / safety） |
| 残留 | `src/browser/` 内 `browser*` 前缀 **0**、`pw*` **0** |
| 可达性 | **961 / 876 / 85**（不变） |

### 10.6 如实记录的代价

**去前缀后仍有 125/170（74%）文件 >20 字符**（p50 32→25）。路径 B **未**解决这一项——
它只解决了「前缀冗余」与「缩写不一致」两条。**规则第二条（避免长复合名编码功能路径）
在本步之后仍被违反**，且本步已实测证明：唯一解法是子域切分，而切分被内聚度 0.32 否证。
**这是本次探索确认的、Step 6 范围内无法闭合的残余。**
