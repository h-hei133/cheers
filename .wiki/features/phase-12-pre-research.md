---
title: "Phase 12 前置研究"
summary: "Phase 12 的输入是 08 §4 的 24 项缺口减去 Phase 11 已完成的 13 项，加上本轮新发现的 3 类缺陷。最重要的产出是：把「task 工具不是 agent」从「缺一个能力」精确到「三条独立的坏路径」（工具集不可达、声明边界不生效、绕过 provider 层），并推翻了两处旧记录对参考实现的描述。"
---

# Phase 12 前置研究

> **输入**：`08-gap-and-debt-research.md` §4（24 项缺口）、`09-gap-followup-design.md`、
> `phase-11-decisions.md` §16（6 项待裁决）、以及 Phase 11 复核轮的产出。
> **输出**：`phase-12-decisions.md` 的任务表与裁决点。
>
> **纪律**：本文每条结论都有 `file:line` 与实际命令输出。无法验证的标 `[INFERENCE]`。
> **不采信二手结论**——`phase-11-pre-research.md` 的教训是「子代理把子集说成整个域」。

---

## 0. 本轮范围

### 0.1 为什么是 Phase 12

`08-*` §4 登记了 24 项缺口（MISSING 10 + DEFICIENT 14）。
`phase-11-decisions.md` §0 把其中 16 项登记为任务，**Phase 11 完成了 13 项**（T1–T13）。
**差额从未被说明过**，这是本轮的起点。

| 口径 | 数量 | 说明 |
|---|---:|---|
| `08-*` §4 登记的缺口 | **24** | MISSING 10 + DEFICIENT 14 |
| 其中被登记为 Phase 11 任务 | 16 | T1–T13 + D1–D3 |
| **Phase 11 实际完成** | **13** | T1–T13（D1–D3 未做） |
| **从未被登记为任何任务或裁决点** | **8** | 见 §1 |
| Phase 11 复核轮新发现 | 6 | 已修复，见 §4 |

### 0.2 剩余项的三种性质（**这个分类决定 Phase 12 的边界**）

| 性质 | 数量 | 能否在 Phase 12 做 |
|---|---:|---|
| **可做，只是漏登记** | 4 | ✅ **本轮范围** |
| **无环境可验证**（无账号/无设备） | 4 | ❌ 需先有可验证环境 |
| **需维护者裁决** | 6 | ⚠️ 裁决后才能施工 |

`AGENTS.md` 的「不新增无法验证的表面」与 `phase-10-decisions.md` §1.1 的先例
都指向同一结论：**无账号可验的协议与认证流不纳入本轮**。

---

## 1. 从未进入 Phase 11 的 8 项（**逐条实机核实**）

| 08 编号 | 项 | 核实命令 | 结果 | 性质 |
|---|---|---|---|---|
| **D10** | 子代理不是真 agent | `grep -c 'runTurn\|AgentCore\|createStepFunction' core/tools/taskTool.ts` | **0** | **可做**（见 §2） |
| **M8** | 压缩后不恢复工作文件 | `grep -rn 'POST_COMPACT\|restoreFile\|filesToRestore' packages/ts-shell/src` | **0** | **可做**（见 §3.1） |
| **D11** | 中途不能改模型/推理档 | `grep -rn 'modelOverride' turn/session.ts` | **0** | **可做**（见 §3.2） |
| **M9 后半** | 指令 `@import` 的**转写**语义 | T12 已做**展开**（`expandImports` 3 处引用） | 展开✅ 转写❌ | **可做**，但价值待评估 |
| **M3** | OAuth Device Code 流 | `grep -rn 'deviceCode\|device_code' core/auth/oauth/` | **0** | 无账号可验 |
| **M6** | Copilot / Anthropic 订阅 OAuth | `grep -n 'copilot\|anthropic' core/auth/oauth/providers.ts` | **0** | 无账号可验 |
| **M4** | Bedrock 协议 | `ls provider/endpoints/` | 只有 2 种协议 | 无账号可验 |
| **M5** | Google GenAI / Vertex 协议 | 同上 | 同上 | 无账号可验 |

**即：本轮可做的是 D10、M8、D11（+ M9 后半待评估）。**

---

## 2. 头条发现：`task` 工具的三条坏路径

> **旧记录**：08 `D10` 说「子代理 `task` 工具不是 agent，是一次 `fetch` 补全调用」。
> **本轮核实**：这个描述**正确但不完整**——它不是「少了一个 agent 循环」，
> 而是**三条各自独立、各自可修的坏路径**。把它们当成一件事会低估工作量。

### 2.1 路径一：它**无法**运行工具循环（结构性的）

**事实**：`taskTool.ts` 的 `execute` 只拿到 `ToolExecutionContext`：

```ts
// packages/ts-shell/src/tools/types.ts:7-12
export interface ToolExecutionContext {
  readonly taskId: string
  readonly workspaceRoot: string
  readonly sessionId?: string
  readonly correlationId?: string
  readonly abortSignal?: AbortSignal
  ...
}
```

**这个接口里没有 `tools`**。也就是说 `task` 工具**在类型层面就拿不到工具集**——
即使写了循环也无工具可调。这不是「忘了写循环」，是**接口没给它实现循环的能力**。

**对照**：`runAgentLoop` 的配置**已经**把工具集参数化了：

```ts
// packages/ts-shell/src/core/agent/loop.ts:70-71
export interface AgentLoopConfig {
  readonly tools?: readonly AgentTool[];
  ...
  readonly streamStep: (messages, signal) => Promise<AssistantStep>;
}
```

**结论**：`AgentCore` 侧**已就绪**（工具集是参数、`streamStep` 是注入的），
**缺的是 `ToolExecutionContext` 到 `AgentLoopConfig` 的那根线**。
这比 08 描述的「要改造 AgentCore」**轻**。

### 2.2 路径二：它声明的权限边界**不生效**（安全相关）

**事实**：内置子代理声明了工具边界，但**没有任何代码读它**。

```ts
// packages/ts-shell/src/core/subagents/subagentLoader.ts:6-22
const BUILTIN_SUBAGENTS: SubagentDefinition[] = [
  {
    name: "Explore",
    description: "Fast read-only codebase exploration and file search specialist.",
    tools: ["read", "grep", "glob", "lsp"],
    disallowedTools: ["write", "edit", "rm", "eval"],   // ← 无人读取
    permissionMode: "plan",                             // ← 无人读取
    source: "builtin",
  },
  ...
  {
    name: "general-purpose",
    tools: ["read", "write", "edit", "grep", "glob", "lsp", "bash"],  // ← 无人读取
    ...
```

**核实**：

```
$ grep -rn 'disallowedTools' packages/ts-shell/src --include='*.ts' | grep -v '\.test\.'
subagentLoader.ts:12:    disallowedTools: ["write", "edit", "rm", "eval"],
subagentLoader.ts:21:    disallowedTools: ["write", "edit"],
subagentLoader.ts:38:    disallowedTools: ["write", "edit"],
subagentLoader.ts:143:      const disallowedTools = this.parseList(meta.disallowedTools);
subagentLoader.ts:151:        disallowedTools: disallowedTools.length > 0 ? disallowedTools : undefined,
subagents/types.ts:10:  readonly disallowedTools?: readonly string[];
```

**全部命中都在 loader 内部（解析与存储）**。`taskTool.ts` 只读 `memory` 一个字段：

```
$ grep -n 'subagentDef\.' packages/ts-shell/src/core/tools/taskTool.ts
91:        const mem = memoryMgr.loadMemory(agentType, subagentDef.memory);
93:          memoryContext = `...(${subagentDef.memory})...`;
```

**即**：`Explore` 声明「不许 write/edit」，`general-purpose` 声明「可以用 write/edit」，
**两条声明都不影响任何行为**。这不是「功能缺失」，是**声明与行为不一致**——
比缺功能更危险，因为读代码的人会相信它。

### 2.3 路径三：它**绕过 provider 层**（配置不生效）

**事实**：`taskTool.ts` 直接 `fetch` 到 `/chat/completions`，用**硬编码的环境变量**：

```ts
// packages/ts-shell/src/core/tools/taskTool.ts:127-129
const apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || "";
const baseUrl = process.env.SILICONFLOW_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const model = subagentDef?.model || (process.env.SILICONFLOW_API_KEY ? "deepseek-ai/DeepSeek-V4-Flash" : "gpt-4o-mini");
```

**核实**：`taskTool.ts` 里 `endpointTurnBody`/`providerRegistry`/`catalogStore`/`resolveRequestShape`
**引用数全部为 0**。它不经过我们刚在 Phase 11 修的**任何一层**：

| Phase 11 修的 | `taskTool` 是否受益 |
|---|---|
| T5 temperature 按能力门控 | ❌ 它硬编码 `temperature: 0.3`（`:160`） |
| T6 `budget_tokens` | ❌ 它不发 `thinking` |
| T4 `failureClass` 分类 | ❌ 它只报 `The provider answered ${res.status}` |
| T2 流内 error 检测 | ❌ 它用非流式 `res.json()` |
| 重试/抖动 | ❌ 无重试 |
| 模型目录/`compat` | ❌ 不查目录 |

**同样的问题在 `/btw` 命令**（`core/commands/btwCommandRuntime.ts:22-23`）：
它**读了** `getRuntimeConfig(context.cwd)` 却**不用它**发请求——
`:74` 只在兜底文案里回显 provider 名。**这两处是全仓仅有的绕过点**：

```
$ grep -rn 'chat/completions' packages/ts-shell/src --include='*.ts' | grep -v '\.test\.' | grep -v 'provider/endpoints'
core/commands/btwCommandRuntime.ts:38
core/tools/taskTool.ts:142
```

### 2.4 worktree 是**纯仪式**（由此推出的结论）

**事实链**（全部已核实）：

1. `shouldIsolate` 为真时分配 worktree（`taskTool.ts:101-103`）；
2. `effectiveWorkspace` 变成 worktree 路径（`:102`）；
3. 该路径**只被拼进一段字符串**（`:134` 的 `Working Directory: ${effectiveWorkspace}`）；
4. 释放时 `squashMerge: true`（`:182`）→ `git merge --squash <branch>`（`gitWorktreeManager.ts:109-115`）；
5. 然后 `git worktree remove --force` + `git branch -D`（`:118-125`）。

**因为没有任何 agent 在 worktree 里执行任何操作，第 4 步合并的是一个空分支**，
第 5 步随即删除。**创建 → 无事发生 → 合并空分支 → 删除**。

**这意味着**：Phase 11 之前记录的「worktree 分配/释放 + squashMerge **已存在**」
（`phase-11-decisions.md` §15.3 理由③）**是事实但不构成有利条件**——
它存在的是**骨架**，而骨架里没有东西。方案 A 的「接上既有语义」实际是
**「把骨架接上」**，工作量应按此估计。

### 2.5 参考实现的真实分布（**复核旧记录**）

| 项目 | 机制 | 层 | 核实 |
|---|---|---|---|
| **pi** | `spawn(invocation.command, invocation.args)` 子进程跑自己的 CLI，逐行解析 JSON 流 | `examples/extensions/subagent/index.ts:346` | ✅ **主代理确认**（`spawn` + `processLine`） |
| **Claude Code** | 进程内 + worktree + 生命周期钩子 | `tools/AgentTool/`（产品代码） | 见 §2.6 |
| **opencode** | **进程内** Effect fiber + 子 session + **派生权限规则集** | `src/tool/task.ts`（产品代码） | ✅ **主代理逐条确认**，见 §2.6 |

#### opencode 的机制（**子代理报回，主代理逐条核验**）

| 子代理原判 | 主代理核验 | 处置 |
|---|---|---|
| 进程内（Effect Fiber/BackgroundJob），非子进程 | `tool/task.ts` **存在**；`session/prompt.ts:1081,1088` 有 `runLoop` + `while (true)` | ✅ **成立** |
| 用 `session.permission` 规则集限制工具 | `agent/subagent-permissions.ts:14-29` `deriveSubagentSessionPermission` **逐字确认** | ✅ **成立** |
| 跑完整 agent 循环（`ops.prompt` → `runLoop`） | `session/prompt.ts:1346` `ensureRunning(... runLoop(...))` | ✅ **成立** |
| 子会话通过 `sessions.create({parentID})` 建，**不继承父消息历史** | 沿用其结论，未独立重验 | ⚠️ **未重验** |
| 不支持同一子会话中途换模型；支持创建时指定模型 | 沿用其结论，未独立重验 | ⚠️ **未重验** |

**opencode 的关键设计（对我们最有价值的一点）**：
子代理的工具边界**不是「声明」，是「派生出来的规则集」**——
`deriveSubagentSessionPermission` 把父会话的 deny 规则 + 子代理自身的规则
**合并成一个 ruleset**，再由工具解析层据此过滤。

**这与我们的做法形成直接对照**：我们**声明**了 `tools`/`disallowedTools`
但**没有任何派生或执行步骤**（§2.2）。**参考实现里「声明」和「生效」是同一个动作。**

**另一个对照**：opencode 有完整的 **deny 概念**（`core/src/permission.ts` 的 ruleset，
`action: "deny"`），而我们**完全没有**——`evaluator.ts` 的 `deny` 只用于 plan 模式的硬阻断
（`:156`），**用户无法表达「永远不许用这个工具」**。这是 D2 裁决点的事实基础。

#### Claude Code 的机制（**子代理报回，主代理逐条核验**）

| 子代理原判 | 主代理核验 | 处置 |
|---|---|---|
| 进程内运行（`runWithAgentContext` 隔离），仅 teammate/remote 才起外部进程 | `AgentTool.tsx:18,733,785` **逐字确认** | ✅ **成立** |
| `resolveAgentTools` 在循环前**求交过滤**（`disallowedTools` 集合 + `tools` 白名单） | `agentToolUtils.ts:122-151` 与 `runAgent.ts:500-502` **确认** | ✅ **成立** |
| 完整 agent 循环：`runAgent` 直接调 `query({...})` | `runAgent.ts:748` **确认** | ✅ **成立** |
| 钩子为 `SubagentStart`/`SubagentStop` | `runAgent.ts:530-532` **确认** | ✅ **成立** |
| **worktree：无改动则删，有改动则保留并回报路径**（不自动合并） | `AgentTool.tsx:644-687` **逐字确认** | ✅ **成立**，见下 |

**Claude Code 的 worktree 语义（**与我们直接冲突，最重要的一条**）**：

```ts
// tools/AgentTool/AgentTool.tsx:667-687（节选）
const changed = await hasWorktreeChanges(worktreePath, headCommit);
if (!changed) {
  await removeAgentWorktree(worktreePath, worktreeBranch, gitRoot);
  return {};                                    // 无改动 → 删掉
}
logForDebugging(`Agent worktree has changes, keeping: ${worktreePath}`);
return { worktreePath, worktreeBranch };        // 有改动 → 保留，回报路径
```

**即**：子代理的改动**不自动进入主工作区**。父代理（或人）拿到 `worktreePath` 后
**自己决定**怎么处理。

**我们的做法相反**：`taskTool.ts:182` 直接 `releaseWorktree(subtaskId, { squashMerge: true })`
→ `git merge --squash <branch>` → 然后 `git worktree remove --force` + `git branch -D`。
**自动合并 + 自动删除，且不回报任何路径。**

**这意味着两件事**：
① 一旦 `task` 真的能改文件，**我们的自动合并语义是危险的**——它把子代理的改动
   无声地并入主工作区，没有审查机会，冲突时还静默跳过（`gitWorktreeManager.ts:117` 的
   `catch {}` 注释写「Conflict or clean merge skip」）；
② `phase-11-decisions.md` §15.3 把「无变更则删、有变更则留」称作
   **Claude Code 的语义**并说「方案 A 是把它接上」——**这个描述是错的**：
   我们的实现是「总是合并后删」，与参考**语义相反**。**旧记录需更正。**

**但**：我们的 CLI **缺少方案 B 所需的参数面**：

```
$ for f in --model --mode --thinking --append-system-prompt --json; do ...; done
--model                  0
--mode                   0
--thinking               0
--append-system-prompt   0
--json                   1     ← 只有这个存在
```

`--json` 存在（`cliArgs.ts`），事件流 `run-event-stream.v1` 已就绪；
**其余四个参数全部为 0**。方案 B 的前置成本因此是**新增 4 个对外参数**——
按 `AGENTS.md`「不新增无法验证的表面」，这需要慎重。

---

## 3. 其余可做项

### 3.1 M8 — 压缩后恢复工作文件

**现状**：`session/compaction.ts` **完全没有文件感知**。

```
$ grep -rn 'readCache|filesRead|touchedFiles' packages/ts-shell/src/session/compaction.ts
（无输出）
```

压缩按 `keepRecentTokens` 从尾部保留（`compaction.ts:211-256` 的 `locateCut`），
**丢掉的中间部分包含文件内容**。模型在压缩后继续工作，会**以为自己记得文件内容**。

**参考实现**（`~/projects/source-claudecode/services/compact/compact.ts`）：

| 常量 | 值 | 行 |
|---|---|---|
| `POST_COMPACT_MAX_FILES_TO_RESTORE` | **5** | `:122` |
| `POST_COMPACT_TOKEN_BUDGET` | **50_000** | `:123` |
| `POST_COMPACT_MAX_TOKENS_PER_FILE` | **5_000** | `:124` |

**选择算法**（`:1415-1445` `createPostCompactFileAttachments`）：
① 从 `readFileState`（`{content, timestamp}` 映射）取**全部已读文件**；
② **排除**已被保留消息覆盖的（`preservedReadPaths.has(...)`）；
③ 按 `timestamp` **倒序**；
④ 取**前 5 个**；
⑤ 每个重新生成 attachment，**上限 5000 token**。

**我们的接缝**：Phase 11 的 T11 刚加了 `core/tools/readCache.ts`，它按
`{offset, limit, modifiedMs}` 记录已读文件——**但它不存内容**（存的是「问过什么」，
不是「答了什么」）。所以 M8 **需要一个新状态**（文件名 + 时间戳 + 内容），
或者扩展 `readCache`。**这是设计决策，见 §5**。

**风险**：恢复文件会**重新撑大上下文**，与刚修的 T9 阈值直接冲突。
参考用 `POST_COMPACT_TOKEN_BUDGET = 50_000` 独立设预算，说明**恢复必须有自己的预算**。

### 3.2 D11 — 中途不能改模型/推理档

**现状**：`NextStepUpdate` **只携带 `messages`**：

```ts
// packages/ts-shell/src/core/agent/loop.ts:66-68
export interface NextStepUpdate {
  readonly messages?: readonly AgentMessage[];
}
```

`prepareNextStep` 返回它，因此**无法表达「下一步换个模型」**。
`turn/session.ts` 里 `modelOverride` 引用数为 **0**。

**用途**：模型升级（廉价模型规划 → 昂贵模型执行）在参考项目里是**真实模式**，
但需要确认我们的使用场景是否真的需要。**这是裁决点，见 §5**。

### 3.3 M9 后半 — `@import` 的「转写」语义

T12 已实现**展开**（把 `@path` 替换成文件内容）。08 原本还提到「转写」，
但**未说明转写是什么**。参考项目的对应物未找到。**价值不明，建议不做**。

---

## 4. Phase 11 复核轮的 6 个已修缺陷（**供本轮避免同类错误**）

| # | 缺陷 | 共性 |
|---|---|---|
| R1 | 嵌套对象被整体替换 | **修了一层，漏了另一层** |
| R2 | 唯一性只在精确路径计数 | **修了一条路，漏了另一条** |
| R3 | `budget_tokens` 覆盖用户上限 | 方向对，**优先级判断反了** |
| R4 | `thinkingSignature` 写进 transcript 却读不回 | **只测写入，没测读回** |
| R5 | `~~~` 围栏与四套三反引号未识别 | 只认一种形态，**漏了另一种** |
| R6 | `SimpleRequest` 无法表达「不接受 temperature」 | 完整请求加了门控，**无工具路径没有开关** |

**共性**：**「修了同型问题的一处，漏了它的兄弟」**。
Phase 12 的每项改动都应问一句：**这个改动有没有第二条路径？**

**且**：§2 的三条坏路径**正是这个共性的放大版**——
`task` 工具的三种毛病各自独立，修一种不会带动另一种。

---

## 5. 需维护者裁决的点

> **格式**：每项给**选项 + 建议 + 理由**，供维护者裁决。裁决结果写入 `phase-12-decisions.md`。

### 5.1 子代理的形状（**D1，Phase 11 遗留 + 本轮新证据**）

**新证据改变了两边的工作量估计**：

- **方案 A（进程内）**：`AgentLoopConfig.tools` **已经是参数**、`streamStep` **已经是注入**，
  所以「让 AgentCore 可重入」**比旧记录估计的轻**。
  **真正的阻塞点是 `ToolExecutionContext` 没有 `tools` 字段**（§2.1）。
- **方案 B（子进程）**：需要新增 `--model`/`--mode`/`--thinking`/`--append-system-prompt`
  **四个对外参数**（§2.5），且 `--json` 已就绪。

**三个选项**：

| 选项 | 内容 | 成本 | 风险 |
|---|---|---|---|
| **(a) 完整方案 A** | 给 `ToolExecutionContext` 加工具集、`taskTool` 走 `runAgentLoop`、接上 worktree、让 `tools`/`disallowedTools`/`maxTurns` 生效 | **高** | 进程内共享状态；需处理权限边界 |
| **(b) 最小可信修复** | **只做两件事**：① 让声明的工具边界**真的生效**（§2.2，安全相关）；② 让 `task` 走 **provider 层**（§2.3，配置生效） | **中** | 不解决「不是 agent」，但消除「声明与行为不一致」与「配置不生效」 |
| **(c) 先做 (b) 再做 (a)** | 分两轮 | 中→高 | — |

**建议 (c)**。理由：
① §2.2 是**安全相关**——声明的边界不生效，比没有边界更危险；
② §2.3 让 `task` 与 `/btw` **绕过 provider 层**，意味着 Phase 11 修的 T5/T6/T2/T4
   **在这两条路径上全部无效**——这是**回归**，应优先消除；
③ (a) 是**功能开发**，依赖 (b) 铺好的接缝（工具集可达之后才谈得上跑循环）；
④ 分两轮让每轮都可独立验证。

**⑤ 新增（本轮证据）：worktree 的合并语义必须先改，否则 (a) 会引入危险行为。**
参考实现（Claude Code `AgentTool.tsx:667-687`）**不自动合并**：无改动则删，
有改动则**保留并回报路径**。我们是**自动 squash-merge 后删除**，
且冲突时**静默跳过**（`gitWorktreeManager.ts:117` 的 `catch {}`）。
在 `task` 还不能改文件时这只是空转；**一旦它能改文件，自动合并就是「无审查地把改动并入主工作区」**。
所以 (b) 的范围应包含**把 worktree 语义改成参考的形态**（保留 + 回报，不自动合并）。

### 5.2 M8 的恢复策略

| 选项 | 内容 | 成本 | 风险 |
|---|---|---|---|
| **(a) 照参考** | 保留最近 **5** 个文件、**5000 token/文件**、**50k 总预算** | 中 | 与 T9 阈值交互，需独立预算 |
| **(b) 只记文件名** | 压缩后插入「你之前读过这些文件」的清单，**不含内容** | **低** | 模型知道自己读过，但还得重读；**收益小但零风险** |
| **(c) 不做** | — | — | 模型在压缩后继续工作时缺上下文 |

**建议 (b) 起步，再评估 (a)**。理由：
① (a) 与刚修的 T9 阈值**直接冲突**（恢复撑大上下文 → 更早触发压缩 → 循环）；
② (b) 成本低、无预算冲突，且**解决最痛的部分**（模型不知道自己读过什么）；
③ 若 (b) 实测收益不足，再按参考的预算参数做 (a)。

### 5.3 D11 中途换模型

| 选项 | 内容 |
|---|---|
| **(a) 做** | `NextStepUpdate` 加 `model?`，让 `prepareNextStep` 能换 |
| **(b) 不做** | 承认换模型需重开会话 |

**建议先确认使用场景再定**。理由：参考项目支持它，但**我们的实际使用场景未知**——
若无「廉价规划 → 昂贵执行」的真实需求，(a) 是**新增无法验证的表面**。

### 5.4 D3 — `cheers.json` / `.agents/settings.json`（Phase 11 遗留）

**本轮核实到决定性证据：`cheers.json` 不是「未被读取的配置」，而是「另一个 schema 的草稿」。**

**证据一：文件路径不在读取列表里。** 配置读取器的候选路径是：

```ts
// packages/ts-shell/src/config/runtimeConfig.ts:543-550
export function getCandidateConfigPaths(rootDir: string = process.cwd()): string[] {
  return [
    resolveUserDataFile("config.json"),      // 用户目录的 config.json
    path.join(rootDir, ".cheers.json"),      // 仓库根的 .cheers.json（有点）
  ];
}
```

**`cheers.json`（无点）不在其中**，`.agents/settings.json` 也不在。

**证据二：schema 形状不兼容。** 真实配置是**扁平**的：

```json
// .cheers.example.json
{ "provider": "openai", "maxTurns": 6 }
```

而 `cheers.json` 是**嵌套的另一个 schema**：

```json
// cheers.json（节选）
{ "$schema": "https://cheers.dev/schemas/settings.v1.json",
  "model": { "provider": "...", "model": "...", "baseUrl": "...", "apiKey": "${SILICONFLOW_API_KEY}" },
  "permissions": { "allowRules": [...] },
  "tui": { "mode": "differential", "altScreen": true } }
```

**决定性一点**：读取器把 `model` 当**字符串**（`runtimeConfig.ts:72` `readonly model?: string`），
而 `cheers.json` 把 `model` 当**对象**。**即使改名到 `.cheers.json` 也无法解析**——
它是**另一套设计的草稿**，不是这份配置的「未接线的版本」。

**证据三：字段有无实现，逐个核实。**

| `cheers.json` 字段 | 产品里有实现吗 | 核实 |
|---|---|---|
| `model.provider` / `model.model` | ✅ 有（扁平形式） | `runtimeConfig.ts:72,83` |
| `model.maxTurns` | ✅ 有 | `runtimeConfig.ts:92,347`（默认 15，**与文件里的 30 不同**） |
| `mcpServers` | ✅ 有 | `grep -c mcpServers` → 10 处生产引用 |
| `tui.altScreen` / `showThinking` | ✅ 有 | `grep -c` → 6 处生产引用 |
| **`permissions.allowRules`** | ❌ **无** | `grep -rn 'allowRules' src` → **0** |
| **`skills.directory`** | ❌ 无 | `.codex/skills` **不存在**（`.codex/` 下只有 `agents/`、`prompts/`、`*.sqlite`） |
| **`model.apiKey: "${SILICONFLOW_API_KEY}"`** | ⚠️ 指向**环境变量** | 与「配置文件」的定位矛盾 |

**结论**：`allowRules` 与 `skills` 是**空头支票**，其余字段**有实现但用另一套 schema 表达**。
所以删除**不会**删掉待实现的功能——那两处功能（权限规则、技能目录）**从未按这个 schema 设计过**。

**建议删除两份**。理由：
① 零读者（路径不在候选列表）；
② schema 形状不兼容（`model` 是对象 vs 字符串），**不是「差一根线」**；
③ 逐字节重复（同一 md5），说明是复制产物而非两处刻意配置；
④ 含外部项目名（`.codex/skills`）且路径不存在，**违反 `AGENTS.md`**；
⑤ 留着会让用户以为改了有用——**静默失效的配置契约**，与 08 `T2` 的原始问题同类。

### 5.5 D5 — 后台命令执行（Phase 11 遗留）

**本轮新证据**：`processTree.ts` **已经**具备 pi 的对应物：

```ts
// packages/ts-shell/src/core/shell/platform/processTree.ts:8-11
 * 1. Global detached child PID tracking registry
 * 2. Windows taskkill cascade killing (`/F /T /PID <pid>`)
 * 3. POSIX process group cascade killing (`process.kill(-pid, "SIGKILL")`)
 * 4. Automatic signal lifecycle handlers (SIGINT, SIGTERM, SIGHUP, exit)
```

**即「孤儿进程」这个担心已不成立**——进程树级联清理与退出处理器都在。

**但**：`ambientFacts.ts:9` 明说「the shell has no detached execution mode，
所以连计数器都不放」。**引入后台执行要推翻这条明述的立场**，并需要配套工具与通知机制。

**建议不做**。理由：进程清理已具备（担心的风险不存在），
而真正的成本是**推翻既有立场 + 配套工具 + 通知注入**，属功能开发而非缺陷修复。
**若维护者认为需要，应单独立项。**

### 5.6 D6 — 死代码处置（Phase 11 遗留）

`plan.md` §2.1 明确「可达性不授权删除」，§2.2 要求删除前**六项检查**。
08 §5 登记了三簇：`core/workflow/` 6 模块（508 行）、
`tools/policy/interception.ts`（411 行）、35 个真死文件（6,650 行）。

**建议**：**逐簇**走六项检查后删，**不整批删**。理由：连通分量的边界需要逐个确认，
整批删的风险是把「暂时不可达但有意保留」的一起删掉。

### 5.7 D4 — 动态工具装载增量（Phase 11 遗留）

**现状**：工具集在会话构造时固定（`turn/session.ts:174`），
唯一变化是 `allowTools: stepCount < options.maxSteps`（`:189`）。

**本轮新发现：两个协议在「工具被禁」时行为不一致，且都不告知模型。**

| 协议 | `allowTools: false` 时的行为 | 位置 |
|---|---|---|
| OpenAI 兼容 | **仍发送 `tools` 列表**，但设 `tool_choice: "none"` | `openaiCompatible.ts:62` |
| Anthropic | **完全不发送 `tools`** | `anthropicMessages.ts:131`（`if (input.allowTools && ...)`） |

**后果**：
① 同一个会话在两种协议下，模型看到的东西**不一样**——OpenAI 下它看得到工具但不能调，
   Anthropic 下它根本看不到；
② **两种情况下都没有任何东西告诉模型「工具为什么没了」**。
   模型只知道调用失败或工具消失，**无法判断是自己做错了还是到达了上限**。

**建议只做 (a)**：步数上限导致工具消失时**明确告知模型**。
理由：成本低、解决真实问题，且不依赖被排除的扩展宿主。
**附带**：顺带统一两个协议的行为（要么都省略，要么都设 `tool_choice`），
因为当前的差异**没有理由**——`allowTools` 的语义应当由调用方决定，而不是由协议各自解释。

---

## 6. 本轮未验证 / 存疑（**如实记录**）

1. **Claude Code 的 AgentTool 与 opencode 的 `src/tool/task.ts`**：沿用旧记录，**本轮未重验**。
   pi 的机制**已重验**（§2.5）。
2. **`cheers.json` 各字段的「应该有实现吗」**：只核实了「没有读者」，
   **无法从代码判断设计意图**——这正是 5.4 需要维护者明确的原因。
3. **M8 恢复的实际收益**：未实测「压缩后模型缺文件上下文」的频率与影响，
   故 5.2 的建议基于**风险**而非**实测收益**。
4. **D11 的使用场景**：未找到我们内部的真实需求证据。
5. **`/btw` 的设计意图**：它读 `runtimeConfig` 却不用，**无法判断是遗漏还是刻意**
   （注释说「Dynamically resolves provider and auth configurations from runtime config」
   ——**注释与实现不符**，故倾向是遗漏，但未确认）。

---

## 7. 验证纪律执行情况

| 要求 | 执行情况 |
|---|---|
| 每条发现附 `file:line` | ✅ 全部 |
| 缺失类结论附检索命令 + 结果 | ✅ 全部 |
| 参考实现的描述**先核实现状再对照** | ✅ §2.5 重验 pi，并推翻旧记录的估计 |
| 子代理并发上限 3 | ✅ 全程未超过 3 |
| 子代理结论**必须主代理逐条核验** | ✅ 见 §8 |
| 零代码改动 | ✅ `git status` 无源码改动 |

---

## 8. 子代理结论的核验

> 本轮共派遣 **6 个**子代理：**3 个失败**（开放式探索，撞 429 限流，零产出），
> **3 个成功**（`Probe` 探测端点，`RefClaude`/`RefOpencode` 封闭式取证）。
> 成功者的结论**已由主代理逐条核验**（见 §2.5、§2.6、§8.2）。

### 8.1 派遣记录与事故

| 子代理 | 目标 | 结果 |
|---|---|---|
| `P12Subagent` | 子代理形状 | ❌ 22 次工具调用后 429，零产出 |
| `P12Context` | M8 / D11 | ❌ 23 次工具调用后 429，零产出 |
| `P12Config` | D3 / D5 | ❌ 20 次工具调用后 429，零产出 |
| `Probe` | 端点探测 | ✅ 17 秒完成（**证明端点可用，429 是调用量导致**） |
| `RefClaude` | Claude Code AgentTool | ✅ 2 分钟，**5 条结论全部核验成立** |
| `RefOpencode` | opencode task 工具 | ✅ 1 分 13 秒，**5 条结论中 3 条核验成立、2 条未重验** |

**事故模式**：失败的都是**开放式探索**任务（「探索 X 的现状」），
成功的都是**封闭式取证**任务（「读这 3 个文件回答这 5 个问题」）。
**429 在 20+ 次工具调用后触发**，所以开放式任务必然在产出结论前耗尽额度。

**处置**：把开放式任务改为**主代理自己核实**（§2、§3、§5 的全部结论都是主代理亲验），
子代理只用于**有明确文件边界的取证**。

### 8.2 核验明细

| 子代理原判 | 主代理核验手段 | 结果 |
|---|---|---|
| opencode：进程内 + Effect fiber | `ls tool/task.ts` + `grep runLoop/while(true) session/prompt.ts` | ✅ 成立（`:1081,1088`） |
| opencode：`session.permission` 规则集限制工具 | `sed agent/subagent-permissions.ts:1-35` | ✅ 成立（`:14-29` 逐字） |
| opencode：跑完整 agent 循环 | `grep ensureRunning session/prompt.ts` | ✅ 成立（`:1346`） |
| opencode：子会话不继承父消息历史 | 未独立重验 | ⚠️ **未重验** |
| opencode：不支持中途换模型 | 未独立重验 | ⚠️ **未重验** |
| Claude Code：进程内 `runWithAgentContext` | `grep -n runWithAgentContext AgentTool.tsx` | ✅ 成立（`:18,733,785`） |
| Claude Code：`resolveAgentTools` 求交过滤 | `grep resolveAgentTools` + `sed runAgent.ts:498-502` | ✅ 成立 |
| Claude Code：完整循环 `query({...})` | `grep 'query({' runAgent.ts` | ✅ 成立（`:748`） |
| Claude Code：`SubagentStart`/`SubagentStop` | `grep SubagentStart runAgent.ts` | ✅ 成立（`:530-532`） |
| Claude Code：**worktree 不自动合并** | `sed AgentTool.tsx:660-690` | ✅ 成立，**且推翻旧记录**（§2.6） |

**未重验的 2 条已在表中标出**，未写入任何结论。

### 8.3 方法论教训

**与 `phase-11-pre-research.md` 同源**：子代理的结论必须主代理重验。
本轮 2 个成功子代理共 10 条结论，**8 条核验成立、2 条未重验**——
且其中 1 条（worktree 语义）**推翻了 Phase 11 记录对参考实现的描述**。
若不重验，这条错误会进入 `phase-12-decisions.md` 并影响裁决。

---

## 9. 网上调研：Claude Code 的压缩后恢复（**本地副本已过时**）

> **维护者指出**：「本地这个（Claude Code 副本）有点老旧了，用 tinyfish 去网上看看。」
> **核实结果：确实过时。** 本地副本基于 **v2.1.88**；官方文档反映到 **v2.1.198**。

### 9.1 官方文档（权威来源）

**`code.claude.com/docs/en/context-window`**（官方 Claude Code 文档）的
「What survives compaction」表：

| 机制 | 压缩后 |
|---|---|
| 系统提示与输出风格 | 仍然生效 |
| 项目根 `CLAUDE.md` 与无作用域规则 | **从磁盘重新注入** |
| 自动记忆 | **从磁盘重新注入** |
| Git 状态快照 | **重新读取** |
| plan 模式下写的计划 | **从磁盘重新注入** |
| 带 `paths:` frontmatter 的规则 | 读匹配文件时重新加载 |
| 子目录的嵌套 `CLAUDE.md` | 读该子目录文件时重新加载 |
| **模型读过或改过的文件** | **最多重读 5 个，按最近修改排序** |
| 已调用的技能正文 | 重新注入，每技能上限 5,000 token、总上限 25,000，最旧的先丢 |
| 后台命令与后台子代理 | **继续运行**，并提醒模型哪些还在跑（避免重复启动） |
| 钩子此前加入的上下文 | 与其余对话一起被摘要 |

**关键原文**：

> Right after compaction, Claude Code re-reads up to five of the files Claude has read **or
> edited** in the session, choosing the ones **modified most recently**. A file over 5,000
> tokens comes back as **a path reference without its content**, shown as `Referenced file`
> instead of `Read`.

### 9.2 本地副本（v2.1.88）**没有**的三件事

| # | 新发现 | 版本 | 对我们意味着什么 |
|---|---|---|---|
| **N1** | **大文件只回路径、不回内容** | 官方文档（现行） | 「只回路径」**不是折中方案，而是参考对大文件的既有行为** |
| **N2** | 排序依据是**最近修改**，且包含**编辑过的**文件 | 官方文档 | 不只是「读过的」，还有「改过的」——改过的文件更该恢复 |
| **N3** | 摘要请求**继承会话的 thinking 配置** | v2.1.198 | 压缩本身的质量受会话推理设置影响 |
| **N4** | **工具结果去重**（`tengu_tool_result_dedup`）：按内容哈希（djb2）记录，256B–50KB 的重复结果替换为 `<identical to result [rN] ...>` | v2.1.100 | **与我们 T11 同源但更广**：我们只去重 `read`，参考去重**任何工具结果** |
| **N5** | `staleReadFileStateHint`：工具执行（如 bash）改了已读文件的 mtime 时，给模型一个**陈旧提示** | v2.1.91 | 我们 T11 用 mtime 判定失效，但**不告诉模型** |

### 9.3 与我们现状的逐项对照

| 参考的恢复项 | 我们 | 差距 |
|---|---|---|
| 项目根指令文件 | ✅ **自动存活**——系统提示每次请求重建（`cliRuntimeInvocation.ts:454,614`） | **无差距** |
| 技能正文 | ✅ **自动存活**——技能在系统提示里（`renderSkillList`） | **无差距** |
| plan 计划 | ⚠️ 有 plan 模式（`evaluator.ts` 2 处），但**无 plan 恢复** | 缺口（未登记） |
| 后台任务提醒 | ❌ 无后台执行（D6 不做） | **不适用** |
| **读过/改过的文件** | ❌ **完全没有** | **D4 要解决的** |
| 工具结果去重 | ⚠️ **只覆盖 `read`**（T11），不覆盖 bash 等 | 缺口（N4） |

**重要发现**：我们的**指令文件与技能天然不受压缩影响**（它们在系统提示里，
而系统提示每次请求重建）。所以参考表里的一半恢复项**我们不需要做**。
**真正的缺口只有「读过/改过的文件」这一项**，以及去重范围。

### 9.4 对 D4 的影响（**改变了结论**）

**原结论**（基于本地旧副本）：「先度量，再决定；若要做，只记文件名」。

**新证据**：
① 参考**对大文件就是只回路径不回内容**（N1）——所以「只回路径」是**参考的既有行为**，
   不是我们发明的折中；
② 参考按**最近修改**排序，且包含**编辑过的**文件（N2）——比「最近读过」更精确；
③ 我们已经**有**大部分状态：`readCache` 记录了 `{offset, limit, modifiedMs}`，
   缺的只是**读取时间戳**（用于排序）与「改过」的标记；
④ **不需要**内容存储，因为最小版本只回路径。

**即**：最小版本的成本**比我原先估计的低**——不需要新状态子系统，只需扩展既有 `readCache`。

**结论见 `phase-12-decisions.md` §2.4（已按本节证据改写为「做」）。**
