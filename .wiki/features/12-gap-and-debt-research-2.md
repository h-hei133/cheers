---
title: "Phase 16 前置研究：第二轮全面差距扫描（TUI 表面 / 浏览器栈 / 上下文记忆 / 会话持久化 / 编辑与钩子 / provider 流式）"
category: article
sources: [12-slice-tui-engine, 12-slice-slash-commands, 12-slice-provider-streaming, 12-slice-browser-stack, 12-slice-context-memory, 12-slice-session-durability, 12-slice-edit-hooks-lsp, 12-probes-live-2026-09-28, 12-probes-module-graph-2026-09-28]
created: 2026-09-28
updated: 2026-09-29
tags: [features, gap-analysis, tui, browser, memory, compaction, durability, hooks, provider, streaming, dead-code]
summary: "Phase 16 前置研究：在 01–07 七份切片与 Phase 0–15 全部收口之后，重新对照 `~/projects/pi`（主）与 `~/projects/opencode`、`source-claudecode`、`playwright-mcp` 做第二轮全面扫描。**零代码改动，只产出事实与方法**。本轮共 3 个只读子代理分域（并发 3）＋主代理自建的模块可达图与 12 个 `npx tsx`/live-CLI 探针。最重要的三类发现：**①「三处已登记缺陷其实全都还在」——项目记忆的注入链在 CLI 生产装配处断掉（`projectMemoryStore` 从不由 CLI 提供，故 `/memory` 全程 `Store mode: disabled`）、`/compact` 走的是 `previewOnly` 报告而非压缩引擎且不触发 PreCompact/PostCompact 钩子、`regular` 主屏模式下内容增长时新行**根本不会**写给终端（比源码注释说的「未重新锚定」更严重，注释少说了一半）；**②浏览器存在两套互不汇流的栈**，模型侧 `browser` 工具只经 13 个模块、完全绕开 155 个文件的策略/证据/允许清单层，且在 Chromium 不可用时以 `success: true` 返回**编造的成功文本**（实测：`Simulated click on element 'e1'`）；**③每帧渲染成本与总行数线性相关**（实测 20k 块 48.8 ms/帧），且每条流式增量都要对全文档做三遍遍历。另核实 4 条子代理断言为**错**并逐条剔除（见 §7）。**零代码改动**，本轮只产出分类、证据与修复方向。"
confidence: high
---

# Phase 16 前置研究：第二轮全面差距扫描

> **本文件与 01–07 的关系**：那七份是**能力切片**（我们比参考实现差在哪），已由 Phase 0–15 逐一收口。
> 本文件是**第二轮**：在全部已登记项收口之后，重新扫一遍，找出**仍然只是 demo、仍被中断接线、
> 或与参考实现有实质差距**的地方。
>
> **与 `08-gap-and-debt-research.md` 的关系**：08 是 Phase 11 的盘点，其条目（D/M/P0-x）在本文件中**沿用编号不重登**。
>
> **纪律**：子代理结论**逐条由主代理实测复验**，被推翻的如实记录在 §7；
> **零代码改动**——本轮只产出分类、证据与修复方向。

---

> **2026-09-30 实施索引**：本研究的 Phase 17 裁决已按 W1–W6 完成逐项实施与保留处置，
> 浏览器守卫和钩子文档也已补齐。当前提交、验证、限制与新发现见
> [phase-17-decisions.md](phase-17-decisions.md) §8 和
> [13-feature-and-defect-register.md](13-feature-and-defect-register.md)。
> 以下证据保留为研究时点快照，不作为当前代码状态或删除配额。

## 0. 本轮范围与执行方式

### 0.1 维护者指示

> 「现在研究的所有 features 都已经完成或者明确不做，所以接下来就是进行新的一轮研究与探索……
> 主要目标还是找出现有代码中只是 demo 或者有缺陷的模块或者功能，学习顶尖项目的实现方案……
> 包括未拥有的功能、有缺陷的代码、demo 级别的代码、tui 缺少的功能、tui 使用体验上的不足、
> slash 命令的内部实现是否可靠（不能只是一个占位符或者实现方案草率）、是否存在没有接入 tui 的功能、
> tui 之前分为了 regular 和全屏，但是 regular 还未开始进行适配工作、多套 tui 主题等等。
> 我要的是企业级生产代码，不是 demo 模块……最后进行记录，从文档 12 开始，自行往后添加。」

**归类口径**（沿用 01–07 并加两条）：

| 判定 | 含义 | 本轮是否提议 |
|---|---|---|
| **WIRING-INTERRUPTED** | 有实现、有注释、有命令，但生产路径到不了它 | ✅ |
| **DEMO** | 桩／占位／"preview only"／编造的返回值／无错误处理或无界 | ✅ |
| **DEFECTIVE** | 竞态、泄漏、无界增长、吞错、语义错误、资源不释放 | ✅ |
| **MISSING** | 参考实现有、我们确实没有，且真实用户会撞到 | ✅ |
| **TUI-UX** | 渲染成本、滚动回看、非备用屏 parity、主题、键位可发现性 | ✅ |
| **DEAD** | 无生产消费者（本轮用模块可达图系统性找出） | ✅ |
| **OURS-ONLY** | 我们有参考没有 | ❌ 仅记录 |

**parity**（两侧都有、形态不同）单独标注，不计为差距。

### 0.2 执行方式

| 路 | 子代理 | 切片 | 结果 |
|---|---|---|---|
| W1a | `W1aTuiEngine` | 渲染引擎 / regular parity / 主题 / 终端能力 / sidebar | ✅ 完成（5 findings） |
| W1b | `W1bSlashCommands` | 全部 slash 命令的 real-vs-stub 表格 | ✅ 完成（5 findings + 45 命令表） |
| W1c | `W1cTuiUx` → `W1cInteractiveUx` → `W1fKeyDispatch` | 交互 UX / 键位 | ❌ **三次均被上游 `content_filter` 拦截** |
| W1d | `W1dKernelTurn` | 内核循环 / 取消 / 重试 | ❌ 为守并发上限主动 kill；**改由主代理完成** |
| W1e | `W1eSessionDurability` | 会话持久化 | ❌ 同上；**改由主代理完成** |
| W1g | `W1gProviderStreaming` | provider / 流式 | ✅ 完成（8 findings） |
| W2a | `W2aBrowserStack` | 浏览器栈 | ❌ **账户额度耗尽（402）**；**改由主代理完成** |
| W2b | `W2bContextMemory` | 上下文 / 记忆 | ❌ 同上；**改由主代理完成** |
| W2c | `W2cEditHooks` | 编辑 / 钩子 / LSP | ❌ `content_filter`；**改由主代理完成** |

**两类基础设施事故（第 5、6 次记录）**：
- **`content_filter`（第 5 次）**：`cli/interactive/**` 切片连续三次在读到 `clipboard.ts` 与
  凭证相邻面后死亡。处置照既有结论——**涉及这些阅读面的切片由主代理亲验**。
- **上游账户额度耗尽（首次）**：`vsllm/gemini-3.8-flash-api` 返回
  `402 ... 当前账户暂无生效套餐`，W2a/W2b 因此终止。维护者指示**改用当前模型自行完成**，
  故 §1–§6 的绝大部分由主代理亲验产出。

### 0.3 主代理亲自使用的验证手段

所有**头条数字与断言**由主代理独立重算，不采信子代理：

| 手段 | 用途 | 本轮实例 |
|---|---|---|
| 自建**模块可达图**（ESM import 解析 + 从 `entrypoints/cli.tsx` BFS） | 死代码、接线中断、双栈分化 | 864 个非测试模块；**46 个从 CLI 不可达**；`/browser` 到达 160/162 个 browser 模块而模型侧工具只到达 **13** |
| `npx tsx` 直调生产函数 | 行为验证（非读码推断） | 浏览器假成功、主屏丢行、suspend 重复、截断 transcript、陈旧锁、主题 token、每帧成本 |
| 真实 CLI（隔离 `HOME`） | 端到端实机 | `/statusline use …`、`/permissions`、`/back`、`/todo`、`/memory`、`/compact`、损坏 `state.json` |
| 逐行读码 | 决定分支而非注释 | 全部 WIRING 类结论 |

**读码纪律**：本仓有**注释与代码不符**的成文历史（`interactive-issues.md` §0 记录过一次、
本轮又实测两处，见 §3.3 与 §1.2），故所有结论以**可执行的行为**为准。

---

## 1. 头条：四项「登记为已完成／已修」但实测仍不成立的能力

> 这一节是本轮最重要的产出。四项**都不是「相比 pi 的差距」**，而是
> **我方已有的能力声明与真实行为不一致**——前 15 个阶段都覆盖过它们的**相邻**部分。

### 1.1 P0-A：项目记忆的注入链在生产装配处断掉 → `/memory` 全程 disabled

**判定**：**WIRING-INTERRUPTED（CONFIRMED，实机 + 模块图双向核实）**。

**事实链**：

| 环节 | 位置 | 内容 |
|---|---|---|
| 注入实现存在 | `memory/projectMemoryFutureTurnInjection.ts:36` | `planProjectMemoryFutureTurnInjection` 完整实现（预算、合并策略、质量评估、冲突检测） |
| 注入点存在 | `core/shell/sessionFutureTurnProjection.ts:101` | `memoryStore: input.deps.projectMemoryStore` |
| 注入被调用 | `core/shell/sessionRuntime.ts:268` | `await buildPromptWithFutureTurnInjection({ deps: this.deps, … })` |
| **依赖未提供** | `cli/runtime/cliSessionRuntimeFactory.ts:302-304` | `new ShellSessionRuntime({ sessionManager, renderer, compactHistory, … })` — **`projectMemoryStore` 从不出现在任何 CLI 装配点** |
| 唯一构造器 | `memory/projectMemoryLocalStore.ts:37` | `createProjectMemoryLocalStore` 的**生产调用者为 0**，只有 `core/harness/agentScenarioFixtures.ts:64`（测试夹具） |
| 因此注入必为空 | — | `deps.projectMemoryStore === undefined` ⇒ `planProjectMemoryFutureTurnInjection` 拿不到 store |

**实机复现**（隔离 `HOME`，真实 CLI）：

```
$ printf "/memory\n" | cheers
- Persistence: not enabled
- Cross-session loading: none
- Retrieval / wake-up / recall: not enabled
$ printf "/memory save cand-x\n" | cheers
- Outcome: blocked
- Store mode: disabled
- Store writable: no
- Blockers: Explicit local memory store root is required.
```

**注意这不是「功能未做」**：`memory/` 下 35 个文件全部有非测试导入者、
全部有测试、UI（`/memory` 十余个子命令）齐全、`/sidebar` 面板会显示其健康度。
**缺的是最后一根线**——生产装配没有把 store 交给会话。

**模块图旁证**：`memory/` + `context/` 共 62 个文件全部从 CLI 可达，
但**只有 18 个在模型请求路径上**（`turn/step.ts`/`turn/prompt.ts`/`turn/completion.ts`/
`provider/request/completion.ts` 的可达闭包）。其余 44 个供命令与面板使用。

**与参考实现的差距**：pi 的会话启动即加载项目记忆并注入首轮
（`session-manager.ts` 的 memory 装载 + `agent-session.ts` 的 context 组装）；
其 `/reload` 也把记忆重读。我们两侧都有实现，**只有连接缺失**。

**修复方向**（16-A）：
- 在 `cliSessionRuntimeFactory` 装配处构造 `createProjectMemoryLocalStore({ root })`，
  根目录取项目 `.agents/memory` 或用户数据目录（需一次产品决定：**记忆落在项目内还是用户目录**，
  这决定它是否随仓库分发）；
- 注入通道已有 `cliCommandExecutionBridge.ts:63` 的 `compactInjectionStateStore` 先例可循；
- **撤销验证**：断言 `runPrompt` 的最终 prompt 文本中包含已批准记忆的原文（用真实 store 写一条再读）；
  测试必须**驱动生产装配函数**，而不是自己 new 一个 `ShellSessionRuntime`——
  否则 Phase 14 那类「删掉修复测试照样过」会重演。

### 1.2 P0-B：`/compact` 是 `previewOnly` 报告，不是压缩；且不触发压缩钩子

**判定**：**WIRING-INTERRUPTED + 语义分裂（CONFIRMED，读码 + 实机）**。

**事实链（两条路径，名字相同，语义不同）**：

| 路径 | 入口 | 归到 | 行为 |
|---|---|---|---|
| **交互 shell** | `cli/interactive/interactiveCommandRouter.ts:98-104` | `sessionRuntime.compactHistory()` | **真压缩**：读 `session/compaction.ts` 引擎、`force: true`、`appendCompactionEntry` 落盘、`markContextUnknown` |
| **命令注册表** | `core/commands/compactCommandRuntime.ts:39` | `runCompactCommand()` | **只产报告**：`compactCommandContract.ts:48` 声明 `readonly previewOnly: true`，自身注释写 "`/compact` is preview-only and cannot execute recovery, persist memory, or write state" |

**实机复现**（隔离 `HOME`，`/compact`）：

```
$ printf "/compact\n" | cheers
Compact v2 handoff generated
- Mode: render
- Preview only: yes
- Persistence: none
- Provider/model call: none
- Recovery execution: none
```

**两个衍生缺陷**：

1. **钩子不对称**：真压缩路径（`core/shell/compaction.ts`，135 行）**不派发 `PreCompact`/`PostCompact`**；
   只有 turn 层压缩（`turn/session.ts:273-292`）派发。即**管理员配置的压缩钩子在手动压缩时不会被调用**。
   `check:declarations` 门禁只要求「有派发点」，无法发现「另一条同类路径没有」。
2. **`Reason: "manual"` 从无生产调用者**：`session/compaction.ts:81` 定义了三种原因，
   而 `grep '"manual"'` 在生产代码中**零命中**——`compactSessionHistory` 也不传 `reason`。
   即类型与钩子载荷里的 `manual` 是死值。

**修复方向**（16-B）：
- 二者**合并到单一实现**：`/compact` 走 `compactSessionHistory`（它已经是「用户要求就无视阈值」的语义），
  `compactCommandRuntime` 的 preview/render/json 作为 `--preview` 等**子形式**保留；
- 在 `compactSessionHistory` 内派发 `PreCompact`/`PostCompact`（带 `reason`），
  并把 `reason` 从调用点传下去；
- **撤销验证**：断言手动压缩后 `session/compaction.ts` 的持久化条目出现且钩子收到 `reason: "manual"`。

### 1.3 P0-C：`regular` 主屏模式**丢失所有原地增长的内容**（比注释所述更严重）

**判定**：**DEFECTIVE（CONFIRMED，探针复现）**。

**源码自述**（`presentation/tui/render/mainScreen.ts:6-11`）说：
> 「缺的是内容增长时对固定块的重新锚定……一个不改变尺寸的回合原地追加行时它不会移动，
> 所以回合运行期间提示符与输出会彼此漂移。」

**实测比这句更严重**：内容行**一旦已经写过就不再更新**，所以**同一行上增长的流式文本根本不会被写出去**。

探针（`MainScreenPainter` + 记录 `device.write` 的假设备）：

```
f1 (first paint)   : "\r\x1b[2Khel\r\n\r\x1b[2K> prompt\r\n\x1b[2Kstatus"
f2 (row grew)      : "\x1b[1A\r\x1b[2K> prompt\r\n\x1b[2Kstatus"        ← 只有固定块，没有 "hello world"
f3 (new row added) : "\x1b[1A\r\x1b[2Ksecond line\r\n\r\x1b[2K> prompt\r\n\x1b[2Kstatus"
```

根因在 `mainScreen.ts:114`：`if (content.length <= alreadyWritten) return;`
——行数没增加就整段跳过。**注释说的问题在固定块；真正的问题在内容行**。

**第二个缺陷（探针复现）**：`engine.suspend()`（把终端交给外部编辑器／子进程）里
`this.mainScreen.stop(); this.mainScreen = undefined;` 然后 `enterScreen()` **新建一个 painter**，
新 painter 的 `written = []`、`cursorRow = 0`，于是恢复后**整份 transcript 被重新追加一遍**：

```
first paint  : "\r\x1b[2Kline one\r\n\x1b[2Kline two\r\n\r\x1b[2K> prompt\r\n\x1b[2Kstatus"
after suspend: "\x1b[?25h\r\x1b[2Kline one\r\n\x1b[2Kline two\r\n\r\x1b[2K> prompt\r\n\x1b[2Kstatus"
content re-appended after suspend? true        ← 滚回区出现重复
```

**参考实现的做法**（`~/projects/pi/packages/tui/src/tui-main-screen.ts`）：
pi **不用「已写行数」记账**，而是分别跟踪 **`hardwareCursorRow`（真实终端光标）** 与
**`viewportTop`（视口首行在缓冲区中的位置）**，每次渲染计算
`currentScreenRow = hardwareCursorRow - prevViewportTop`、
`targetScreenRow = targetRow - viewportTop`，再由 `computeLineDiff` 得出相对移动量（`:256-260`）；
滚动、resize（`:250-252` 按高度变化重算 `prevViewportTop`）、
以及光标行本身都在同一账本里维护（`:305`、`:438`、`:604`）。
**关键差别**：pi 从不假设「之前写过的行不可变」，它维护的是「光标在哪 / 视口从哪开始」，
所以**可以重写任意屏幕行**；我们的 painter 把「已追加 = 不可变」当成了不变量，而主屏模式恰恰没有这个不变量。

**修复方向**（16-C）：把 `MainScreenPainter` 的记账从「`written.length` + 相对行号」
改为 pi 的「`viewportTop` + `hardwareCursorRow` + 每帧行差」，并支持**重写**仍可见的行
（只有滚出视口的行才真的不可变）；`suspend()` 改为恢复同一个 painter 的账面状态而不是新建。
这是**结构性重写**，不是补一行——故本轮只记录与定方向。

### 1.4 P0-D：模型侧 `browser` 工具在 Chromium 不可用时返回**编造的成功**

**判定**：**DEMO / 欺骗性返回值（CONFIRMED，探针复现）**。

**探针**（真实工具定义，`PLAYWRIGHT_BROWSERS_PATH=/nonexistent` 使 Chromium 启动失败）：

```
open    -> {"success":true,"output":"# Navigated to `https://example.com` (Title: \"Simulated Session: https://example.com\")…"}  [371ms]
observe -> {"success":true,"output":"# Browser Page State …  (No interactive elements found on the current page)"}
click   -> {"success":true,"output":"Simulated click on element 'e1' (selector: e1)."}
close   -> {"success":true,"output":"Browser session closed and resources released."}
```

对照同一探针在 Chromium 可用时返回真实结果（`Title: "Example Domain"`）。
**即：两种截然不同的世界返回同一个 `success: true`**，模型无法区分「我点到了按钮」
与「浏览器根本没起来」。这与 `AGENTS.md` 的
「**Do not hide unverified write outcomes behind success-like terminal or session states**」
正面冲突，且与 Phase 15 修掉 MCP 假串（15-A）**同型**。

**代码位置**：`browser/sessionManager.ts:128`、`:261`、`:278`、`:295`、`:312`、`:328`
六处 `Simulated …` 字符串，以及 `getOrCreatePage()` 的静默 `catch`（`:79-90`）
在启动失败时**只清理字段、不留原因**。

**严重度定级**：比 Phase 15 的 MCP 假串**更隐蔽**——MCP 那处返回的是
"called" 这类寡淡措辞，而这里返回的是**具体、可信、带 selector 的成功叙述**。

**修复方向**（16-D）：`getOrCreatePage` 失败时记录并暴露原因；
六个动作分支不再有 "Simulated" 兜底，改为 `deniedResult` 并附**可操作原因**
（缺 `playwright-core` / 缺浏览器二进制 / 启动超时，三者要给不同的 DoNext）。
与 16-E（下一节）合并为一个提交。

---

## 2. 浏览器：两套互不汇流的栈，模型侧绕开全部策略层

**判定**：**WIRING-INTERRUPTED + 安全边界旁路（CONFIRMED，模块图 + 探针）**。

### 2.1 可达性实测（自建模块图，864 个非测试模块）

```
browser total                 : 162
reachable from MODEL tool     :  13      ← core/tools/browserToolUnified.ts 的闭包
reachable from /browser cmd   : 160      ← core/commands/browserCommandRuntime.ts 的闭包
reachable from both           :  11
reachable from NEITHER        :   0
```

模型侧那 13 个是：`accessibilitySnapshot / actionContract / capabilityModel / domSnapshot /
evidenceSafety / executionContract / outputBudget / playwrightEvidence / playwrightRuntime /
runtime/core/executor / runtime/core/manifest / sessionManager / stealthPreload`。
**真正被执行的只有 `sessionManager.ts`（裸 `playwright-core` 启动）与 `stealthPreload.ts`**，
其余是类型与签名依赖。

### 2.2 被绕开的能力

`/browser` 路径强制、而模型侧一行都不经过的：

| 能力 | 模块 | 模型侧是否经过 |
|---|---|---|
| 出站目标允许清单 | `networkAllowlist.ts` → `core/security/egressGuard.ts` | ❌ |
| 出站决策（含私网/元数据/凭据 URL/重定向逃逸） | `networkEgressGuard.ts` | ❌ |
| 沙箱授权 | `sandboxAuthority.ts`、`sandboxPolicy.ts` | ❌ |
| 执行确认 | `executionConfirmation.ts` | ❌ |
| 回执与缓存 | `receipt/**`、`actionCache*.ts` | ❌ |
| 动作前置就绪判定 | `actionReadiness.ts`、`actionLoopPolicy.ts` | ❌ |

**对照实测**：`web_fetch`（`core/tools/webFetch.ts:133`）**确实**调用
`blockedHostReason()`，且其注释（`core/security/egressGuard.ts:3-8`）明确写着
「the browser allowlist, the web fetchers and the egress guard all ask this」。
**这句注释现在是错的**——浏览器侧那条链没有问。

**仓库自己的裁决文档否证了现状**：`browser/runtime/core/directionDecision.ts`
在 `directViable` 分支把 **`"hand-rolled-low-level-runtime"` 与 `"action-layer-low-level-runtime"`
列为 `rejectedPaths`**，并把 prerequisites 写成「approve package dependency change / prove browser
binary availability / run controlled observe-extract-click-type gauntlet」。
**`browser/sessionManager.ts` 正是一个手搓的低层运行时**，且没有满足那三条前提。

### 2.3 `localhost` 与私网可达

`browserToolUnified.ts:21` 的工具描述**主动宣传**可开 localhost：
`"open URLs (including localhost)"`，而 `sessionManager.openUrl` 直接 `goto(url)`。
配合 §1.4：**在 Chromium 不可用时，这条路径还会报告它成功了**。

**修复方向**（16-E，**2026-09-29 经二次核实后更正**）：
> **更正**：本节初稿写的是「模型侧工具改为经 `/browser` 同一条受控执行路径」。
> 二次核实（Phase 16 预研究）证明**该方向不可行**，原因是 `/browser` 那条栈**不是**通用浏览器驱动器：
> - `browser/cliExecutorInjection.ts:49-61`：没有 `manifest` 环境变量时返回
>   `status: "disabled"`，`reason: "No CLI browser local fixture manifest was provided."` ——
>   **默认零执行**，整条栈要靠环境变量显式开启；
> - `browser/playwrightLocalExecutor.ts:48-55`：即便开启，`navigate` 只接受
>   `local-fixture://` 目标，其它 URL 直接 `blocked-external-url`；
> - `browser/executor.ts:49-58`：默认执行器是 `NOOP_BROWSER_EXECUTOR`，返回 `blocked`。
>
> 即那 155 个模块是**受治理的夹具/证据框架**（为评测与可复现证据服务），
> **不是**用户可用的浏览器。产品里**唯一真能浏览的**实现就是 `sessionManager.ts`。
> 因此 16-E 的正确形态是**给真实路径补上治理**，而不是把它接到一个不能浏览的栈上。

- 给模型侧真实路径补上**出站治理**（`blockedHostReason` + `BrowserNetworkAllowlist`），
  并修掉 `core/security/egressGuard.ts:3-8` 那句「browser allowlist 也问它」的**不实注释**；
- 夹具栈的定位**写进文档**（它是评测/证据设施，默认关闭），不改它的行为；
- 无论选哪条，§1.4 的假成功必须先修；
- 需要一次产品决定：**agent 是否应能浏览 localhost**（若可，allowlist 需要一条显式的
  「loopback 仅限用户声明」通道，而不是让工具描述替用户决定）。
- **撤销验证**：断言 Chromium 缺失时 `browser` 工具返回 `success: false`；
  断言向 `169.254.169.254` 与 `localhost` 的导航被拒绝（用内存执行器 double，防止假测试）。

---

## 3. TUI 表面

### 3.1 每帧渲染成本与总行数**线性相关**（实测）

**判定**：**TUI-UX / DEFECTIVE（CONFIRMED，实测曲线）**。

`TranscriptPane.render()` 每次都调 `transcript.render(width)`，而后者遍历**全部** block；
`view.ts:85` 另外调 `pane.documentRows(width)`，**再一次**遍历全部 block；
`pane.ts:52` 的 `needsScrollbar(this.transcript.rowCount(...))` 又是**第三次**。
即**每帧三遍全文档**，且 `documentRows` 在默认（备用屏）模式下**根本不会被读**
（只有 `mainScreen` 存在时 `engine.ts:293` 才用它）。

实测（`TranscriptPane.render` + `documentRows`，宽 100，视口 40 行）：

| 总块数 | 实测 ms/帧 |
|---|---|
| 500 | 1.63 |
| 2,000 | 4.53 |
| 8,000 | 20.09 |
| 20,000 | 48.82 |

**完全是 O(N)**；而视口只有 40 行。流式期间每个增量事件都触发一次 render
（`turnSink.chunk`/`think` 每次都 `onChange()`），所以长会话的**输入延迟与流式平滑度
会随会话长度退化**——这正是维护者说的「TUI 使用体验上的不足」。

**参考实现**：pi 的 `scroll-view.ts` 只在视口范围内渲染组件，并维护**缓存的布局高度**
而不是每帧重新生成整个会话数组。

**修复方向**（16-F）：
1. `documentRows` 改为**惰性**——只在 `mainScreen` 模式下计算（`view.ts` 按模式决定是否填该字段）；
2. 块级渲染结果已有 memo（`container.ts:120` 的 `rowsFor` 按 width+`colorRevision` 缓存），
   但 **`rowCount`/`render` 的「拼接」阶段每次都重做**——缓存每个块的**行数**，
   让 `rowCount` 变成 O(块数) 的加法、`render` 只拼接视口窗口覆盖到的块；
3. 流式期间对 `onChange` 做**帧内合并**（`requestRender` 已有 min-interval 与 adaptive delay，
   但 `chunk` 的每次 `onChange` 都会走一遍完整 `renderFrame`）。

### 3.2 `regular` 模式：除 §1.3 外还有 parity 缺口

- `terminalCapabilities.ts:57-58` 探测出的 **`hasTrueColor` / `has256Color` 无任何生产消费者**
  （`grep` 只命中声明与 `test-utils/terminalDouble.ts`）；`terminal.ts` 只消费
  `supportsBracketedPaste` 与 `supportsDec2026Sync`。
- `theme/theme.ts:179-187` 的 `colorToAnsi` **无条件**降到 256 色：即使终端报 truecolor，
  也走 `\x1b[38;5;Nm`。pi 的 `tui/src/colors.ts:303-308` 先看 mode，
  truecolor 时发 `\x1b[38;2;R;G;Bm`。
- **`NO_COLOR` 与 `FORCE_COLOR` 全仓零处理**（`grep` 只命中 `COLORTERM` 的读取）。
  这是**标准**且无障碍相关的缺口：用户用 `NO_COLOR=1` 说「别上色」，我们照上。
- `config/runtimeConfig.ts:251` 的 `tuiMode` 第三个取值 **`"stream"` 无任何行为**
  （`grep '"stream"'` 只命中类型声明两处）：配置可写，语义为空，且注释承认
  「treated as fullscreen … has no defined meaning」。**要么实现，要么从类型里删掉**。

**已核实为健全（不需改）**：两个主题文件的 token 覆盖完整
（`THEME_COLOR_TOKENS` 32 项，dark/light **缺失 0、多余 0**，主代理用探针重算）；
主题热重载的 debounce/`colorRevision` 失效链正确；`clampIndex` 下 `index < 16` 分支
**不可达**（实测 `closestColor` 值域 16–255），故子代理所称「会发出 `\x1b[38m` 非法序列」
**不成立**（见 §7）。

### 3.3 sidebar：已按命令接通，但**不是** TUI 侧栏

Phase 15 裁决 15-C 写的是「`surface/view.ts` 增加侧栏区（alt-screen 右栏）」。
**实际交付**：`presentation/sidebar/**` 经 `core/commands/sidebarCommandRuntime.ts` 以
**文本面板**输出，`/sidebar` 默认渲染 boxed panel。
模块图确认 27 个 sidebar 文件**全部有生产消费者**（不是死代码），
但 `presentation/tui/` 内**零处**引用 sidebar。

**结论**：15-C 的「接通」目标达成（不再是 demo 声明），但**与裁决描述的形态不同**。
这是**记录性更正**，是否补一个真正的分栏侧栏属产品决定（记 backlog），
不作为缺陷计入。

### 3.4 代码围栏无语法着色

`presentation/tui/transcript/` 内 `grep 'highlightCode|syntaxHighlight'` **零命中**；
`blocks.ts` 只在 `splitFencedDiff` 里对**diff** 做逐行着色。
pi 有完整语法高亮（`packages/coding-agent/src/modes/interactive/theme/theme.ts` 的
`syntaxKeyword`/`syntaxFunction`/`syntaxString`… 共 **56 个颜色令牌**，我们 **32 个**）。
即 **代码块的阅读体验是明显短板**，而 pi 已解决。

---

## 4. 会话与持久化

### 4.1 陈旧会话锁：进程死在持锁状态会**永久**阻塞该会话

**判定**：**DEFECTIVE（CONFIRMED，探针复现）**。

`session/store/sessionFileStore.ts:53` 的 `withFileLock` 用 `openSync(lockPath, "wx")` 建锁文件，
超时 1200ms 后抛 `Session state lock timeout`；**从不检查也能从不清理陈旧锁**。
探针（预先放一个无人持有的 lock 文件，模拟死进程残留）：

```
threw after 1218 ms: Session state lock timeout at /tmp/…/state.lock
lock file still present: true
```

**影响面**：`withSessionStateLock` 被 `writeSessionState` 使用，即**每次写会话状态**。
用户在一次崩溃／被 kill 之后，该会话的**每一次写入都会失败**，且提示只指向
「lock timeout」，**没有任何自动恢复或清理入口**。

**对照**：同仓另有**正确实现**——`browser/receipt/lock.ts:140-160` 的锁带
`expiresAt`/`ownerId`，读时判定 `stale`/`active`，并显式报告
`browser-receipt-cache-lock:stale` 警告。**同类问题在同仓已有先例**，会话锁只是没采用。

**修复方向**（16-G）：会话锁带上 `pid` + `startedAt`，读时判定
（`kill(pid,0)` 探活 + 超龄阈值）→ 陈旧则记录警告并夺取，而不是干等；
或改用 `flock`/`proper-lockfile` 式的内核锁（进程退出即释放）。
**撤销验证**：预置陈旧锁后断言写入**成功**且留下一条警告。

### 4.2 截断 transcript：**已正确处理**（不记为缺陷）

探针（真实 `readTranscript` + 手工截断最后一行成非法 JSON）：

```
version: 1 events: 2 contents: [ 'one', 'two' ]
```

`classifyTranscriptLine`（`session/sessionEventCodec.ts:317`）把无法解析的行归为
`unreadable` 并**跳过**，损坏被限制在该行。**这是正确行为，特此记录以防未来误判重查。**

### 4.3 损坏 `state.json`：**降级安全**（不记为缺陷）

实机（把 `state.json` 截成 `{"sessionId":"x"` 后 `--resume`）：

```
- Session lifecycle: Current session pointer ignored: … Failed to load session state from …:
  Expected ',' or '}' after property value in JSON at position 16 … Starting a fresh session.
```

即**明确报告、降级为新会话、不静默丢数据**。符合 `AGENTS.md` 的状态区分要求。

### 4.4 `/todo`：内存单例，**不持久化**（跨 resume 丢失）

**判定**：**DEFECTIVE / DEMO（CONFIRMED，读码 + 实机）**。

`core/commands/todoCommandRuntime.ts:9-10`：

```ts
let sessionTodoList: TodoItem[] = [];
let nextTodoId = 1;
```

模块级可变单例。`core/tools/todoTool.ts` **直接复用**同一个 `runTodoCommand`，
所以**模型与用户共用同一份进程内存**。实机确认待办清单既不写入
`state.json` 也不写入 transcript（`find` 会话目录后 `grep todo` 零命中）。

**三个后果**：
1. **跨 resume 丢失**——用户恢复会话后清单为空，而 `sessionFacts.ts:75` 的
   `openTodos` 计数器会**报告 0**，即状态条显示「没有未完成事项」而事实相反；
2. **跨会话泄漏**——同进程内切换会话时清单跟随进程而非会话；
3. **与 peer 实现相反**：`source-claudecode` 的任务列表按会话/任务作用域存放。

**修复方向**（16-H）：清单落到会话状态（`state.json` 的既有快照机制已支持扩展字段），
或落到项目状态；`getSessionTodos()` 改为按 `sessionId` 取。

### 4.5 未发现的无界增长（已核实）

`crashLog` 有 5 条 / 7 天双上限；`PasteStore` 有 `MAX_HELD = 128`（文本与图片各一）；
`KillRing` 16；`EditHistory` 有 limit；`ProcessTreeManager.trackedPids` 在
`untrackPid` 与 `killAllTracked` 双向清理；kitty 图片有 Phase 15 的 32 张 / 32MiB 预算。
**transcript 的 `blocks` 数组本身无上限**——这是**正确**的（会话必须完整保留），
但它与 §3.1 的每帧 O(N) 相乘，是**性能**问题而非**内存**问题。

---

## 5. Slash 命令面

### 5.1 全量 real-vs-stub 审计结果：**零桩**

子代理逐命令读 handler 体并给出 45 条目的表格，结论是
**没有任何命令只打印罐头字符串或返回硬编码值**；全部接真实引擎
（git、provider、日志 sink、记忆 store、DAG runner）。主代理抽查 6 个
（`/compact`、`/memory`、`/browser`、`/sidebar`、`/todo`、`/diagnose`）**同意该结论**。

**但**：命令「真实」不等于**行为正确**——§1.2 与 §4.4 两处缺陷正是在真实 handler 内部。

### 5.2 广告与派发不一致：两个命令带参数必然报未知命令

**判定**：**WIRING-INTERRUPTED（CONFIRMED，探针 + 实机）**。

自建探针比对「`slashCommandRegistry` 广告的名字」与「`createCommandRegistry` 能派发的名字」：

```
dispatch entries: 111   slash entries: 114
slash-only (would say 'Unknown slash command'): ["statusline","status","back"]
```

`PICKER_ONLY`（`entrypoints/slashCommandRegistry.ts:61-72`）把 `statusline` 与 `back`
注册进**帮助与补全**，但**不进派发注册表**；而 `opensPicker`（`picker/registry.ts:101-106`）
只对**不含空白**的行生效：

```ts
const name = trimmed.slice(1).toLowerCase();
return !/\s/.test(trimmed) && name in PICKERS;
```

`statusline` 的 `argumentHint` 是 **`"use <preset|item...>"`**，即帮助文本**教用户带参数**，
而带参数的行因 `/\s/` 判定失败 → 落到 `routeSlashCommand` → 未知命令。

**实机复现**：

```
$ printf "/statusline use preset\n" | cheers
Unknown slash command: /statusline
$ printf "/back 2\n" | cheers
Unknown slash command: /back
```

### 5.3 `bridgeSafe` 是死字段，`/permissions` 在非交互模式被拦

**判定**：**WIRING-INTERRUPTED（CONFIRMED，实机）**。

Phase 9 §5.2 的 **S2** 已记录 `ToolDefinition.permissions.check` 无消费者；
本轮发现**同型的第二个**：`CommandDefinition.bridgeSafe`（`core/commands/types.ts:153`）
在 `registry.ts` 里被声明 **30+ 次**，而 `grep` 显示**除声明处外零消费者**。

后果实测（`/permissions` 声明 `bridgeSafe: true`）：

```
$ printf "/permissions list\n" | cheers
- Outcome: blocked
- Reason: This shell action is interactive-only.
```

`cliRuntimeModule.ts:325` 对 `manage-permissions` 这类 action 一律走
`renderInteractiveOnlyShellActionBlocked`，**从不问 `bridgeSafe`**。
即：**字段在承诺非交互可用，代码在拒绝它**。

**修复方向**（16-I）：
- **二选一**：要么把 `bridgeSafe` 接进 `cliRuntimeModule` 的分支（声明为真的命令走非交互路径），
  要么**删掉该字段**连同 30+ 处声明（与 Phase 15 §16.3 对 `ToolDefinition.permissions`
  的处置同型）；
- `/statusline` 与 `/back`：**二选一**——要么在派发注册表里补带参数实现，
  要么把 `argumentHint` 从 `PICKER_ONLY` 里删掉（承认它们只有裸形式）。

### 5.4 缺失命令（相对 pi）

pi 有而我们没有且**不属于已登记 backlog**（`/import` `/share` `/name` 已记）：
**`/tree`**（pi `core/slash-commands.ts:22`；我们只有 `/entries tree`）、
**`/session`**（会话信息与统计）、**`/changelog`**、**`/login` `/logout`**（我们有 `/connect`，
属 parity 形态差异）。其中 **`/tree` 值得做**——分支导航已有实现（`/back` + `/entries tree`），
缺的只是一个一等入口。

---

## 6. Provider 与流式

> 本节由子代理 W1g 产出，**每一条均由主代理复验**（读码或探针）。标注「已复验」者为亲测。

### 6.1 流内错误被静默吞掉（**已复验**，P1）

**探针**：把 `data: {"error":{"message":"upstream exploded","type":"server_error"}}`
夹在两个正常增量之间喂给 `readCompletionStream`：

```
fragments: [{"kind":"text","text":"Hel"},{"kind":"text","text":"lo"}]
```

**结果 "Hello" 被当作正常完整回答**。根因：`DeltaChunk`（`turn/completion.ts:115-124`）
**没有 `error` 字段**，`absorb`（`:325-345`）只读 `choices`，错误帧被当成空帧。

**对照 pi**：`packages/ai/src/api/openai-completions.ts:578-581` 显式处理
流内 `error` 对象。**provider 侧的 status/headers 是对的**（`headers` 拼装、
`Retry-After` 解析、429/5xx 分类都有），**错的只是流内错误**——这恰好是最常见的
「上游半路挂掉」形态。

### 6.2 Google `finishReason` 把 SAFETY/OTHER 映射成 `stop`（**已复验**，P1）

`provider/endpoints/googleWire.ts:187-191`：

```ts
export function mapGoogleFinishReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  if (reason === "MAX_TOKENS") return "length";
  return "stop";
}
```

**对照 pi**（`packages/ai/src/api/google-shared.ts:443-465`）把
`BLOCKLIST / PROHIBITED_CONTENT / SPII / SAFETY / IMAGE_SAFETY / IMAGE_PROHIBITED_CONTENT /
IMAGE_RECITATION / IMAGE_OTHER / RECITATION / FINISH_REASON_UNSPECIFIED / OTHER / LANGUAGE /
MALFORMED_FUNCTION_CALL / UNEXPECTED_TOOL_CALL / TOO_MANY_TOOL_CALLS / NO_IMAGE`
**全部映射为 `"error"`**，并且用 `never` 穷尽检查保证新增枚举必须被处理。

叠加 **`turn/step.ts:608-611` 的 `stopReasonOf` 也只认 `"length"`、其余归 `"stop"`**，
所以「被安全策略截断」在两条映射上**都被抹平**，用户看到一个自信的短回答。
（`promptFeedback.blockReason` 一条路径**有**被处理并抛错，`googleWire.ts:280-282`；
被抹平的是 `candidates[0].finishReason` 一条。）

### 6.3 Bedrock：丢图片、不传 thinking 预算（**已复验**，P1/P2）

- `bedrockConverse.ts:140-142` 的 `textOf()` **只取 `block.type === "text"`**，
  于是发给 Bedrock 视觉模型的图片块被**静默丢弃**；同仓
  `anthropicMessages.ts:264-275` 对同一数据结构**正确**展开了图片块。
- `converseBody` 只把 `thinkingLevelName` 用于**抑制 temperature**（`:209`），
  **从不下发 `additionalModelRequestFields.thinking`**，故 Bedrock 上的扩展思考不可用。

### 6.4 次要流式缺陷（**已复验**）

- **Google 流尾未分隔事件被丢**：`googleWire.ts:260-315` 的循环只在
  `findEventBoundary` 找到 `\n\n`/`\r\n\r\n`/`\r\r` 时才解析，
  **EOF 后残留 buffer 不处理**——最后一个无空行的 `data:` 帧（常带 usage）丢失。
  `turn/completion.ts:284-287` 对同一情形**有**尾处理，两处不一致。
- **Anthropic 流内 `error` 后仍等 EOF**：`anthropicMessages.ts:472-475` 记下
  `streamFailure` 后 `continue`，直到流自然结束才在 `:543` 抛。
  若代理保持连接不关（keep-alive 常见），**读端会一直等**。
  同仓 `bedrockConverse.ts:308-320` **立即 throw** 并显式说明「不继续读」——
  两处对同一问题给出相反处置。
- **次要模型调用不带 `supportsTemperature`**：`core/query/compaction/summarize.ts:122-128`
  与 `provider/request/completion.ts:79-88` 的 `endpointBody` 调用**没有**传
  `supportsTemperature`，而 `turn/step.ts:303` 传了。
  对拒绝 temperature 的推理模型，**压缩请求会 400**。

### 6.5 已核实健全（不需改）

所有文本流都使用 `decoder.decode(chunk.value, { stream: true })`
（`turn/completion.ts:271`、`googleWire.ts:262`、`anthropicMessages.ts:521`）——
**UTF-8 多字节跨块安全**；Bedrock 的二进制事件流按 CRC32 校验整帧后再解析；
`completion.ts` 用 `while (nextEvent(buffer))` **完整排空**一个 chunk 内的多事件。

---

## 7. 子代理错误断言（核实后剔除，留档）

| # | 断言 | 来源 | 核实 | 结论 |
|---|---|---|---|---|
| 1 | 「`colorToAnsi` 的 `index < 16` 分支会发出 `\x1b[38m` 非法序列」 | W1a F1 | 主代理探针穷举 `closestColor` 值域 = **16..255**，该分支**不可达** | **错**，剔除（**但**「无条件降 256 色、忽略 truecolor、忽略 `NO_COLOR`」**成立**，见 §3.2） |
| 2 | 「`hasTrueColor`/`has256Color` 是死字段、主题引擎不消费终端能力」 | W1a F2 | 属实（`grep` 只命中声明与 test double） | **对**，保留（并入 §3.2） |
| 3 | 「sidebar 整层未接 TUI」→ 读作「未接线/死代码」 | W1a F5 | 模块图显示 27 个文件**全部有生产消费者**，经 `/sidebar` 命令接通 | **半错**，更正为「已接通但形态是文本面板而非分栏」（§3.3） |
| 4 | 「`/statusline` 因 `opensPicker` 的 `\s` 判定报未知命令」 | W1b F1 | 主代理**实机复现** | **对**（§5.2） |
| 5 | 「`cacheWaste` 缺 `idleMs`/`modelChanged` 归因」 | Phase 15 留档 | 字段存在（Phase 15 已剔除） | 沿用 |
| 6 | 主代理自身：`cliFatalErrorBoundary.ts` 与 `handleSigint.ts` 均为 test-only | 本代理 | `cli.tsx:7,31` **确实**引用前者；只有 `handleSigint.ts` 真为孤立模块 | **主代理自我更正**：孤儿只有 `handleSigint.ts` |

**方法论记录**：本代理首版「test-only 模块」扫描**只匹配双引号**，
把单引号 import 全判为无消费者，导致 `editEngine.ts`、`taskTool.ts`、`lsp.ts` 等
**被误报为孤立**。改为 `['\"]` 双向匹配后复扫，结论才收敛。
**教训与 `interactive-issues.md` §0 同型：工具出错时先怀疑工具。**

---

## 8. 死代码与接线中断（模块图系统性结果）

自建可达图（从 `entrypoints/cli.tsx` BFS，864 个非测试模块）：**46 个从 CLI 不可达**。

| 类别 | 数量 | 判定 |
|---|---|---|
| `core/harness/**`（场景夹具与 runner） | 29 | **测试基础设施**，放在 `core/` 下但只被测试用。**不是缺陷**，但位置错（应在 `test-utils/`），且 `check:declarations` 类门禁看不见 |
| `test-utils/**` | 9 | 正常（本就是测试工具） |
| `edit/patch/plan/{hunkSet,fencedEditMapping}.ts` + `edit/patch/apply/conflict.ts` | 3 | **真死代码**：三者互相引用成一个封闭三角，**无任何外部消费者**（`grep 'edit/patch'` 在生产代码零命中）。合计 **429 行** |
| `eval/browser/**` | 3 | 浏览器评测框架，**无生产入口**（`grep` 零命中） |
| `policy/workspaceFileContract.ts` | 1 | 205 行，零消费者 |
| `result/projection/runtimeHandoffProjection.ts` | 1 | 502 行，零消费者 |

**最值钱的一条**：`edit/patch/**` 的 `hunkSet`（188 行）实现了一套
**精确 hunk 范围匹配 + 重复/重叠冲突检测**，而生产编辑路径
（`core/tools/editEngine.ts` + `registry.ts` 的 `edit`）用的是自己的 `replaceInContent`。
**即：一套更严格的冲突检测写好了但没接上**。这与 Phase 5 删掉的「报告投影族」
（32 文件 / 8,330 行）同型，只是规模小得多。

**修复方向**（16-J）：`edit/patch` 三角与 `runtimeHandoffProjection`、`workspaceFileContract`
按 Phase 5 的先例**逐条确认闭包后删除**（先跑 `tsc` 抓悬空 import——Phase 5 的教训是
子代理会把有引用者的文件误列进闭包）；
`hunkSet` 若其冲突检测确实强于 `replaceInContent`，则**接入而非删除**（需一次对比测试）；
`core/harness/**` **移动**到 `test-utils/`（纯位置问题，但会让「`core/` 里全是生产代码」
这条心智模型重新为真）。

---

## 9. 建议执行序（供裁决文档使用）

按「缺陷严重度 × 修复成本」排序，**每项独立提交 + 撤销验证**：

| # | 项 | 类别 | 依赖 |
|---|---|---|---|
| **16-A** | 项目记忆注入链（§1.1） | P0 接线 | 需先定「记忆落在项目内还是用户目录」 |
| **16-D** | 浏览器假成功（§1.4） | P0 欺骗性返回 | 与 16-E 同一提交 |
| **16-E** | 浏览器双栈收敛 + 策略层（§2） | P0 安全边界 | 需定「是否允许浏览 localhost」 |
| **16-B** | `/compact` 合并 + 钩子（§1.2） | P1 语义分裂 | 无 |
| **16-I** | `bridgeSafe` 接线或删除 + `/statusline` `/back` 参数（§5.3） | P1 声明与行为不符 | 无 |
| **16-G** | 会话锁陈旧回收（§4.1） | P1 可用性 | 无 |
| **16-C** | `regular` 主屏记账重写（§1.3） | P1 结构性 | 独立，体量最大 |
| **16-K** | provider 流内错误与 finishReason（§6.1/6.2） | P1 错误保真 | 无 |
| **16-H** | `/todo` 持久化（§4.4） | P2 状态丢失 | 无 |
| **16-F** | 每帧 O(N) 与 `documentRows` 惰性化（§3.1） | P2 性能 | 无 |
| **16-J** | 死代码清理 + harness 归位（§8） | P2 债务 | 需闭包核实 |
| **16-L** | Bedrock 图片/thinking、Google 尾帧、次要模型 temperature（§6.3/6.4） | P2 protocol 保真 | 无 |
| **16-M** | `NO_COLOR`/`FORCE_COLOR`/truecolor/`"stream"`（§3.2） | P3 TUI | 无 |
| **16-N** | 代码围栏语法着色（§3.4） | P3 TUI | 参考 pi 的 56 令牌表 |

**明确不做（本轮）**：真正的 alt-screen 分栏侧栏（§3.3，产品决定）；
`/import` `/share` `/name`（Phase 15 已记 backlog）；
MCP SSE/HTTP 传输与 per-prompt gateway 重建（Phase 15 已记 backlog）。

---

## 10. 本轮边界与未覆盖面

- **未做**：`browser/**` 内 160 个模块的**逐个** real-vs-demo 判定（`W2aBrowserStack`
  因上游 402 终止）。§2 给的是**入口级**可达性与策略旁路结论；
  策略层内部是否有 demo 模块**尚未逐一核实**，列为下一轮首要任务。
- **未做**：`cli/interactive/**` 的键位可发现性 diff（`W1c`/`W1f` 三度被 `content_filter` 拦截）。
  §3.2/§5 覆盖了相邻面，但**键位与文档的双向 diff 未产出**。
- **未做**：`session/continuation/**`（27 文件）与 `session/recovery/**` 的逐项审计；
  本轮只覆盖了锁、截断、损坏降级三条路径。
- **未做**：真实 provider 端到端（无可用凭据，且 `AGENTS.md` 禁止触碰真实配置）；
  §6 全部结论来自**读码 + 合成块探针**，标注为已复验的部分均给了可重跑的探针。

---

## 11. 附：本轮探针清单（可重跑）

| 探针 | 验证对象 | 结论 |
|---|---|---|
| `MainScreenPainter` + 假设备 | `regular` 原地增长 / suspend | 新行不写；suspend 后重复追加（§1.3） |
| `createUnifiedBrowserToolDefinition().execute` × 6 动作 | 浏览器假成功 | Chromium 缺失时 6 个动作全部 `success:true`（§1.4） |
| 模块可达图（ESM import + BFS from `cli.tsx`） | 死代码 / 双栈 | 46 不可达；模型侧 13 vs 命令侧 160（§2.1、§8） |
| `browser` 工具 vs `/browser` 命令的闭包差 | 策略旁路 | 允许清单/回执/沙箱全部不经模型侧（§2.2） |
| `TranscriptPane.render` + `documentRows` 缩放曲线 | 每帧成本 | 500→1.63ms，20000→48.82ms（§3.1） |
| `withFileLock` + 预置陈旧锁 | 会话锁 | 1218ms 后抛错，锁文件留存（§4.1） |
| `readTranscript` + 截断最后一行 | transcript 韧性 | 完好读 2 条，坏行跳过（§4.2） |
| 真实 CLI 截断 `state.json` 后 `--resume` | 状态降级 | 明确报告 + 起新会话（§4.3） |
| `slashCommandRegistry` vs `createCommandRegistry` 名单比对 | 广告与派发一致 | 3 个名字广告不派发（§5.2） |
| 真实 CLI `/statusline use preset`、`/back 2`、`/permissions list` | 命令行为 | 前两者未知命令；第三者 interactive-only（§5.2、§5.3） |
| `readCompletionStream` + 合成错误帧 | 流内错误 | 错误被吞，`"Hello"` 当完整回答（§6.1） |
| `THEME_COLOR_TOKENS` vs 两个主题 JSON | 主题完整性 | 缺失 0 / 多余 0（§3.2） |
| `closestColor` 值域穷举 | 16 色分支可达性 | 16..255，分支不可达（§7） |

**探针纪律**：全部探针脚本均写在 `packages/ts-shell/src/.probe_*.ts`，
**运行后即删除**，工作区在每轮结束时为干净状态。

**本轮门禁结果**（文档-only 改动，仍按维护者纪律全跑）：
`check:config-consumers` / `check:declarations` / `check:node-floor` /
`verify:import-cycles` / `test:scripts` **全部 PASS**；
`verify:docs-drift:strict` → `rules_dangling 0`、`docs_dangling 0`，
docs-source 计数 118 条为 **advisory**（本轮未新增引用）。
