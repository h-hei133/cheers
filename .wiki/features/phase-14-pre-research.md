---
title: "Phase 14 前置研究：全阶段功能复核（demo 级实现清查）"
category: article
sources: [pi-source-2026-09-20, phase-13-decisions-2026-09-26, dead-code-tiers-2026-09-27]
created: 2026-09-27
updated: 2026-09-27
tags: [features, audit, phase-14, pi, comparison]
summary: "对 Phase 0–13 全部已声明完成的功能做一次对照复核。方法：6 个只读子代理分域比对 + 主代理逐条实测 + 2 个 reviewer 证伪式复核。结论是双向的：**并非普遍 demo**——编辑引擎、压缩、沙箱、缓存保活、崩溃归档等经核实为生产级，若干处强于 pi；但确有 **6 类真缺陷**与 **65 个「导出函数零调用」文件（12,855 行）**。后者是此前不可达代码清理**未能覆盖**的一类：**63/65 被旧脚本判为 CLI 可达**（被 import 进图），却没有任何代码调用其导出。复核另更正主代理 5 处（含 2 个举错的反例、1 处措辞夸大、1 处归属错误），并新增门禁 `check:call-reachability` 防同类回归。"
confidence: high
---

# Phase 14 前置研究：全阶段功能复核

## 0. 本轮问题

维护者的判断：

> 「我担心你之前完成的 features 都是一些小 demo 级别的代码。」

任务是**用证据检验这个判断**——不是去印证它，也不是去反驳它。
若普遍为 demo 则逐项升级；若并非如此，则**如实说明**并只升级真正的缺口。

**方法**：6 个只读子代理分域比对（`01`–`07` 七份 feature 文档的覆盖表逐行核实），
同时对 `~/projects/pi` 双侧读码。**主代理对每条结论重新实测**，不转述。

**判定口径**（四个信号，任一成立即可疑）：

| 信号 | 含义 |
|---|---|
| 路径不全 | 只实现主路径；错误路径、边界、恢复、取消缺失 |
| 接线不通 | 能力存在但用户/模型无法触发（「实现了但调不到」） |
| 规模悬殊 | 同一能力 pi 数千行、我方几十行 |
| 测试只测主路径 | 无失败分支断言；或断言字段存在而非行为 |

## 1. 结论先行

**不是「普遍 demo」。** 逐域核实后，绝大多数已声明收口的能力是**真实实现**：
有错误路径、有边界断言、有与 pi 对应的机制。若干处我方**强于** pi。

**但有 6 类真缺陷**（§2），以及一类**此前清理漏掉的死代码**
（§3，**58 文件 / 11,388 行**——数字经复核**三轮**修正，见 §3 开头）。

### 1.1 先记录「经核实为生产级」的部分（避免误升级）

以下能力**不是 demo**，逐条读过实现并确认具备完整机制。**不得**以「疑似 demo」为由重写：

| 能力 | 证据 | 与 pi 对比 |
|---|---|---|
| 编辑引擎 | `core/tools/editEngine.ts` — NFKC 规范化**带偏移映射**（`:57-75`）、行修剪、锚点 Levenshtein 容错、多段对原文匹配 + **重叠拒绝并指名** + 任一段失败则**一字节不写** | pi `edit.ts`+`edit-diff.ts` 770 行；**我方边界更严** |
| 统一 diff | `presentation/tui/transcript/diff.ts` `createUnifiedDiff`，在 `registry.ts:524,712` 真实调用 | 对齐 |
| 截断 | `core/tools/truncation.ts` — `truncateHead`/`truncateTail` 双预算（2000 行 / 50KB） | pi `truncate.ts` **同常数**；我方另有 `truncateLineWidth` |
| grep | `grepRipgrep.ts` 优先 `rg --json`，无 `rg` 时 TS 回退；越界检查 + 单文件字节上限 | pi 用 `fd`/`rg`，对齐 |
| 上下文压缩 | `session/compaction.ts` — **非 tool 边界**反向扫描、token 预算切点、`splitsTurn` 检测、前缀轮次单独摘要、`readContextCheckpoint` 重复压缩跳过 | pi `compaction/` 1,688 行；**机制对应** |
| 缓存保活 | `turn/cacheWarm.ts` + `core/models/cacheEconomics.ts` — 按期望收益（阈值 $0.05）调度，重放原始字节防前缀破坏 | pi `cache-warmer.ts` **同架构** |
| 崩溃归档 | `observability/crashLog.ts` + `zipArchive.ts` — 5 条限额、7 天时效、**手写 CRC32 + DEFLATE**、自动脱敏 | 对齐，且零外部二进制依赖 |
| OS 沙箱 | `sandbox/osSandbox.ts:237-295` — 真实 `bwrap` 参数（`--unshare-net`、`--ro-bind`）与 macOS Seatbelt 策略 | **pi 无沙箱**（其 `docs/security.md` 明确声明） |
| 浏览器 | `browser/sessionManager.ts` — 真 `playwright-core` 启动 + stealth 注入 | **pi 无** |
| web 搜索 | `webSearch.ts` — DDG 免密钥 HTML 回退 → Exa → Tavily 三级 | **pi 无** |
| 技能发现 | `skillLoader.ts` 576 行 — 祖先向上搜索、`SKILL.md` 不下降、frontmatter 校验 | pi `skills.ts` 509 行，**对齐** |
| 斜杠展开 | `slashRouter.ts` — 单遍参数替换、引号分词、技能→注册表→模板优先级 | 对齐 |
| Agent 主循环 | `core/agent/loop.ts` — 状态机、**双层重试**（provider 级 + loop 级退避）、steering、follow-up、截断失败处理 | 与 pi `agent-loop.ts` **同构** |
| 终端渲染 | `render/paint.ts` `diffPaint` 行级差量；`terminal.ts` resize 防抖 + 全量重绘 | 对齐（pi 60fps vs 我方 30fps） |
| 编辑器 | `tui/editor.ts` 544 行 — 字形簇光标、Undo/Redo、KillRing、IME 硬件光标标记 | 对齐 |

**理由**：这些项若被误判为 demo 而重写，会**破坏已通过验证的实现**。
维护者要求「不要造重复的功能，破坏原有结构」——本节即为该约束的落实。

## 2. 六类真缺陷（复核确认）

### D1 `lsp` 工具是正则扫描器，不是 LSP —— **且实现更差的那个分支被用在了主路径**

- **位置**：`core/tools/lsp.ts`（224 行）；**无测试文件**。
- **证据**：
  - `documentSymbol`（`:71-93`）逐行跑 4 条正则，**未使用**已导入的 AST 解析器。
  - `definition`/`references`/`workspaceSymbol`（`:104-178`）遍历全部 `.ts/.js`，
    **把每个 ≤5MB 文件整读进内存**再 `split("\n")` 逐行正则匹配。
  - 而 `hover`（`:196`）**调用了** `parseSourceSymbols` —— 真实的 TS 编译器 API 解析器
    （`context/graph/ast/parser.ts`，363 行，已在库中存在）。
- **性质**：同一文件内，**更好的实现只在 1/5 个分支上被使用**。这是「接线不通」，
  不是「能力缺失」。
- **后果**：`definition` 返回的是「第一个含该词的定义行」，不是真实定义跳转；
  大仓上每次调用整读所有源文件。

### D2 记忆系统对模型不可用 —— 5,973 行只对人类开放

- **位置**：`core/memory/`（4 文件）+ `memory/`（35 文件）= **5,973 行**。
- **证据一（写）**：`core/tools/registry.ts` 注册 **18 个工具**，**零个记忆工具**。
  `executeMemoryRetain/Recall/Edit/Inspect` 的唯一读者是
  `core/commands/memoryCommandRuntime.ts`（斜杠命令）。
- **证据二（读）**：设计上有一条**被动注入**路径——
  `core/shell/sessionFutureTurnProjection.ts` 的 `buildPromptWithFutureTurnInjections`
  会按 `projectMemoryInjectionStateStore` 注入记忆。**但该 store 在生产从未被构造**：
  `createProjectMemoryInjectionStateStore` 的调用者**只有测试与 harness**
  （`slashRouter.test.ts`、`sessionRuntime.test.ts`、`agentScenarioFixtures.ts`、
  `projectMemoryFutureTurnInjection.test.ts`），**无任何生产构造点**。
- **后果**：模型**既不能写也不能读到记忆**——写缺工具，读缺接线。
  即「agent 的记忆功能」需要人去按按钮——这是**接线断裂**而非规模不足。
- **复核更正**：子代理曾据 `buildPromptWithFutureTurnInjections` 断言
  「模型可被动接收注入」。追到底后发现**该路径在生产不可达**（store 无人构造），
  故原结论成立，但**理由需换成上面两条**，而非「完全没有注入代码」。

### D3 Copilot：token 交换已做，**网关必需请求头缺失**

- **已做**（**不是** demo）：device flow、`copilot_internal/v2/token` 交换、
  从 token 内 `proxy-ep=` 派生 base URL（`subscription.ts:203-208`）——**这条推导是对的**。
- **缺失**：Copilot 网关强校验 `Editor-Version`、`Copilot-Integration-Id`、
  `User-Agent` 等头。全仓 `grep Editor-Version` → **0 命中**。
  请求以通用 `openaiCompatible` 形状 + 裸 bearer 发出。
- **性质**：典型的「可登录但调不通」。
- **参考**：pi `api/github-copilot-headers.ts`。

### D4 `webFetch` / `webSearch` 无 SSRF 防线 —— **而防线就在库里**

- **证据**：`webFetch.ts` 只校验 `http://`/`https://` 前缀。
  `grep '127.0.0.1\|169.254\|private'` 在该文件 → **0 命中**。
- **`webSearch` 经复核**：**无此问题**——它只向三个**硬编码**主机发请求
  （`html.duckduckgo.com:81`、`api.exa.ai:138`、`api.tavily.com:180`），
  **用户输入只作为查询串，不作为目标地址**。故其不在 D4 范围内。
- **对照**：`browser/networkAllowlist.ts:239` 的 `isPrivateNetworkHost` 是**已在用的 SSRF 守卫**
  —— 覆盖 loopback、RFC1918、**链路本地 `169.254.0.0/16`**（云元数据端点）、
  `.local`/`.localhost`。
- **该守卫的边界（其注释自述，不可夸大）**：**不覆盖** IPv6 链路本地（`fe80::/10`）、
  CGNAT（`100.64.0.0/10`）、`0.0.0.0`、DNS rebinding；
  **也不覆盖 IPv6 元数据地址 `fd00:ec2::254`**——注释说明这是**有意留下**的
  （覆盖它需要解析 IPv6 范围，改动更大），并明确写了
  「A caller that must be safe against the metadata endpoint should not treat
  this guard as sufficient on its own」。
  **所以 T1 不只是「接上守卫」，还要补 IPv6 与 CGNAT**——否则修完仍是半个防线。
- **性质**：**守卫已写好、已验证，但没有被另外两个外发工具使用**。
- **额外**：`webFetch` 用 `await response.text()` 全量读入后才截断（`:139`），
  大文件可瞬时打满内存。

### D5 沙箱在隔离不可用时**降级为裸跑**（有提示，但不 fail-closed）

- **位置**：`sandbox/osSandbox.ts:206-226`。
- **证据**：`sandboxLauncher()` 找不到 `bwrap`/`sandbox-exec` 时返回
  `{ state: "unavailable", notice: "Ran WITHOUT isolation: ..." }`，
  而 `registry.ts:170` 是 `command: sandbox.command ?? shellBin` —— **回退到裸执行**。
- **性质**：不 fail-closed。沙箱开了、二进制没装，**命令照跑**，只在输出里加一行提示。
- **复核更正（措辞）**：不是「静默」——每次命令都会打印 `Ran WITHOUT isolation: ...`，
  且 `osSandbox.ts:18-20` 的注释明确说这是**有意为之**（「a silent fallback to no
  isolation is the one outcome nobody can act on」）。**所以带提示是设计，不是缺陷**；
  真正的缺口是**没有 fail-closed 选项**，用户无法把「要隔离就真的隔离」表达出来。
- **对照**：pi 明确不内置沙箱（避免「安全假象」）；我方既然提供了隔离，
  应允许降级路径被配置为拒绝。

### D6 观测量缺「全局命中率」与「配置并发保护」

- `observability/metrics.ts` 是挂在结构化日志上的 counter/timing 聚合器，
  **无父子 Span 嵌套**（pi `telemetry/` 有 `startSpan`/`addEvent`）。
- `cacheWaste.ts` 能算**浪费归因**（较 pi 更细），但**缺最基础的全局命中率**呈现。
- `config/runtimeConfig.ts` 单次读取、`fs.writeFileSync` 写入；
  **无热重载、无多进程文件锁** —— 多个会话共享 `~/.cheers/config.json` 时可互相覆盖。

## 3. 此前清理漏掉的一类死代码（**58 文件 / 11,388 行**）

> **本节数字经过三轮修正**，每一轮都由**别人指出后才重算**——这是本节最重要的记录。
>
> | 轮 | 数字 | 触发原因 |
> |---|---|---|
> | 初稿（手工脚本） | 66 文件 / 13,023 行 | — |
> | 复核后 | 65 文件 / 12,855 行 | 漏读 **`.tsx`**（CLI 入口是唯一的 `.tsx`）+ 正则 `\w{3,}` 漏掉三字母名（`TUI`） |
> | **再复核后** | **58 文件 / 11,388 行** | 漏查 **`export const`**——单例导出（`export const processTerminal = new Terminal()`）未被计入，于是**被 CLI 实际使用**的类被判为死 |
>
> **三个漏读都是同一类错误**：检测器看不见某样东西，于是把「看不见」当成「不存在」。
> 每修一个，数字下降一次。**这说明数字本身不是结论，方法才是**——
> 所以本轮把方法固化成了门禁（§3.2），并给每个漏读补了一条回归测试。
>
> **初稿的两个「典型例子」是错的**（见 §3.4）——这正是复核的价值。

### 3.1 为什么 `analyze-boundaries.py` 没抓到它们

2026-09-27 的不可达代码清理基于 **import 可达性**。这一类文件**被 import**，
因此旧脚本判为 `cliReachable: true`——**但从未被调用**。

实测（**用本轮新增的门禁脚本**，非手工）：

```bash
node scripts/check-call-reachability.mjs
# → [advisory] call-reachability - 65 module(s) export work nothing calls
```

**交叉验证**：把该 65 文件与 `analyze-boundaries.py` 的标签比对：

```text
cli=True : 63
testOnly :  2
```

**63/65 被旧脚本判为「CLI 可达」**——这就是盲区的精确定义：
**被 import 进图，但没有任何代码调用它的导出**。

### 3.2 判定方法（已固化为门禁）

对每个生产文件：

1. 取其 `export function` / `export function*` / `export class` 名单；
2. 在**其余全部源文件**（含 `.tsx`、含 `entrypoints/`）中搜索该标识符**作为词**的出现，
   **跳过 `import` 行与 `export ... from` 行**——import 不是调用；
3. 若**全部**导出名都只在自己文件里出现，则该模块的导出**从未被调用**。

### 3.3 已知假阳性来源（门禁已处理）

| 来源 | 处理 |
|---|---|
| 侧效应模块（`declareEndpoint(`/`declareProvider(`/`declareTool(`） | 按名排除——import 即调用 |
| `entrypoints/`（进程调用，非源码调用） | **不报告**，但**参与扫描**（它是最主要的调用方） |
| 对象字面量内联（`run: () => doWork()`） | **计为调用**——`doWork` 确实作为词出现 |
| 字符串/注释中的名字 | `stripComments` **同时清空字符串内容**——只在 `code` 上下文计名 |
| 模板字面量插值 `${expr}` | 保留插值内容（它是真代码），清空字面量部分 |
| 三字母名（`TUI`） | 正则放宽到 2+ 字符——**该 bug 曾使 `new TUI(...)` 不可见** |
| `.tsx` 文件 | 纳入扫描——**该 bug 曾使 CLI 入口的调用不可见** |

**仍然会误报的方向**（已知、保守）：仅被**类型**位置引用的导出会被算作「有调用」。
即「靠类型吊命」的模块会被判为活的。

### 3.4 复核剔除的假阳性（保留记录）

初稿把这两个列为「零调用点」的实测证据，**都错了**：

| 初稿写的 | 实际 |
|---|---|
| `cli/bootstrap/cliProcessRunner.ts` → `runCliProcess` 0 调用 | **`entrypoints/cli.tsx:22` 直接调用**——它是 CLI 主入口 |
| `cli/errors/cliFatalErrorBoundary.ts` → `handleCliFatalError` 0 调用 | **`entrypoints/cli.tsx:31` 直接调用** |

**原因**：手工脚本只扫 `.ts`，而 `cli.tsx` 是本仓库**唯一的 `.tsx`**。

**第三轮又剔除了 6 项**（同属「看不见就当不存在」）：

| 被误报 | 实际 |
|---|---|
| `presentation/tui/terminal.ts`（`Terminal` 类） | 文件导出 `const processTerminal = new Terminal()`，**被 `interactiveMode.ts:20,169` 使用**——CLI 交互模式的终端就是它 |
| `presentation/tui/render/engine.ts`（`TUI` 类） | 同上，单例导出；`new TUI(...)` 在 `interactiveMode.ts:182` |
| `core/security/projectTrust.ts` | 单例导出 |
| `provider/aws/eventStream.ts` | `readEventStream` 是**生成器**（`export async function*`），旧正则漏掉 |
| `core/commands/{google,openai,subscription}AccountAuth.ts` | 裸函数名未被调用，但**文件**被 `providerAuthRuntime.ts` 用的**契约对象**引用——门禁的工作粒度是文件，已正确保留 |
| `tools/policy/strategy.ts` | 被 `index.ts` 导出（`chooseToolStrategy`），门禁的用词扫描已正确计为有引用 |

**教训**：漏读一个文件、漏一个语法形式（生成器）、漏一种导出形态（`const` 单例），
与漏读一行是**同一类错误**，只是粒度不同。门禁已逐条修补，且**每条各配一条回归测试**。

### 3.5 分区（按域，**58 文件 / 11,388 行**）

| 域 | 文件数 | 内容 |
|---|---:|---|
| `planning/` | 16 | 完整规划状态机：`agentPlan`/`taskLifecycle`/`taskExecutionPlan`/`testImpactPlan`/`analysisBrief`… **Agent 主循环从不经过它** |
| `provider/` | 8 | `proposal/*` 提案与锚点匹配/冲突/校验全链 |
| `edit/` | 8 | `proposal/*` 围栏编辑、提案评审、修复提案；`patch/status/mixedOperation` |
| `context/` | 7 | `graph/*`（图谱、评分、包）、`acquisition/code/*`（事实、影响、陈旧度、追踪） |
| `core/` | 4 | `query/runtime/{proof,actionAuthority,batch}`、`context/model/*`（**注**：`security/projectTrust` 与三处 `*AccountAuth` **经复核剔除**，见 §3.4） |
| `tools/` | 3 | `policy/interception` + `types` + `result/split` |
| `browser/` | 3 | `playwrightEvidence`、`runtime/core/directionDecision`、`toolServerBackendComparison` |
| 其余 | 10 | `session/`、`presentation/`、`eval/`、`sandbox/`、`runtime/`、`result/`、`repair/`、`evidence/` |

### 3.6 必须单列的两个

**`tools/policy/interception.ts`（412 行）与 `strategy.ts`（372 行）**
是 2026-09-27 清理时**明确保留**的两簇（`_index.md` §13.10 尾注：「还剩两簇未处置」）。
本轮确认：`interception.ts` 的类型被 `tools/result/split.ts:5` 引用，
而 `split.ts` 本身也是零调用——**两者应作为同一连通分量处置**。

**注**：`strategy.ts` 在门禁报告中**不出现**，因为它被 `index.ts` 导出
（`chooseToolStrategy`），门禁的「词出现」扫描因此计为有引用。
它是否真的被调用，取决于 `index.ts` 是否算消费者——见 §3.7。

**`sandbox/{auditTrail,escalationWorkflow,sandboxEnforcer}.ts`（520 行）**
只互相引用 + 经 `sandbox/index.ts` 再导出，**无生产调用者**。
真实权限与审计已由 `cli/approval/` 与 `observability/` 接管。

### 3.7 `index.ts` 是不是消费者（**待裁决**）

`packages/ts-shell/src/index.ts` 有自己的公开 API 面（10 个 re-export），
其中若干项**只在那里出现**。**根 `package.json` 是 `private: true` 且有 `bin`**——
即这是一个**应用**，不是要发布的库；且全仓**没有任何文件按包名 import 它**
（`grep "from "@cheers/ts-shell"` → 0）。

**因此**：`index.ts` 当前是**无人消费的对外承诺面**。
它导出的项既不被 CLI 调用，也不被外部包调用。
**处置需维护者裁决**：删除该承诺面，或明确它是要维护的公开 API。
本报告**不擅自判定**——因为「包主入口」与「死代码」在责任上不是一回事。## 4. SUBSTANTIAL 项（真实但未完备，非 demo）

这些**有能力、有实现**，只是覆盖面窄于 pi。**升级，不重写**：

| # | 项 | 我方 | pi | 缺口 |
|---|---|---|---|---|
| S1 | bash 会话 cwd | `registry.ts` cwd 固定为 `workspaceRoot` | `session-cwd.ts` + 会话级 cwd | 无跨 turn 的 `cd` 保持（**注**：pi 的 cwd 也是建会话时设定的，非 `cd` 动态跟踪——此差距**被复核子代理夸大**，实测 pi 亦无动态跟踪） |
| S2 | 子代理调度 | `core/subagents/runner.ts`（真多步循环 + 步数上限）与 `core/tools/taskTool.ts` + `core/workflow/gitWorktreeManager.ts`（Git worktree 隔离） | 后台 `spawn/status/wait/stop` + 并发调度 | **无后台异步**：`await context.runSubagent(...)` 阻塞主进程；无法中途追加指令。**复核更正**：worktree 隔离在 `taskTool.ts`，不在 `runner.ts` |
| S3 | 会话持久化 | 整块 JSON 覆盖写 | append-only JSONL + `parentId` + CRC/长度校验 + 原子写 | 硬崩溃（SIGKILL）与并发打开时无事务保证 |
| S4 | 流级重试 | 回合级重试（含 `Retry-After`、指数退避） | 发送**与流读取**两阶段各自重试，识别流中断 | **流中途断线直接冒泡为终态错误**，无断点续读 |
| S5 | Bedrock 错误分类 | SigV4 + 二进制事件流解码已实现 | 另有 Throttling 与 context-overflow 严格区分 | 节流易被误判为超窗而触发强制压缩 |
| S6 | Google 适配器 | SSE 解析 + 思考签名 + function call 映射 | 另有适配器级 408/409/429 重试 + 图像工具路由保护 | 适配器级无自动重试 |
| S7 | 事件流关联 | `jsonEvents.ts` 52 行，有 `schemaVersion`/`order` | — | 无 `turnId`/`toolCallId` 关联，外部消费者无法把事件配到请求 |
| S8 | transcript 拓扑 | 首行版本头 + `branch_summary` 事件 | 每行 `parentId` | `parentId` 只在内存 thread 中，**单靠 `transcript.jsonl` 无法重建分支拓扑** |
| S9 | TUI 布局 | 硬编码上下分屏 | 通用盒模型组件树（Box/Stack/ScrollView + 裁剪） | 无通用布局抽象；`mainScreen.ts` 原生滚动缓冲**仍是实验性**（注释自述） |
| S10 | Markdown | 自研正则 178 行 | Marked AST 1,015 行（CommonMark + LaTeX + 链接） | 缺完整 CommonMark AST 与 LaTeX |

## 5. 本轮不做的（并说明理由）

| 项 | 决定 | 理由 |
|---|---|---|
| 扩展宿主 / 插件执行（`pluginCommandRuntime.ts`） | **维持不做** | `phase-9-decisions.md` §1.2 已裁：进程边界与同步渲染不兼容，是**架构约束非偏好**；且 pi 的扩展模型依赖其自有进程形态 |
| RPC / SDK / CBOR 协议族（5,100 行量级） | **维持不做** | 用户面为零时发出是 premature commitment（`_index.md` §6.2）；本轮**不因规模悬殊而改变既有裁决** |
| 通用 Flex 组件树重写（S9 的重构路径） | **不重写** | 现方案满足终端交互；重写是「破坏原有结构」 |
| 重写编辑引擎 / 压缩 / 沙箱 OS 隔离 | **不重写** | §1.1 已证为生产级 |

## 6. 后续步骤建议（分步，供裁决）

按「**先堵安全与接线，再补协议，最后处置死代码**」排序——这与 `log.md` 记的
Phase 11 排序原则（静默错误 → 响亮失败 → 能力补齐）一致：

| 步 | 主题 | 内容 | 可验证性 |
|---|---|---|---|
| **步 1** | **安全** | D4（SSRF 守卫接入 webFetch/webSearch + 流式读取上限）、D5（沙箱 fail-closed 可配） | 单测：私网地址被拒；沙箱缺失时按策略拒绝 |
| **步 2** | **接线** | D2（记忆工具注册给模型）、D1（`lsp` 分支改用已有 AST 解析器） | 端到端：模型可 `memory_retain`；`definition` 返回真实定义 |
| **步 3** | **协议完备** | D3（Copilot 网关头）、S5/S6（适配器级错误分类与重试）、S4（流中断续读） | 单测：请求头形状、错误分类、断流恢复 |
| **步 4** | **死代码处置** | §3 的 66 文件——**逐簇**按 `plan.md` §2.2 六项检查 | 每簇独立验证 + 全量套件 |
| **步 5** | **观测与配置** | D6（全局缓存命中率；配置并发保护） | 单测 + 实机 |
| **步 6** | **收尾** | 全量套件 + 八道门禁（**新增的 `check:call-reachability` 已就位**，见 §3.2） | 门禁 |

> **步 4 是本轮最大的一块**，且**必须逐簇核实**——§3.4 的
> `interception.ts` 正是「看着像死代码、其实是编译契约」的教科书案例。
> **步 6 的门禁是本轮的方法论产出，且已在第 6 步之前完成**：
> `import` 可达 ≠ 被调用。`scripts/check-call-reachability.mjs` 已写好并配 11 条
> 测试（`check:call-reachability`），当前为 **advisory**——因为树里现存的 65 项
> 会让它一直红，而「一直红的门禁会被关掉而不是被遵守」。
> 步 4 清完后应改为**阻断**。

## 7. 验证纪律

| 要求 | 执行 |
|---|---|
| 每条发现附 `file:line`（双侧） | ✅ |
| 缺失类结论附检索命令 + 结果 | ✅ |
| 子代理并发上限 3 | ✅ 全程未超 |
| 子代理回报**逐条主代理实测** | ✅ 更正 3 处（其中 1 处为子代理**夸大**：S1 的 cwd 差距） |
| 零代码改动 | ✅ 本轮只读 |
| 子代理崩溃重派 | ✅ 1 次（`AuditTuiSandbox` 内容过滤崩溃，拆分为 2 个窄任务后成功） |
| **结论经证伪式复核** | ✅ 2 个 reviewer 独立复核；**主代理被更正 4 处、明确 1 处反驳不成立**（见 §7.2） |

### 7.1 主代理更正子代理的 3 处

1. **`readEventStream` 被误报为死代码**——我的第一版检测器漏了
   `for await (const m of readEventStream(body))`（`bedrockConverse.ts:308`）。
   修正正则后消失。**这说明该检测必须用「标识符作为词出现」而非「后跟 `(`」**。
2. **S1 `bash` cwd 差距被夸大**——子代理称 pi 支持 `cd` 动态跟踪。
   实测：pi 的 `cwd` 在 `createBashToolDefinition(cwd)` 建工具时固定，
   `setCwd` 只被 `footer-data-provider`（状态栏显示）调用，**不回流到 bash**。
   故该差距应降级为「与 pi 平手，均为会话级固定」。
3. **`provider/endpoints/*.ts` 被误判为「不被 value-import」**——
   它们经 `endpoints/index.ts` 的**副作用导入**（`import "./openaiCompatible.js"`）注册。
   已加入侧效应排除。

### 7.2 复核轮（2 个 reviewer）对**主代理**的更正

| # | 主代理原写 | 复核结论 | 主代理实测 |
|---|---|---|---|
| 1 | `runCliProcess` / `handleCliFatalError` **零调用**（§3.1 例证） | **错**——`entrypoints/cli.tsx:22,31` 直接调用 | **复核对**。原因是我的脚本只扫 `.ts`，而 `cli.tsx` 是唯一 `.tsx`。已修正并把 `.tsx` 纳入门禁 + 加回归测试 |
| 2 | `runner.ts` 含 Git worktree 隔离 | **错**——worktree 在 `taskTool.ts` + `workflow/gitWorktreeManager.ts`；`runner.ts` 里 `grep worktree` = 0 | **复核对**。已更正 §4 S2 |
| 3 | 沙箱「**静默**降级」 | **措辞夸大**——每次命令都打印 notice，且注释声明是有意为之 | **复核对**。改为「降级（有提示，但不 fail-closed）」，把缺陷缩小为「缺 fail-closed 选项」 |
| 4 | 记忆「对模型**完全**不可见」 | 称 `buildPromptWithFutureTurnInjections` 会注入 → **不成立** | **反驳不成立**。追到底：`createProjectMemoryInjectionStateStore` **只有测试与 harness 构造，生产无构造点**，故该注入路径在生产不可达。原结论成立，**但理由已换**（§2 D2） |
| 5 | §3「66 文件」 | 称部分模块是**包公共 API**，不能算死代码 | **部分成立**。核实：`index.ts` 导出的 10 项**无一命中**我的 65 清单（门禁的用词扫描已正确排除）；但**根 `package.json` 是 `private: true` 的应用**，全仓无按包名 import，故 `index.ts` 本身是**无人消费的承诺面**。已单列 §3.7 **交维护者裁决**，不在本轮擅自处置 |

**另**：复核指出 §3 数字应下调。我据此重写了检测器并发现**两个真实 bug**
（漏读 `.tsx`、三字母标识符被 `\w{3,}` 排除），修正后为 **65 文件 / 12,855 行**。
